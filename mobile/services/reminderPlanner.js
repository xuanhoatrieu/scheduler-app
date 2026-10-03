/**
 * Bộ lập kế hoạch thông báo — HÀM THUẦN, không gọi API, không đụng hệ điều hành.
 *
 * Nguyên tắc (fail-closed): chỉ sinh thông báo khi CÓ SỰ KIỆN THẬT và đọc chắc được
 * ngày + thứ + tiết/giờ. Dữ liệu mơ hồ → bỏ qua, không đoán.
 *
 * Mỗi buổi học (mỗi khoảng tiết) là một sự kiện riêng:
 *   tiết 1-3 → nhắc trước 07:00; tiết 4-5 → nhắc tiếp trước 09:55; chiều không có lịch → không nhắc.
 */
import {
  atTime,
  dateKey,
  getPeriodTimes,
  getTuafDayOfWeek,
  parseFullDate,
  parsePeriodRange,
  parseStudyTime,
  startOfDay,
} from '../utils/scheduleDate.js';

export const REMINDER_LEAD_MINUTES = 15;
export const PLAN_DAYS = 7;
// iOS chỉ giữ tối đa 64 thông báo hẹn giờ cho mỗi app → chừa khoảng trống an toàn
export const MAX_SCHEDULED = 60;

/** Hash ngắn, ổn định (djb2) để tạo mã thông báo cố định */
export const stableHash = (str) => {
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
};

const hhmm = (time) => time.replace(':', '');

/**
 * Liệt kê các buổi học THẬT trong khoảng [from, from + days).
 * Mỗi phần tử: { key, courseName, classCode, room, periodText, startTime, endTime, startAt, endAt, date }
 */
export const getClassSessions = (schedule, { schoolYear, from = new Date(), days = PLAN_DAYS } = {}) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return [];
  const sessions = [];
  const seen = new Set();
  const firstDay = startOfDay(from);

  for (let offset = 0; offset < days; offset++) {
    const day = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + offset);
    const tuafDay = getTuafDayOfWeek(day);

    for (const item of schedule) {
      if (!item || !item.courseName) continue;
      if (parseInt(item.dayOfWeek, 10) !== tuafDay) continue;

      // Giai đoạn học phải đọc được và chứa ngày này (không đọc được → KHÔNG báo)
      const range = parseStudyTime(item.studyTime, item.schoolYear || schoolYear);
      if (!range) continue;
      if (day < startOfDay(range.start) || day > startOfDay(range.end)) continue;

      // Tiết học phải hợp lệ (1..15)
      const period = parsePeriodRange(item.periodText);
      if (!period) continue;
      const { startTime, endTime } = getPeriodTimes(period);

      const identity = String(item.classCode || item.courseName).trim();
      const key = `${dateKey(day)}|${startTime}|${identity}`;
      if (seen.has(key)) continue; // gộp bản ghi trùng
      seen.add(key);

      sessions.push({
        key,
        courseName: item.courseName,
        classCode: item.classCode || '',
        room: (item.room || '').trim(),
        periodText: `${period.start}-${period.end}`,
        startTime,
        endTime,
        startAt: atTime(day, startTime),
        endAt: atTime(day, endTime),
        date: day,
      });
    }
  }

  return sessions.sort((a, b) => a.startAt - b.startAt);
};

/** Lịch thi có giờ THẬT (không nhận giờ mặc định khi trường chưa xếp giờ) */
export const hasRealExamTime = (exam) => {
  if (!exam || !exam.startTime || !/^\d{1,2}:\d{2}$/.test(String(exam.startTime).trim())) return false;
  const t = String(exam.examTime || '').trim();
  if (!t || /chưa xếp/i.test(t)) return false;
  // Chỉ có "Ca 2" mà không có giờ cụ thể → backend gán 07:00 mặc định → không tin được
  if (/^ca\s*\d+$/i.test(t)) return false;
  return true;
};

/**
 * Các buổi thi THẬT trong khoảng [from, from + days).
 * Mỗi phần tử: { key, courseName, className, room, seatNumber, startTime, startAt, date }
 */
