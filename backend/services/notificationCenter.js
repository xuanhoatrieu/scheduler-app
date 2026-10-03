/**
 * Trung tâm thông báo phía server (outbox → Expo Push).
 *
 * Luồng:
 *   cron đồng bộ 3h sáng ─┬─ điểm mới/đổi ───────────────► outbox (kind=grade, hiển thị, dời qua giờ yên lặng)
 *                         └─ mọi thiết bị đang hoạt động ─► outbox (kind=sync, PUSH ẨN → app tự lập lại lịch nhắc local)
 *   06:00 ─ SV có buổi học/thi hôm nay NHƯNG máy chưa cập nhật lịch nhắc sau lần lịch đổi gần nhất
 *           ─► outbox (kind=digest, hiển thị, dự phòng khi push ẩn không đánh thức được app)
 *   mỗi phút ─ worker gửi outbox; mỗi 30 phút ─ đọc receipts, vô hiệu token chết.
 *   Admin gửi thông báo ─► outbox (kind=announcement, hiển thị) cho mọi người nhận có thiết bị.
 *
 * Mọi phụ thuộc (DB, HTTP) được tiêm vào qua `repo` và `push` để unit test không cần DB/mạng.
 */
const rules = require('./notificationRules');
const { maskToken } = require('./pushService');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MAX_ATTEMPTS = 5;
const BATCH_LIMIT = 500;
// Expo: tối đa 100 tin / request → gộp tin của nhiều dòng outbox vào một request
const EXPO_REQUEST_SIZE = 100;
// Cron chạy mỗi phút → mỗi lượt xả tối đa ~45 giây (≈ hàng nghìn tin) rồi nhường lượt sau
const TIME_BUDGET_MS = 45 * 1000;
const MAX_BATCHES_PER_RUN = 40;
// App lập lịch nhắc 7 ngày tới → quá 6 ngày chưa đồng bộ thì ngày hôm nay có thể chưa có lịch nhắc
const STALE_SYNC_MS = 6 * DAY;

const vnDateKey = (now) => {
  const p = rules.vnParts(now);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};

/**
 * Máy này có cần bản tin sáng dự phòng không?
 * Cần khi: chưa từng lập lịch nhắc / lập trước lần lịch đổi gần nhất / quá lâu chưa lập lại.
 */
const deviceNeedsFallback = (device, state, now) => {
  const synced = device && device.remindersSyncedAt ? new Date(device.remindersSyncedAt).getTime() : 0;
  if (!synced) return true;
  if (state && state.scheduleChangedAt && synced < new Date(state.scheduleChangedAt).getTime()) return true;
  return now.getTime() - synced > STALE_SYNC_MS;
};

/**
 * Lập danh sách bản tin sáng (HÀM THUẦN).
 * @param {Array<{ userId, schedule, exams, state, devices }>} students
 */
const planMorningDigests = (students, now = new Date()) => {
  const out = [];
  const dateKey = vnDateKey(now);
  const p = rules.vnParts(now);
  const expiresAt = rules.vnTime(p.y, p.m, p.d, 11, 0); // quá trưa thì không còn ý nghĩa
  for (const s of students || []) {
    const devices = (s.devices || []).filter((d) => deviceNeedsFallback(d, s.state, now));
    if (devices.length === 0) continue;
    const msg = rules.buildDigestMessage(rules.sessionsOnDay(s.schedule, now), rules.examsOnDay(s.exams, now));
    if (!msg) continue; // không có buổi học / buổi thi thật → KHÔNG báo
    out.push({
      dedupeKey: `digest:${dateKey}:${s.userId}`,
      userId: s.userId,
      kind: 'digest',
      silent: false,
      title: msg.title,
      body: msg.body,
      data: { date: dateKey },
      targetTokens: devices.map((d) => d.token),
      notBefore: now,
      expiresAt
    });
  }
  return out;
};

