/**
 * Quy tắc thông báo phía server — HÀM THUẦN (không đụng DB / mạng) để unit test được.
 *
 * Nguyên tắc chung (fail-closed): chỉ sinh thông báo khi CÓ SỰ KIỆN THẬT và đọc chắc được dữ liệu.
 * Dữ liệu mơ hồ / đồng bộ lại hàng loạt → không báo.
 *
 * Toàn bộ ngày giờ tính theo giờ Việt Nam (UTC+7, không có giờ mùa hè), không phụ thuộc TZ của container.
 */
const crypto = require('crypto');

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════
// NGÀY GIỜ VIỆT NAM
// ═══════════════════════════════════════

/** Thành phần ngày giờ VN của một thời điểm */
const vnParts = (date = new Date()) => {
  const d = new Date(date.getTime() + VN_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    dow: d.getUTCDay(), // 0 = Chủ nhật
    h: d.getUTCHours(),
    min: d.getUTCMinutes()
  };
};

/** Số thứ tự ngày (để so sánh ngày, không dính giờ) */
const dayNumber = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);

const vnDayNumber = (date = new Date()) => {
  const p = vnParts(date);
  return dayNumber(p.y, p.m, p.d);
};

/** Thời điểm tuyệt đối ứng với giờ VN y-m-d h:min */
const vnTime = (y, m, d, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min) - VN_OFFSET_MS);

/** Thứ theo chuẩn TUAF (2 = Thứ Hai ... 8 = Chủ Nhật) */
const tuafDayOfWeek = (date = new Date()) => {
  const dow = vnParts(date).dow;
  return dow === 0 ? 8 : dow + 1;
};

// ═══════════════════════════════════════
// LỊCH HỌC / LỊCH THI (port từ mobile/utils/scheduleDate.js)
// ═══════════════════════════════════════

const PERIOD_START = {
  1: '07:00', 2: '07:55', 3: '08:50', 4: '09:55', 5: '10:50',
  6: '13:15', 7: '14:10', 8: '15:15', 9: '16:10', 10: '17:05',
  11: '18:00', 12: '18:50', 13: '19:40', 14: '20:30', 15: '21:15'
};

/** "1-3", "Tiết 6-10" → { start, end } | null. Chỉ nhận tiết 1..15 */
const parsePeriodRange = (periodText) => {
  if (periodText === null || periodText === undefined) return null;
  const m = String(periodText).match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  if (!PERIOD_START[start] || !PERIOD_START[end] || end < start) return null;
  return { start, end };
};

/**
 * Giai đoạn học "dd/MM - dd/MM" | "dd/MM/yyyy - dd/MM/yyyy" | "yyyy-MM-dd" → { startDay, endDay } | null
 * Ngày thiếu năm suy theo năm học: tháng >= 8 thuộc năm đầu, tháng < 8 thuộc năm sau.
 */
const parseStudyTimeDays = (studyTime, schoolYear) => {
  if (!studyTime || typeof studyTime !== 'string') return null;
  const trimmed = studyTime.trim();
  if (!trimmed) return null;

  const baseYear = parseInt(String(schoolYear || '').replace('_', '-').split('-')[0], 10) || vnParts().y;

  const parseOne = (str, startParsed = null) => {
    if (!str) return null;
    const s = str.trim();
    const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return { y: +iso[1], m: +iso[2], d: +iso[3] };
    const full = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (full) return { y: +full[3], m: +full[2], d: +full[1] };
    const short = s.match(/(\d{1,2})\/(\d{1,2})/);
    if (short) {
      const d = +short[1];
      const m = +short[2];
      let y;
      if (startParsed) y = m < startParsed.m ? startParsed.y + 1 : startParsed.y;
      else y = m >= 8 ? baseYear : baseYear + 1;
      return { y, m, d };
    }
    return null;
  };

  let parts = [];
  if (trimmed.includes('->')) parts = trimmed.split('->');
  else if (trimmed.includes('đến')) parts = trimmed.split('đến');
  else if (trimmed.includes(' - ')) parts = trimmed.split(' - ');
  else if (/^\d{1,2}\/\d{1,2}(\/\d{4})?\s*-\s*\d{1,2}\/\d{1,2}/.test(trimmed)) parts = trimmed.split('-');

  const valid = (p) => p && p.m >= 1 && p.m <= 12 && p.d >= 1 && p.d <= 31;
  if (parts.length >= 2) {
    const a = parseOne(parts[0]);
    const b = parseOne(parts[1], a);
    if (valid(a) && valid(b)) return { startDay: dayNumber(a.y, a.m, a.d), endDay: dayNumber(b.y, b.m, b.d) };
    return null;
  }
  const single = parseOne(trimmed);
  if (valid(single)) {
    const n = dayNumber(single.y, single.m, single.d);
    return { startDay: n, endDay: n };
  }
  return null;
};

