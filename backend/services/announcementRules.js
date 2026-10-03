/**
 * Quy tắc THUẦN cho thông báo do Admin gửi (không DB, không mạng → unit test trực tiếp).
 *
 * Đối tượng nhận (audience):
 *   all        — toàn trường: mọi sinh viên + giảng viên đã dùng app
 *   students   — toàn bộ sinh viên
 *   lecturers  — toàn bộ giảng viên
 *   cohorts    — sinh viên đang học thuộc các Khóa (VD 56, 57)
 *   classes    — sinh viên đang học thuộc các lớp hành chính (ID_lop)
 *   users      — danh sách tài khoản cụ thể (MSSV / mã cán bộ)
 */

const AUDIENCE_TYPES = ['all', 'students', 'lecturers', 'cohorts', 'classes', 'users'];

const LIMITS = Object.freeze({
  title: 120,
  body: 2000,
  sender: 60,
  cohorts: 20,
  classes: 50,
  users: 1000,
  pushBody: 180
});

const USERNAME_RE = /^[A-Za-z0-9._-]{2,50}$/;
const CLASS_KEYWORD_RE = /^[\p{L}\p{N} ._-]{2,30}$/u;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROLES_BY_TYPE = Object.freeze({
  all: ['student', 'lecturer'],
  students: ['student'],
  lecturers: ['lecturer'],
  cohorts: ['student'],
  classes: ['student'],
  users: ['student', 'lecturer']
});

/** Bỏ ký tự điều khiển (giữ xuống dòng), chuẩn hóa xuống dòng, cắt khoảng trắng thừa */
const cleanText = (value, { multiline = false } = {}) => {
  if (typeof value !== 'string') return '';
  let s = value.replace(/\r\n?/g, '\n');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  if (!multiline) s = s.replace(/\s+/g, ' ');
  else s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
};

const uniq = (arr) => [...new Set(arr)];

/** Tách danh sách tài khoản từ chuỗi (phẩy, chấm phẩy, khoảng trắng, xuống dòng) hoặc mảng */
const parseUsernames = (raw) => {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,;]+/);
  return uniq(list.map((u) => String(u || '').trim()).filter(Boolean));
};

/**
 * Kiểm tra & chuẩn hóa đầu vào từ Admin.
 * @returns {{ ok: boolean, errors: string[], value?: object }}
 */
const validateAnnouncementInput = (raw) => {
  const input = raw && typeof raw === 'object' ? raw : {};
  const errors = [];

  const title = cleanText(input.title);
  const body = cleanText(input.body, { multiline: true });
  const senderLabel = cleanText(input.senderLabel) || 'Nhà trường';
  if (!title) errors.push('Thiếu tiêu đề thông báo.');
  else if (title.length > LIMITS.title) errors.push(`Tiêu đề tối đa ${LIMITS.title} ký tự.`);
  if (!body) errors.push('Thiếu nội dung thông báo.');
  else if (body.length > LIMITS.body) errors.push(`Nội dung tối đa ${LIMITS.body} ký tự.`);
  if (senderLabel.length > LIMITS.sender) errors.push(`Tên đơn vị gửi tối đa ${LIMITS.sender} ký tự.`);

  const a = input.audience && typeof input.audience === 'object' ? input.audience : {};
  const type = AUDIENCE_TYPES.includes(a.type) ? a.type : null;
  const audience = { type };
  if (!type) {
    errors.push('Đối tượng nhận không hợp lệ.');
  } else if (type === 'cohorts') {
    const values = Array.isArray(a.cohorts) ? a.cohorts : [];
    const cohorts = uniq(values.map((v) => Number(v)));
    if (cohorts.length === 0) errors.push('Chọn ít nhất một Khóa.');
    else if (cohorts.length > LIMITS.cohorts) errors.push(`Tối đa ${LIMITS.cohorts} Khóa mỗi lần gửi.`);
    else if (!cohorts.every((c) => Number.isInteger(c) && c >= 1 && c <= 200)) errors.push('Khóa không hợp lệ.');
    audience.cohorts = cohorts.sort((x, y) => y - x);
  } else if (type === 'classes') {
    const values = Array.isArray(a.classIds) ? a.classIds : [];
    const classIds = uniq(values.map((v) => Number(v)));
    if (classIds.length === 0) errors.push('Chọn ít nhất một lớp.');
    else if (classIds.length > LIMITS.classes) errors.push(`Tối đa ${LIMITS.classes} lớp mỗi lần gửi.`);
    else if (!classIds.every((c) => Number.isInteger(c) && c > 0 && c < 2147483647)) errors.push('Mã lớp không hợp lệ.');
    audience.classIds = classIds;
  } else if (type === 'users') {
    const usernames = parseUsernames(a.usernames);
    const invalid = usernames.filter((u) => !USERNAME_RE.test(u));
    if (usernames.length === 0) errors.push('Nhập ít nhất một tài khoản (MSSV / mã cán bộ).');
    else if (usernames.length > LIMITS.users) errors.push(`Tối đa ${LIMITS.users} tài khoản mỗi lần gửi.`);
    else if (invalid.length) errors.push(`Tài khoản không hợp lệ: ${invalid.slice(0, 5).join(', ')}`);
    audience.usernames = usernames;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], value: { title, body, senderLabel, urgent: input.urgent === true, audience } };
};

/** Mô tả đối tượng nhận để hiển thị trong lịch sử */
const describeAudience = (audience, { classLabels = [] } = {}) => {
  switch (audience && audience.type) {
    case 'all': return 'Toàn trường (sinh viên + giảng viên)';
    case 'students': return 'Toàn bộ sinh viên';
    case 'lecturers': return 'Toàn bộ giảng viên';
    case 'cohorts': return `Khóa ${audience.cohorts.join(', ')}`;
    case 'classes': {
      const names = classLabels.length ? classLabels : audience.classIds.map((id) => `#${id}`);
      const shown = names.slice(0, 5).join(', ');
      return `Lớp ${shown}${names.length > 5 ? ` (+${names.length - 5} lớp)` : ''}`;
    }
    case 'users': return `${audience.usernames.length} tài khoản cụ thể`;
    default: return '';
  }
};

/** Nội dung ngắn gọn cho banner push (bản đầy đủ đọc trong app) */
const buildPushBody = (body) => {
  const flat = cleanText(body);
  return flat.length > LIMITS.pushBody ? `${flat.slice(0, LIMITS.pushBody - 1).trimEnd()}…` : flat;
};

const announcementDedupeKey = (announcementId, userId) => `ann:${announcementId}:${userId}`;

const isValidClassKeyword = (q) => typeof q === 'string' && CLASS_KEYWORD_RE.test(q.trim());
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

module.exports = {
  AUDIENCE_TYPES,
  LIMITS,
  ROLES_BY_TYPE,
  cleanText,
  parseUsernames,
  validateAnnouncementInput,
  describeAudience,
  buildPushBody,
  announcementDedupeKey,
  isValidClassKeyword,
  isUuid
};
