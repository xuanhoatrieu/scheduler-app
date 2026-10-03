// Chạy: cd backend && node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotificationCenter, planMorningDigests, deviceNeedsFallback, MAX_ATTEMPTS } = require('../services/notificationCenter');
const { vnTime } = require('../services/notificationRules');

const T1 = 'ExponentPushToken[aaaaaaaaaaaaaaaa]';
const T2 = 'ExponentPushToken[bbbbbbbbbbbbbbbb]';

/** Repo giả trong bộ nhớ */
const makeRepo = ({ devices = [], users = [] } = {}) => {
  const outbox = new Map();
  let seq = 0;
  return {
    outbox,
    devices,
    insertOutboxIfAbsent: async (row) => {
      for (const r of outbox.values()) if (r.dedupeKey === row.dedupeKey) return false;
      const id = `o${++seq}`;
      outbox.set(id, { ...row, id, createdAt: new Date() });
      return true;
    },
    fetchDueOutbox: async (now, limit = Infinity) => [...outbox.values()].filter((r) => r.status === 'pending' && new Date(r.notBefore) <= now).slice(0, limit).map((r) => ({ ...r })),
    updateOutbox: async (id, patch) => { Object.assign(outbox.get(id), patch); },
    activeDevicesByUser: async (ids) => {
      const m = new Map();
      for (const d of devices) if (d.active && ids.includes(d.userId)) { if (!m.has(d.userId)) m.set(d.userId, []); m.get(d.userId).push(d); }
      return m;
    },
    usersByIds: async (ids) => new Map(users.filter((u) => ids.includes(u.id)).map((u) => [u.id, u])),
    deactivateTokens: async (tokens) => { for (const d of devices) if (tokens.includes(d.token)) d.active = false; },
    fetchSentAwaitingReceipts: async (before) => [...outbox.values()].filter((r) => r.status === 'sent' && !r.receiptsCheckedAt && r.sentAt <= before)
  };
};

const silentLog = { warn: () => {}, log: () => {} };

test('enqueueGradeEvents: idempotent + dời sang 06:30 khi cron chạy lúc 3h', async () => {
  const repo = makeRepo();
  const c = createNotificationCenter({ repo, push: {}, log: silentLog });
  const events = [{ type: 'new', key: 'mh1', courseName: 'Hóa', fingerprint: 'x' }];
  const at3am = vnTime(2026, 10, 7, 3);
  assert.equal(await c.enqueueGradeEvents('u1', events, at3am), true);
  assert.equal(await c.enqueueGradeEvents('u1', events, at3am), false); // chạy lại cron → không trùng
  const [row] = [...repo.outbox.values()];
  assert.equal(new Date(row.notBefore).getTime(), vnTime(2026, 10, 7, 6, 30).getTime());
  assert.doesNotMatch(row.body, /\d+\.\d/);
});

test('processOutbox: gửi đúng thiết bị của user, kèm owner; token chết bị vô hiệu', async () => {
  const devices = [
    { userId: 'u1', token: T1, active: true },
    { userId: 'u1', token: T2, active: true },
    { userId: 'u2', token: 'ExponentPushToken[cccccccccccccccc]', active: true }
  ];
  const repo = makeRepo({ devices, users: [{ id: 'u1', username: 'sv1', role: 'student' }] });
  const sent = [];
  const push = {
    sendMessages: async (msgs) => { sent.push(...msgs); return msgs.map((m) => (m.to === T2 ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: `tk-${m.to}` })); }
  };
  const c = createNotificationCenter({ repo, push, log: silentLog });
  const now = vnTime(2026, 10, 7, 10);
  await c.enqueueGradeEvents('u1', [{ type: 'new', key: 'k', courseName: 'A', fingerprint: 'f' }], now);
  const stats = await c.processOutbox(now);
  assert.equal(stats.sent, 1);
  assert.deepEqual(sent.map((m) => m.to).sort(), [T1, T2].sort());
  assert.ok(sent.every((m) => m.data.owner === 'sv1|student'));
  assert.equal(devices.find((d) => d.token === T2).active, false);
  assert.equal(devices[2].active, true); // thiết bị của người khác không bị đụng
  const [row] = [...repo.outbox.values()];
  assert.equal(row.status, 'sent');
  assert.deepEqual(JSON.parse(row.tickets), [{ id: `tk-${T1}`, token: T1 }]);
});