export const getExamEvents = (exams, { from = new Date(), days = PLAN_DAYS } = {}) => {
  if (!Array.isArray(exams) || exams.length === 0) return [];
  const firstDay = startOfDay(from);
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + days);
  const events = [];
  const seen = new Set();

  for (const exam of exams) {
    if (!exam || !exam.courseName) continue;
    const date = parseFullDate(exam.examDate);
    if (!date || date < firstDay || date >= lastDay) continue;
    if (!hasRealExamTime(exam)) continue;

    const startTime = String(exam.startTime).trim().padStart(5, '0');
    const identity = `${exam.courseCode || exam.courseName}|${exam.className || exam.classCode || ''}`;
    const key = `${dateKey(date)}|${startTime}|${identity}`;
    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      key,
      courseName: exam.courseName,
      className: exam.className || '',
      room: (exam.room || '').trim(),
      seatNumber: (exam.seatNumber || '').trim(),
      startTime,
      startAt: atTime(date, startTime),
      date,
    });
  }
  return events.sort((a, b) => a.startAt - b.startAt);
};

/**
 * Lập danh sách thông báo hẹn giờ.
 * @returns {Array<{ id, fireAt: Date, title, body, data }>}
 */
export const planReminders = ({ schedule = [], exams = [], schoolYear, role = 'student', now = new Date() } = {}) => {
  const nowMs = now.getTime();
  const leadMs = REMINDER_LEAD_MINUTES * 60 * 1000;
  const isLecturer = role === 'lecturer';
  const plan = [];

  for (const s of getClassSessions(schedule, { schoolYear, from: now, days: PLAN_DAYS })) {
    const fireAt = new Date(s.startAt.getTime() - leadMs);
    if (fireAt.getTime() <= nowMs) continue; // đã qua giờ nhắc → không báo bù
    const roomStr = s.room ? ` • Phòng ${s.room}` : '';
    plan.push({
      id: `class_${dateKey(s.date)}_${hhmm(s.startTime)}_${stableHash(s.classCode || s.courseName)}`,
      fireAt,
      title: isLecturer ? '⏰ Sắp đến giờ dạy' : '⏰ Sắp đến giờ học',
      body: `Môn "${s.courseName}" bắt đầu lúc ${s.startTime} (tiết ${s.periodText})${roomStr}.`,
      data: { kind: 'class', key: s.key },
    });
  }

  for (const e of getExamEvents(exams, { from: now, days: PLAN_DAYS })) {
    const fireAt = new Date(e.startAt.getTime() - leadMs);
    if (fireAt.getTime() <= nowMs) continue;
    const roomStr = e.room ? ` • Phòng ${e.room}` : '';
    const sbdStr = !isLecturer && e.seatNumber ? ` • SBD ${e.seatNumber}` : '';
    const classStr = isLecturer && e.className ? ` • Lớp ${e.className}` : '';
    plan.push({
      id: `exam_${dateKey(e.date)}_${hhmm(e.startTime)}_${stableHash(e.key)}`,
      fireAt,
      title: isLecturer ? '📝 Sắp đến giờ thi lớp học phần' : '📝 Sắp đến giờ thi',
      body: `Môn "${e.courseName}" thi lúc ${e.startTime}${classStr}${roomStr}${sbdStr}.`,
      data: { kind: 'exam', key: e.key },
    });
  }

  plan.sort((a, b) => a.fireAt - b.fireAt);
  // Lọc trùng mã lần cuối + giới hạn số lượng của iOS
  const seenIds = new Set();
  return plan.filter((p) => (seenIds.has(p.id) ? false : seenIds.add(p.id))).slice(0, MAX_SCHEDULED);
};

// ═══════════════════════════════════════
// PHÁT HIỆN ĐIỂM MỚI / ĐIỂM THAY ĐỔI
// ═══════════════════════════════════════

// Chỉ so các trường mà MỌI luồng đồng bộ ở backend (cron + force sync) đều điền giống nhau.
// processGrade / midtermGrade / totalGrade4 bị cron ghi null hoặc tính khác → so vào sẽ báo "đổi điểm" giả.
const GRADE_FIELDS = ['finalGrade', 'totalGrade10', 'letterGrade'];