const createNotificationCenter = ({ repo, push, log = console } = {}) => {
  let processing = false;
  let checkingReceipts = false;

  /** Ghi sự kiện vào outbox; trùng dedupeKey → bỏ qua (idempotent) */
  const enqueue = async (evt) => {
    const created = await repo.insertOutboxIfAbsent({
      dedupeKey: evt.dedupeKey,
      userId: evt.userId,
      kind: evt.kind,
      silent: !!evt.silent,
      title: evt.title || null,
      body: evt.body || null,
      data: JSON.stringify(evt.data || {}),
      targetTokens: evt.targetTokens ? JSON.stringify(evt.targetTokens) : null,
      status: 'pending',
      attempts: 0,
      notBefore: evt.notBefore,
      expiresAt: evt.expiresAt
    });
    return !!created;
  };

  /** Sinh viên có điểm mới / điểm đổi → một push gộp (không ghi số điểm) */
  const enqueueGradeEvents = async (userId, events, now = new Date()) => {
    const msg = rules.buildGradeMessage(events);
    if (!msg) return false;
    return enqueue({
      dedupeKey: rules.gradeDedupeKey(userId, events),
      userId,
      kind: 'grade',
      silent: false,
      title: msg.title,
      body: msg.body,
      data: { count: events.length },
      notBefore: rules.nextAllowedSendTime(now),
      expiresAt: new Date(now.getTime() + 3 * DAY)
    });
  };

  /** Push ẩn hằng ngày: app thức dậy, tải lịch mới nhất, lập lại lịch nhắc local */
  const enqueueDailySync = async (userIds, now = new Date()) => {
    const dateKey = vnDateKey(now);
    let n = 0;
    for (const userId of new Set(userIds || [])) {
      const created = await enqueue({
        dedupeKey: `sync:${dateKey}:${userId}`,
        userId,
        kind: 'sync',
        silent: true,
        data: { date: dateKey },
        notBefore: now,
        expiresAt: new Date(now.getTime() + 20 * HOUR)
      });
      if (created) n++;
    }
    return n;
  };

  const enqueueMorningDigests = async (now = new Date()) => {
    const students = await repo.loadDigestCandidates(now);
    const plan = planMorningDigests(students, now);
    let n = 0;
    for (const evt of plan) if (await enqueue(evt)) n++;
    return n;
  };

  /** Ghi kết quả ticket của một dòng outbox */
  const settleRow = async (row, tokens, tickets, now, stats) => {
    const r = rules.interpretTickets(tokens, tickets);
    if (r.deadTokens.length) await repo.deactivateTokens(r.deadTokens);
    if (r.retryTokens.length && r.okTickets.length === 0) {
      await scheduleRetry(row, now, r.errors.join(',').slice(0, 450), stats);
      return;
    }
    await repo.updateOutbox(row.id, {
      status: r.okTickets.length ? 'sent' : 'skipped',
      sentAt: now,
      attempts: (row.attempts || 0) + 1,
      tickets: JSON.stringify(r.okTickets),
      lastError: r.errors.length ? r.errors.join(',').slice(0, 450) : null
    });
    if (r.okTickets.length) stats.sent++; else stats.skipped++;
  };

  /** Xử lý một lô dòng outbox: lọc, dựng tin, gộp nhiều dòng vào mỗi request Expo (≤ 100 tin) */
  const processBatch = async (rows, now, stats) => {
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const [tokensByUser, usersById] = await Promise.all([
      repo.activeDevicesByUser(userIds),
      repo.usersByIds(userIds)
    ]);

    const ready = []; // { row, tokens, messages }
    for (const row of rows) {
      if (new Date(row.expiresAt).getTime() <= now.getTime()) {
        await repo.updateOutbox(row.id, { status: 'dead', lastError: 'expired' });
        stats.dead++;
        continue;
      }
      const user = usersById.get(row.userId);
      const owner = rules.ownerKeyOf(user);
      let tokens = (tokensByUser.get(row.userId) || []).map((d) => d.token);
      if (row.targetTokens) {
        let wanted = [];
        try { wanted = JSON.parse(row.targetTokens) || []; } catch (e) { wanted = []; }
        // Chỉ gửi tới token VẪN thuộc đúng user này (máy có thể đã đổi tài khoản từ lúc lập lịch)
        tokens = tokens.filter((t) => wanted.includes(t));
      }
      if (!owner || tokens.length === 0) {
        await repo.updateOutbox(row.id, { status: 'skipped', lastError: owner ? 'no-device' : 'no-user' });
        stats.skipped++;
        continue;
      }
      ready.push({ row, tokens, messages: rules.buildExpoMessages(row, tokens, owner) });
    }

    // Gộp nguyên dòng vào nhóm ≤ EXPO_REQUEST_SIZE tin (một dòng tối đa 10 thiết bị nên luôn vừa)
    const groups = [];
    let current = [];
    let size = 0;
    for (const item of ready) {
      if (size + item.messages.length > EXPO_REQUEST_SIZE && current.length) {
        groups.push(current);
        current = [];
        size = 0;
      }
      current.push(item);
      size += item.messages.length;
    }
    if (current.length) groups.push(current);

    for (const group of groups) {
      const messages = group.flatMap((g) => g.messages);
      let tickets;
      try {
        tickets = await push.sendMessages(messages);
      } catch (err) {
        const msg = String(err && err.message || err).slice(0, 450);
        for (const g of group) await scheduleRetry(g.row, now, msg, stats);
        continue;
      }
      let offset = 0;
      for (const g of group) {
        const slice = (tickets || []).slice(offset, offset + g.messages.length);
        offset += g.messages.length;
        await settleRow(g.row, g.tokens, slice, now, stats);
      }
    }
  };

  /** Gửi các sự kiện đến hạn (lặp nhiều lô trong giới hạn thời gian để xả nhanh thông báo toàn trường) */
  const processOutbox = async (now = new Date(), { timeBudgetMs = TIME_BUDGET_MS } = {}) => {
    if (processing) return { skipped: true };
    processing = true;
    const stats = { sent: 0, skipped: 0, retried: 0, dead: 0 };
    const startedAt = Date.now();
    try {
      for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
        const rows = await repo.fetchDueOutbox(now, BATCH_LIMIT);
        if (rows.length === 0) break;
        await processBatch(rows, now, stats);
        if (rows.length < BATCH_LIMIT || Date.now() - startedAt > timeBudgetMs) break;
      }
      return stats;
    } finally {
      processing = false;
    }
  };

  const scheduleRetry = async (row, now, error, stats) => {
    const attempts = (row.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await repo.updateOutbox(row.id, { status: 'dead', attempts, lastError: error });
      stats.dead++;
      log.warn(`🔕 [Push] Bỏ sự kiện ${row.kind} sau ${attempts} lần lỗi: ${error}`);
    } else {
      await repo.updateOutbox(row.id, { attempts, lastError: error, notBefore: new Date(now.getTime() + rules.retryDelayMs(attempts)) });
      stats.retried++;
    }
  };

  /** Đọc receipts (Expo trả sau 15–30 phút): token chết → vô hiệu để không gửi nữa */
  const checkReceipts = async (now = new Date()) => {
    if (checkingReceipts) return { skipped: true };
    checkingReceipts = true;
    try {
      const rows = await repo.fetchSentAwaitingReceipts(new Date(now.getTime() - 15 * 60 * 1000), 200);
      const ticketMap = new Map();
      for (const row of rows) {
        let list = [];
        try { list = JSON.parse(row.tickets || '[]') || []; } catch (e) { list = []; }
        for (const t of list) if (t && t.id) ticketMap.set(t.id, t.token);
      }
      let dead = [];
      if (ticketMap.size > 0) {
        const receipts = await push.getReceipts([...ticketMap.keys()]);
        for (const [id, rec] of Object.entries(receipts || {})) {
          if (rec && rec.status === 'error' && rec.details && rec.details.error === 'DeviceNotRegistered') {
            const token = ticketMap.get(id);
            if (token) dead.push(token);
          } else if (rec && rec.status === 'error') {
            log.warn(`🔕 [Push] Receipt lỗi (${rec.details && rec.details.error}) cho ${maskToken(ticketMap.get(id))}`);
          }
        }
        dead = [...new Set(dead)];
        if (dead.length) await repo.deactivateTokens(dead);
      }
      for (const row of rows) await repo.updateOutbox(row.id, { receiptsCheckedAt: now });
      return { checked: rows.length, deactivated: dead.length };
    } finally {
      checkingReceipts = false;
    }
  };

  return { enqueue, enqueueGradeEvents, enqueueDailySync, enqueueMorningDigests, processOutbox, checkReceipts };
};

module.exports = { createNotificationCenter, planMorningDigests, deviceNeedsFallback, MAX_ATTEMPTS, BATCH_LIMIT, EXPO_REQUEST_SIZE };