test('processOutbox: chưa tới giờ (giờ yên lặng) → chưa gửi', async () => {
  const repo = makeRepo({ devices: [{ userId: 'u1', token: T1, active: true }], users: [{ id: 'u1', username: 'sv1', role: 'student' }] });
  let calls = 0;
  const c = createNotificationCenter({ repo, push: { sendMessages: async (m) => { calls++; return m.map(() => ({ status: 'ok', id: 'x' })); } }, log: silentLog });
  await c.enqueueGradeEvents('u1', [{ type: 'new', key: 'k', courseName: 'A', fingerprint: 'f' }], vnTime(2026, 10, 7, 3));
  await c.processOutbox(vnTime(2026, 10, 7, 4));
  assert.equal(calls, 0);
  await c.processOutbox(vnTime(2026, 10, 7, 6, 31));
  assert.equal(calls, 1);
});

test('processOutbox: không có thiết bị → skipped, không gọi Expo', async () => {
  const repo = makeRepo({ users: [{ id: 'u1', username: 'sv1', role: 'student' }] });
  let calls = 0;
  const c = createNotificationCenter({ repo, push: { sendMessages: async () => { calls++; return []; } }, log: silentLog });
  const now = vnTime(2026, 10, 7, 10);
  await c.enqueueDailySync(['u1'], now);
  await c.processOutbox(now);
  assert.equal(calls, 0);
  assert.equal([...repo.outbox.values()][0].status, 'skipped');
});

test('processOutbox: lỗi mạng → thử lại có giãn cách, quá MAX_ATTEMPTS → dead', async () => {
  const repo = makeRepo({ devices: [{ userId: 'u1', token: T1, active: true }], users: [{ id: 'u1', username: 'sv1', role: 'student' }] });
  const c = createNotificationCenter({ repo, push: { sendMessages: async () => { throw new Error('ECONNRESET'); } }, log: silentLog });
  let now = vnTime(2026, 10, 7, 10);
  await c.enqueueDailySync(['u1'], now);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await c.processOutbox(now);
    now = new Date(now.getTime() + 61 * 60 * 1000);
  }
  const [row] = [...repo.outbox.values()];
  assert.equal(row.status, 'dead');
  assert.equal(row.attempts, MAX_ATTEMPTS);
});

test('processOutbox: sự kiện quá hạn → dead, không gửi', async () => {
  const repo = makeRepo({ devices: [{ userId: 'u1', token: T1, active: true }], users: [{ id: 'u1', username: 'sv1', role: 'student' }] });
  let calls = 0;
  const c = createNotificationCenter({ repo, push: { sendMessages: async (m) => { calls++; return m.map(() => ({ status: 'ok', id: 'x' })); } }, log: silentLog });
  const now = vnTime(2026, 10, 7, 3);
  await c.enqueueDailySync(['u1'], now);
  await c.processOutbox(new Date(now.getTime() + 21 * 60 * 60 * 1000));
  assert.equal(calls, 0);
  assert.equal([...repo.outbox.values()][0].status, 'dead');
});