/** Ngày thi "d/m/yyyy" | "yyyy-mm-dd" → số ngày | null (bắt buộc có năm) */
const parseExamDay = (str) => {
  if (!str) return null;
  const s = String(str);
  const dmy = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return dayNumber(+dmy[3], +dmy[2], +dmy[1]);
  const ymd = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymd) return dayNumber(+ymd[1], +ymd[2], +ymd[3]);
  return null;
};

/** Các buổi học THẬT trong ngày (giờ VN) của thời điểm `date` */
const sessionsOnDay = (scheduleRows, date = new Date()) => {
  if (!Array.isArray(scheduleRows)) return [];
  const today = vnDayNumber(date);
  const dow = tuafDayOfWeek(date);
  const seen = new Set();
  const out = [];
  for (const r of scheduleRows) {
    if (!r || !r.courseName) continue;
    if (parseInt(r.dayOfWeek, 10) !== dow) continue;
    const range = parseStudyTimeDays(r.studyTime, r.schoolYear);
    if (!range || today < range.startDay || today > range.endDay) continue;
    const period = parsePeriodRange(r.periodText);
    if (!period) continue;
    const key = `${period.start}|${String(r.classCode || r.courseName).trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      courseName: r.courseName,
      periodText: `${period.start}-${period.end}`,
      startTime: PERIOD_START[period.start],
      room: String(r.room || '').trim()
    });
  }
  return out.sort((a, b) => a.startTime.localeCompare(b.startTime));
};

/** Các môn thi THẬT trong ngày (giờ VN) */
const examsOnDay = (examRows, date = new Date()) => {
  if (!Array.isArray(examRows)) return [];
  const today = vnDayNumber(date);
  const seen = new Set();
  const out = [];
  for (const e of examRows) {
    if (!e || !e.courseName) continue;
    if (parseExamDay(e.examDate) !== today) continue;
    const key = String(e.courseName).trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ courseName: e.courseName, examTime: String(e.examTime || '').trim(), room: String(e.room || '').trim() });
  }
  return out;
};

/** Bản tin buổi sáng: chỉ tạo khi THỰC SỰ có buổi học / buổi thi hôm nay */
const buildDigestMessage = (sessions, exams) => {
  const items = [];
  for (const s of sessions || []) items.push(`Tiết ${s.periodText}: ${s.courseName}${s.room ? ` (${s.room})` : ''}`);
  for (const e of exams || []) items.push(`Thi: ${e.courseName}${e.examTime ? ` - ${e.examTime}` : ''}${e.room ? ` (${e.room})` : ''}`);
  if (items.length === 0) return null;
  const head = items.slice(0, 3).join('; ');
  const more = items.length > 3 ? ` và ${items.length - 3} mục khác` : '';
  return { title: '📅 Lịch hôm nay', body: `${head}${more}.` };
};

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const norm = (v) => String(v === null || v === undefined ? '' : v).trim().replace(/\s+/g, ' ');

/** Dấu vân tay lịch học + lịch thi: đổi phòng / tiết / ngày / thêm bớt môn → đổi hash */
const scheduleFingerprint = (scheduleRows, examRows) => {
  const s = (scheduleRows || []).map((r) =>
    ['S', r.courseName, r.classCode, r.studyTime, r.dayOfWeek, r.periodText, r.room].map(norm).join('|'));
  const e = (examRows || []).map((r) =>
    ['E', r.courseName, r.examDate, r.examTime, r.room].map(norm).join('|'));
  return sha256([...s, ...e].sort().join('\n'));
};

// ═══════════════════════════════════════
// ĐIỂM MỚI / ĐIỂM THAY ĐỔI
// ═══════════════════════════════════════

// Chỉ so các trường mà mọi luồng đồng bộ đều ghi giống nhau (giống mobile/services/reminderPlanner.js)
const GRADE_FIELDS = ['finalGrade', 'totalGrade10', 'letterGrade'];
// Quá nhiều "thay đổi" một lúc gần như chắc chắn là đồng bộ lại dữ liệu → không báo
const MAX_GRADE_EVENTS = 12;

const normGradeValue = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (s === '') return '';
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : s.toUpperCase();
};

const gradeKey = (g) => [
  norm(g.courseCode || g.courseName).toLowerCase(),
  String(g.semester || '').replace(/^HocKy/i, '').trim(),
  String(g.schoolYear || '').replace('_', '-').trim(),
  parseInt(g.examAttempt, 10) || 1
].join('|');

const gradeFingerprint = (g) => GRADE_FIELDS.map((f) => normGradeValue(g[f])).join('|');
const hasAnyGrade = (g) => GRADE_FIELDS.some((f) => normGradeValue(g[f]) !== '');

/**
 * So điểm cũ (đang lưu ở PostgreSQL) với điểm mới (vừa lấy từ SQL Server).
 * @param {Array} oldRows
 * @param {Array} newRows
 * @param {{ hasBaseline: boolean }} opts - false = tài khoản chưa từng được đồng bộ → chỉ lập mốc, không báo
 * @returns {{ events: Array<{type:'new'|'changed', key, courseName, fingerprint}>, suppressed: boolean }}
 */
const diffGradeRows = (oldRows, newRows, { hasBaseline = true } = {}) => {
  if (!hasBaseline) return { events: [], suppressed: false };
  const prev = new Map();
  for (const g of oldRows || []) if (g) prev.set(gradeKey(g), gradeFingerprint(g));

  const events = [];
  const seen = new Set();
  for (const g of newRows || []) {
    if (!g || !hasAnyGrade(g)) continue;
    const key = gradeKey(g);
    if (seen.has(key)) continue;
    seen.add(key);
    const fp = gradeFingerprint(g);
    if (!prev.has(key)) events.push({ type: 'new', key, courseName: g.courseName || g.courseCode || '', fingerprint: fp });
    else if (prev.get(key) !== fp) events.push({ type: 'changed', key, courseName: g.courseName || g.courseCode || '', fingerprint: fp });
  }
  if (events.length > MAX_GRADE_EVENTS) return { events: [], suppressed: true };
  return { events, suppressed: false };
};

/**
 * Nội dung push điểm — KHÔNG ghi số điểm (màn hình khóa ai cũng đọc được), giống Canvas LMS.
 */
const buildGradeMessage = (events) => {
  if (!events || events.length === 0) return null;
  const allChanged = events.every((e) => e.type === 'changed');
  const title = allChanged ? '📊 Điểm vừa được cập nhật' : '📊 Có điểm mới';
  if (events.length === 1) {
    const name = events[0].courseName;
    return {
      title,
      body: allChanged
        ? `Điểm môn "${name}" vừa được cập nhật. Mở app để xem chi tiết.`
        : `Môn "${name}" đã có điểm. Mở app để xem chi tiết.`
    };
  }
  const head = events.slice(0, 3).map((e) => e.courseName).join(', ');
  const more = events.length > 3 ? ` và ${events.length - 3} môn khác` : '';
  return { title, body: `${events.length} môn: ${head}${more}. Mở app để xem chi tiết.` };
};

/** Khóa chống trùng: cùng tập sự kiện điểm → cùng khóa → chỉ gửi một lần */
const gradeDedupeKey = (userId, events) =>
  `grade:${userId}:${sha256(events.map((e) => `${e.key}=${e.fingerprint}`).sort().join(';')).slice(0, 40)}`;

// ═══════════════════════════════════════
// GIỜ GỬI / TOKEN / TIN NHẮN EXPO
// ═══════════════════════════════════════

const QUIET_START_HOUR = 22;
const QUIET_END = { h: 6, min: 30 };

/** Giờ yên lặng 22:00 → 06:30 (giờ VN): dời thông báo hiển thị sang 06:30 */
const nextAllowedSendTime = (now = new Date()) => {
  const p = vnParts(now);
  const minutes = p.h * 60 + p.min;
  const endMin = QUIET_END.h * 60 + QUIET_END.min;
  if (minutes >= QUIET_START_HOUR * 60) {
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    return vnTime(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), QUIET_END.h, QUIET_END.min);
  }
  if (minutes < endMin) return vnTime(p.y, p.m, p.d, QUIET_END.h, QUIET_END.min);
  return now;
};

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;
const isValidExpoToken = (token) => typeof token === 'string' && token.length <= 255 && EXPO_TOKEN_RE.test(token);

const ALLOWED_PLATFORMS = ['ios', 'android'];
const normalizePlatform = (p) => (ALLOWED_PLATFORMS.includes(p) ? p : 'unknown');

/** Khóa chủ sở hữu, PHẢI khớp ownerKeyOf() ở mobile/services/notificationService.js */
const ownerKeyOf = (user) => (user && user.username ? `${user.username}|${user.role || ''}` : null);

const ANDROID_CHANNEL_ID = 'exam_and_schedule_reminders';

/**
 * Dựng tin nhắn Expo cho một sự kiện outbox.
 * - Ẩn (silent): không title/body, _contentAvailable → iOS/Android đánh thức app để tự lập lại lịch nhắc.
 * - Hiển thị: có title/body, kèm owner để app bỏ qua nếu máy đã đổi sang tài khoản khác.
 */
const buildExpoMessages = (row, tokens, owner) => {
  let data = {};
  try { data = JSON.parse(row.data || '{}') || {}; } catch (e) { data = {}; }
  const payload = { ...data, kind: row.kind, owner };
  return (tokens || []).map((to) => (row.silent
    ? { to, data: { ...payload, type: 'sync' }, _contentAvailable: true, priority: 'normal' }
    : {
      to,
      title: row.title,
      body: row.body,
      data: payload,
      sound: 'default',
      priority: 'high',
      channelId: ANDROID_CHANNEL_ID,
      _contentAvailable: true
    }));
};

/**
 * Đọc kết quả ticket Expo (cùng thứ tự với messages).
 * @returns {{ okTickets: Array<{id, token}>, deadTokens: string[], retryTokens: string[], errors: string[] }}
 */
const interpretTickets = (tokens, tickets) => {
  const out = { okTickets: [], deadTokens: [], retryTokens: [], errors: [] };
  (tokens || []).forEach((token, i) => {
    const t = (tickets || [])[i];
    if (t && t.status === 'ok' && t.id) {
      out.okTickets.push({ id: t.id, token });
    } else if (t && t.status === 'error' && t.details && t.details.error === 'DeviceNotRegistered') {
      out.deadTokens.push(token);
    } else {
      out.retryTokens.push(token);
      out.errors.push((t && (t.details?.error || t.message)) || 'no-ticket');
    }
  });
  return out;
};

/** Thời gian chờ thử lại: 2, 4, 8, 16 phút... tối đa 60 phút */
const retryDelayMs = (attempts) => Math.min(60, 2 ** Math.max(1, attempts)) * 60 * 1000;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

module.exports = {
  VN_OFFSET_MS,
  vnParts,
  vnDayNumber,
  vnTime,
  dayNumber,
  tuafDayOfWeek,
  PERIOD_START,
  parsePeriodRange,
  parseStudyTimeDays,
  parseExamDay,
  sessionsOnDay,
  examsOnDay,
  buildDigestMessage,
  scheduleFingerprint,
  MAX_GRADE_EVENTS,
  gradeKey,
  diffGradeRows,
  buildGradeMessage,
  gradeDedupeKey,
  nextAllowedSendTime,
  isValidExpoToken,
  normalizePlatform,
  ownerKeyOf,
  buildExpoMessages,
  interpretTickets,
  retryDelayMs,
  chunk
};
