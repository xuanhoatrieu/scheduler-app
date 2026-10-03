// Chạy: cd backend && npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../services/announcementRules');
const { createAnnouncementService } = require('../services/announcementService');
const { createNotificationCenter, BATCH_LIMIT, EXPO_REQUEST_SIZE } = require('../services/notificationCenter');
const { vnTime } = require('../services/notificationRules');

const silentLog = { warn: () => {}, log: () => {} };
const tok = (i) => `ExponentPushToken[tok${String(i).padStart(12, '0')}]`;

// ───────────── Kiểm tra đầu vào ─────────────

test('validate: chấp nhận đầu vào hợp lệ, chuẩn hóa khoảng trắng + bỏ ký tự điều khiển', () => {
  const v = rules.validateAnnouncementInput({
    title: '  Lịch\u0000 nghỉ   lễ ',
    body: 'Dòng 1  \r\n\r\n\r\n\r\nDòng 2\u202E',
    audience: { type: 'cohorts', cohorts: ['56', 57, 57] },
    urgent: 'true'
  });
  assert.equal(v.ok, true);
  assert.equal(v.value.title, 'Lịch nghỉ lễ');
  assert.equal(v.value.body, 'Dòng 1\n\nDòng 2');
  assert.deepEqual(v.value.audience, { type: 'cohorts', cohorts: [57, 56] });
  assert.equal(v.value.senderLabel, 'Nhà trường');
  assert.equal(v.value.urgent, false); // chỉ true thật mới là khẩn
});

test('validate: từ chối loại đối tượng lạ, thiếu tiêu đề, nội dung quá dài', () => {
  assert.equal(rules.validateAnnouncementInput({ title: 'a', body: 'b', audience: { type: 'admins' } }).ok, false);
  assert.equal(rules.validateAnnouncementInput({ title: ' ', body: 'b', audience: { type: 'all' } }).ok, false);
  const long = rules.validateAnnouncementInput({ title: 'a', body: 'x'.repeat(rules.LIMITS.body + 1), audience: { type: 'all' } });
  assert.equal(long.ok, false);
  assert.equal(rules.validateAnnouncementInput({ title: 'a', body: 'b', audience: null }).ok, false);
});

test('validate: tài khoản chứa ký tự lạ (thử chèn SQL) bị từ chối; Khóa/lớp phải là số nguyên', () => {
  const inj = rules.validateAnnouncementInput({ title: 'a', body: 'b', audience: { type: 'users', usernames: "DTN1, x'); DROP TABLE Users;--" } });
  assert.equal(inj.ok, false);
  assert.equal(rules.validateAnnouncementInput({ title: 'a', body: 'b', audience: { type: 'cohorts', cohorts: ['56 OR 1=1'] } }).ok, false);
  assert.equal(rules.validateAnnouncementInput({ title: 'a', body: 'b', audience: { type: 'cohorts', cohorts: [0] } }).ok, false);
  assert.equal(rules.validateAnnouncementInput({ title: 'a', body: 'b', audience: { type: 'cohorts', cohorts: [999] } }).ok, false);
  assert.equal(rules.validateAnnouncementInput({ title: 'a', body: 'b', audience: { type: 'classes', classIds: [1.5] } }).ok, false);
  assert.equal(rules.validateAnnouncementInput({ title: 'a', body: 'b', audience: { type: 'classes', classIds: [] } }).ok, false);
  const many = Array.from({ length: rules.LIMITS.cohorts + 1 }, (_, i) => i + 1);
  assert.equal(rules.validateAnnouncementInput({ title: 'a', body: 'b', audience: { type: 'cohorts', cohorts: many } }).ok, false);
});

test('validate: danh sách tài khoản tách theo dấu phẩy / xuống dòng, khử trùng lặp', () => {
  const v = rules.validateAnnouncementInput({ title: 'a', body: 'b', audience: { type: 'users', usernames: 'DTN1,dtn2\nDTN1  GV01' } });
  assert.equal(v.ok, true);
  assert.deepEqual(v.value.audience.usernames, ['DTN1', 'dtn2', 'GV01']);
});

test('buildPushBody: banner ngắn gọn, không vượt giới hạn', () => {
  const b = rules.buildPushBody('a\n'.repeat(500));
  assert.ok(b.length <= rules.LIMITS.pushBody);
  assert.ok(b.endsWith('…'));
  assert.equal(rules.buildPushBody('Ngắn'), 'Ngắn');
});

test('isValidClassKeyword / isUuid', () => {
  assert.equal(rules.isValidClassKeyword('CNTY 58'), true);
  assert.equal(rules.isValidClassKeyword('%'), false);
  assert.equal(rules.isValidClassKeyword("x' OR '1'='1"), false);
  assert.equal(rules.isUuid('3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f'), true);
  assert.equal(rules.isUuid('1 OR 1=1'), false);
});