test('targetTokens: máy đã chuyển sang tài khoản khác thì KHÔNG nhận bản tin của tài khoản cũ; máy không được nhắm cũng không nhận', async () => {
  // Bản tin lập cho u1 nhắm T2 (máy cũ), nhưng T2 giờ thuộc u2. T1 của u1 đã cập nhật nên không được nhắm.
  const repo = makeRepo({
    devices: [{ userId: 'u1', token: T1, active: true }, { userId: 'u2', token: T2, active: true }],
    users: [{ id: 'u1', username: 'sv1', role: 'student' }]
  });
  let calls = 0;
  const c = createNotificationCenter({ repo, push: { sendMessages: async (m) => { calls++; return m.map(() => ({ status: 'ok', id: 'x' })); } }, log: silentLog });
  const now = vnTime(2026, 10, 7, 6);
  await c.enqueue({ dedupeKey: 'digest:x:u1', userId: 'u1', kind: 'digest', title: 't', body: 'b', targetTokens: [T2], notBefore: now, expiresAt: vnTime(2026, 10, 7, 11) });
  await c.processOutbox(now);
  assert.equal(calls, 0);
  assert.equal([...repo.outbox.values()][0].status, 'skipped');
});

test('checkReceipts: DeviceNotRegistered trong receipt → vô hiệu token', async () => {
  const devices = [{ userId: 'u1', token: T1, active: true }];
  const repo = makeRepo({ devices, users: [{ id: 'u1', username: 'sv1', role: 'student' }] });
  const push = {
    sendMessages: async (m) => m.map(() => ({ status: 'ok', id: 'tk1' })),
    getReceipts: async () => ({ tk1: { status: 'error', details: { error: 'DeviceNotRegistered' } } })
  };
  const c = createNotificationCenter({ repo, push, log: silentLog });
  const now = vnTime(2026, 10, 7, 10);
  await c.enqueueDailySync(['u1'], now);
  await c.processOutbox(now);
  const r = await c.checkReceipts(new Date(now.getTime() + 20 * 60 * 1000));
  assert.equal(r.deactivated, 1);
  assert.equal(devices[0].active, false);
});

test('planMorningDigests: chỉ gửi khi CÓ buổi học hôm nay VÀ máy chưa cập nhật lịch nhắc', () => {
  const now = vnTime(2026, 10, 7, 6); // Thứ Tư
  const schedule = [{ courseName: 'Tin học', classCode: 'TH1', studyTime: '05/10 - 11/10', dayOfWeek: 4, periodText: '1-3', room: 'A1', schoolYear: '2026-2027' }];
  const changedAt = vnTime(2026, 10, 7, 3, 5);
  const fresh = { token: T1, remindersSyncedAt: vnTime(2026, 10, 7, 3, 20) }; // đã thức dậy nhờ push ẩn
  const stale = { token: T2, remindersSyncedAt: vnTime(2026, 10, 6, 20) }; // cập nhật trước lúc lịch đổi
  const plan = planMorningDigests([
    { userId: 'u1', schedule, exams: [], state: { scheduleChangedAt: changedAt }, devices: [fresh, stale] },
    // Hôm nay không có buổi học → không báo dù máy cũ
    { userId: 'u2', schedule: [{ ...schedule[0], dayOfWeek: 5 }], exams: [], state: null, devices: [{ token: 'ExponentPushToken[dddddddddddddddd]', remindersSyncedAt: null }] },
    // Máy đã cập nhật → không cần bản tin
    { userId: 'u3', schedule, exams: [], state: { scheduleChangedAt: changedAt }, devices: [fresh] }
  ], now);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].userId, 'u1');
  assert.deepEqual(plan[0].targetTokens, [T2]);
  assert.match(plan[0].body, /Tiết 1-3: Tin học/);
});

test('deviceNeedsFallback: quá 6 ngày chưa lập lịch nhắc → cần', () => {
  const now = vnTime(2026, 10, 7, 6);
  assert.equal(deviceNeedsFallback({ remindersSyncedAt: vnTime(2026, 10, 6, 6) }, null, now), false);
  assert.equal(deviceNeedsFallback({ remindersSyncedAt: vnTime(2026, 9, 30, 6) }, null, now), true);
  assert.equal(deviceNeedsFallback({ remindersSyncedAt: null }, null, now), true);
});