const normalizeGradeValue = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (s === '') return '';
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : s.toUpperCase();
};

const normText = (v) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Chuẩn hóa để các luồng đồng bộ khác nhau (cron / force sync / sync lịch sử) ra cùng một khóa:
// 'HocKy1' ~ '1', '2025_2026' ~ '2025-2026'
export const gradeKey = (g) =>
  [
    normText(g.courseCode || g.courseName),
    String(g.semester || '').replace(/^HocKy/i, '').trim(),
    String(g.schoolYear || '').replace('_', '-').trim(),
    parseInt(g.examAttempt, 10) || 1,
  ].join('|');

// Quá nhiều "thay đổi" cùng lúc gần như chắc chắn là dữ liệu bị đồng bộ lại / đổi định dạng,
// không phải nhà trường vừa nhập điểm → chỉ cập nhật mốc, không báo.
export const MAX_GRADE_EVENTS = 12;

const gradeFingerprint = (g) => GRADE_FIELDS.map((f) => normalizeGradeValue(g[f])).join('|');

const hasAnyGrade = (g) => GRADE_FIELDS.some((f) => normalizeGradeValue(g[f]) !== '');

/** Ảnh chụp điểm: { [gradeKey]: hash(fingerprint) } — chỉ lưu hash, không lưu điểm */
export const buildGradeSnapshot = (grades) => {
  const snap = {};
  for (const g of grades || []) {
    if (!g) continue;
    snap[gradeKey(g)] = stableHash(gradeFingerprint(g));
  }
  return snap;
};

/**
 * So sánh điểm hiện tại với ảnh chụp lần trước.
 * - Lần đầu (chưa có ảnh chụp) → không có sự kiện, chỉ lập mốc.
 * - Môn mới xuất hiện CÓ điểm → 'new'. Môn đã có mà điểm đổi → 'changed'.
 * - Quá MAX_GRADE_EVENTS sự kiện → coi là đồng bộ lại dữ liệu, không báo (suppressed = true).
 * @returns {{ events: Array<{type, courseName, totalGrade10, letterGrade, semester, schoolYear}>, snapshot, suppressed }}
 */
export const diffGrades = (prevSnapshot, grades) => {
  const snapshot = buildGradeSnapshot(grades);
  if (!prevSnapshot) return { events: [], snapshot, suppressed: false };

  const events = [];
  for (const g of grades || []) {
    if (!g || !hasAnyGrade(g)) continue;
    const k = gradeKey(g);
    const prev = prevSnapshot[k];
    if (prev === undefined) {
      events.push({ type: 'new', ...pickGrade(g) });
    } else if (prev !== snapshot[k]) {
      events.push({ type: 'changed', ...pickGrade(g) });
    }
  }
  if (events.length > MAX_GRADE_EVENTS) return { events: [], snapshot, suppressed: true };
  return { events, snapshot, suppressed: false };
};

const pickGrade = (g) => ({
  courseName: g.courseName || g.courseCode || '',
  totalGrade10: g.totalGrade10 ?? null,
  letterGrade: g.letterGrade ?? null,
  semester: g.semester || '',
  schoolYear: g.schoolYear || '',
});

/** Nội dung thông báo điểm (gộp nếu nhiều môn) */
export const buildGradeNotification = (events) => {
  if (!events || events.length === 0) return null;
  const fmt = (e) => {
    const parts = [];
    if (e.totalGrade10 !== null && e.totalGrade10 !== '') parts.push(String(e.totalGrade10));
    if (e.letterGrade) parts.push(`(${e.letterGrade})`);
    return parts.length ? `${e.courseName}: ${parts.join(' ')}` : e.courseName;
  };
  const allChanged = events.every((e) => e.type === 'changed');
  const title = allChanged ? '📊 Điểm vừa được cập nhật' : '📊 Có điểm mới';
  if (events.length === 1) return { title, body: fmt(events[0]) };
  const head = events.slice(0, 3).map(fmt).join('; ');
  const more = events.length > 3 ? ` và ${events.length - 3} môn khác` : '';
  return { title, body: `${events.length} môn: ${head}${more}.` };
};