// ───────────── Dịch vụ gửi ─────────────

const USERS = [
  { id: 'u1', username: 'DTN001', role: 'student' },
  { id: 'u2', username: 'dtn002', role: 'student' },
  { id: 'u3', username: 'GV01', role: 'lecturer' },
  { id: 'u4', username: 'TT01', role: 'inspector' }
];

const makeAnnRepo = ({ devices = ['u1', 'u3'], leakyRoles = false } = {}) => {
  const saved = [];
  return {
    saved,
    // leakyRoles: giả lập repo lỗi trả cả vai trò không thuộc đối tượng → dịch vụ phải tự lọc
    findUsersByRoles: async (roles) => USERS.filter((u) => leakyRoles || roles.includes(u.role)),
    findUsersByUsernames: async (names, roles) => {
      const lower = names.map((n) => n.toLowerCase());
      return USERS.filter((u) => lower.includes(u.username.toLowerCase()) && (leakyRoles || roles.includes(u.role)));
    },
    userIdsWithActiveDevice: async (ids) => new Set(ids.filter((id) => devices.includes(id))),
    persistAnnouncement: async (payload) => { saved.push(payload); }
  };
};

const directory = {
  activeStudentCodes: async ({ cohorts, classIds }) => (cohorts ? ['DTN001', 'DTN002', 'DTN999'] : classIds ? ['dtn001'] : []),
  classLabels: async (ids) => ids.map((id) => ({ idLop: id, className: `Lớp ${id}` }))
};

const input = (audience, extra = {}) => rules.validateAnnouncementInput({ title: 'Tiêu đề', body: 'Nội dung', audience, ...extra }).value;

test('preview "users": báo tài khoản chưa dùng app; KHÔNG gửi cho thanh tra dù nhập đúng tên', async () => {
  const s = createAnnouncementService({ repo: makeAnnRepo(), directory });
  const p = await s.preview(input({ type: 'users', usernames: 'dtn001, GV01, TT01, KHONGCO' }));
  assert.equal(p.recipients, 2);
  assert.equal(p.students, 1);
  assert.equal(p.lecturers, 1);
  assert.deepEqual(p.notFound.sort(), ['KHONGCO', 'TT01']);
});

test('lecturers: repo lỗi trả cả sinh viên → dịch vụ vẫn chỉ giữ giảng viên', async () => {
  const s = createAnnouncementService({ repo: makeAnnRepo({ leakyRoles: true }), directory });
  const r = await s.resolveAudience({ type: 'lecturers' });
  assert.deepEqual(r.users.map((u) => u.id), ['u3']);
});

test('cohorts: lấy MSSV đang học từ CSDL trường rồi giao với tài khoản app (không phân biệt hoa thường)', async () => {
  const s = createAnnouncementService({ repo: makeAnnRepo(), directory });
  const p = await s.preview(input({ type: 'cohorts', cohorts: [56] }));
  assert.equal(p.sourceCount, 3);
  assert.equal(p.recipients, 2);
  assert.equal(p.label, 'Khóa 56');
  const c = await s.preview(input({ type: 'classes', classIds: [7] }));
  assert.equal(c.recipients, 1);
  assert.equal(c.label, 'Lớp Lớp 7');
});

test('send: hộp thư cho MỌI người nhận, outbox push chỉ cho người có thiết bị; 23h → dời 06:30', async () => {
  const repo = makeAnnRepo();
  const s = createAnnouncementService({ repo, directory });
  const now = vnTime(2026, 10, 7, 23);
  const r = await s.send(input({ type: 'all' }), { ip: '10.0.0.1', now });
  assert.equal(r.ok, true);
  const [saved] = repo.saved;
  assert.deepEqual(saved.userIds.sort(), ['u1', 'u2', 'u3']);
  assert.deepEqual(saved.outboxRows.map((o) => o.userId).sort(), ['u1', 'u3']);
  assert.ok(saved.outboxRows.every((o) => o.kind === 'announcement' && o.silent === false));
  assert.ok(saved.outboxRows.every((o) => o.dedupeKey === `ann:${r.id}:${o.userId}`));
  assert.equal(new Date(saved.outboxRows[0].notBefore).getTime(), vnTime(2026, 10, 8, 6, 30).getTime());
  assert.equal(JSON.parse(saved.outboxRows[0].data).announcementId, r.id);
  assert.equal(saved.announcement.recipientCount, 3);
  assert.equal(saved.announcement.deviceUserCount, 2);
  assert.equal(saved.announcement.createdByIp, '10.0.0.1');
});

test('send khẩn: gửi ngay cả giờ yên lặng', async () => {
  const repo = makeAnnRepo();
  const s = createAnnouncementService({ repo, directory });
  const now = vnTime(2026, 10, 7, 23);
  await s.send(input({ type: 'students' }, { urgent: true }), { now });
  assert.equal(new Date(repo.saved[0].outboxRows[0].notBefore).getTime(), now.getTime());
});

test('send: không có người nhận → không ghi gì', async () => {
  const repo = makeAnnRepo();
  const s = createAnnouncementService({ repo, directory });
  const r = await s.send(input({ type: 'users', usernames: 'KHONGCO' }));
  assert.equal(r.ok, false);
  assert.equal(repo.saved.length, 0);
});

// ───────────── Gửi hàng loạt qua outbox ─────────────

const makeOutboxRepo = (n) => {
  const outbox = new Map();
  const users = [];
  const devices = [];
  const now = vnTime(2026, 10, 7, 10);
  for (let i = 0; i < n; i++) {
    users.push({ id: `u${i}`, username: `sv${i}`, role: 'student' });
    devices.push({ userId: `u${i}`, token: tok(i), active: true });
    outbox.set(`o${i}`, {
      id: `o${i}`, dedupeKey: `ann:a:u${i}`, userId: `u${i}`, kind: 'announcement', silent: false,
      title: 'T', body: 'B', data: '{"announcementId":"a"}', targetTokens: null,
      status: 'pending', attempts: 0, notBefore: now, expiresAt: new Date(now.getTime() + 864e5)
    });
  }
  return {
    now,
    outbox,
    devices,
    fetchDueOutbox: async (t, limit) => [...outbox.values()].filter((r) => r.status === 'pending' && new Date(r.notBefore) <= t).slice(0, limit).map((r) => ({ ...r })),
    updateOutbox: async (id, patch) => { Object.assign(outbox.get(id), patch); },
    activeDevicesByUser: async (ids) => {
      const m = new Map();
      for (const d of devices) if (d.active && ids.includes(d.userId)) m.set(d.userId, [d]);
      return m;
    },
    usersByIds: async (ids) => new Map(users.filter((u) => ids.includes(u.id)).map((u) => [u.id, u])),
    deactivateTokens: async (tokens) => { for (const d of devices) if (tokens.includes(d.token)) d.active = false; }
  };
};

test('processOutbox: gộp nhiều người vào mỗi request ≤ 100 tin, xả hết > 1 lô trong một lượt', async () => {
  const n = BATCH_LIMIT + 120;
  const repo = makeOutboxRepo(n);
  const calls = [];
  const push = { sendMessages: async (msgs) => { calls.push(msgs.length); return msgs.map((m) => ({ status: 'ok', id: `tk-${m.to}` })); } };
  const c = createNotificationCenter({ repo, push, log: silentLog });
  const stats = await c.processOutbox(repo.now);
  assert.equal(stats.sent, n);
  assert.ok(calls.every((k) => k <= EXPO_REQUEST_SIZE));
  assert.equal(calls.length, Math.ceil(BATCH_LIMIT / EXPO_REQUEST_SIZE) + Math.ceil(120 / EXPO_REQUEST_SIZE));
  // Ticket ánh xạ đúng dòng
  assert.deepEqual(JSON.parse(repo.outbox.get('o137').tickets), [{ id: `tk-${tok(137)}`, token: tok(137) }]);
  assert.ok(repo.outbox.get('o137').tickets.includes(tok(137)));
});

test('processOutbox: lỗi giữa lô chỉ ảnh hưởng đúng dòng / đúng nhóm', async () => {
  const repo = makeOutboxRepo(250);
  let call = 0;
  const push = {
    sendMessages: async (msgs) => {
      call++;
      if (call === 2) throw new Error('ECONNRESET'); // nhóm thứ 2 (u100..u199) lỗi mạng
      return msgs.map((m) => (m.to === tok(42) ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: `tk-${m.to}` }));
    }
  };
  const c = createNotificationCenter({ repo, push, log: silentLog });
  await c.processOutbox(repo.now);
  assert.equal(repo.outbox.get('o42').status, 'skipped');
  assert.equal(repo.devices[42].active, false);
  assert.equal(repo.devices[41].active, true);
  assert.equal(repo.outbox.get('o41').status, 'sent');
  assert.equal(repo.outbox.get('o43').status, 'sent');
  for (const i of [100, 150, 199]) {
    const row = repo.outbox.get(`o${i}`);
    assert.equal(row.status, 'pending');
    assert.equal(row.attempts, 1);
    assert.ok(new Date(row.notBefore) > repo.now);
  }
  assert.equal(repo.outbox.get('o200').status, 'sent');
});
