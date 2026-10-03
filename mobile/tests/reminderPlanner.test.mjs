// Chạy: cd mobile && node --import ./tests/register.mjs --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_GRADE_EVENTS,
  MAX_SCHEDULED,
  diffGrades,
  getClassSessions,
  hasRealExamTime,
  planReminders,
} from '../services/reminderPlanner.js';
import { parsePeriodRange, parseStudyTime } from '../utils/scheduleDate.js';

// Thứ Bảy 03/10/2026 (TUAF: Thứ 7 = 7)
const SAT = (h = 6, m = 0) => new Date(2026, 9, 3, h, m, 0, 0);
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const cls = (over = {}) => ({
  id: 'uuid-' + Math.random(),
  courseName: 'Toán cao cấp',
  classCode: 'TOAN-K58',
  dayOfWeek: 7,
  studyTime: '28/09 - 18/10',
  periodText: '1-3',
  room: 'A1',
  schoolYear: '2026-2027',
  ...over,
});

// ─── Bộ đọc ngày / tiết ───────────────────────────────────

test('parsePeriodRange: chỉ nhận tiết hợp lệ', () => {
  assert.deepEqual(parsePeriodRange('1-3'), { start: 1, end: 3 });
  assert.deepEqual(parsePeriodRange('Tiết 6-10'), { start: 6, end: 10 });
  assert.equal(parsePeriodRange('10 tiết'), null);
  assert.equal(parsePeriodRange('0-4'), null);
  assert.equal(parsePeriodRange(''), null);
  assert.equal(parsePeriodRange('5-2'), null);
});

test('parseStudyTime: suy năm theo năm học, không theo năm hiện tại', () => {
  const r = parseStudyTime('28/09 - 18/10', '2025-2026');
  assert.equal(r.start.getFullYear(), 2025);
  const spring = parseStudyTime('05/01 - 20/02', '2025-2026');
  assert.equal(spring.start.getFullYear(), 2026);
  assert.equal(parseStudyTime('', '2026-2027'), null);
  assert.equal(parseStudyTime('Tiết 1-3', '2026-2027'), null);
});

// ─── Lịch học: mỗi khoảng tiết là một sự kiện ─────────────

test('Sáng tiết 1-3 và 4-5 → 2 lần nhắc (06:45, 09:40); chiều không có lịch → không nhắc', () => {
  const plan = planReminders({
    schedule: [cls({ periodText: '1-3' }), cls({ courseName: 'Vật lý', classCode: 'LY-K58', periodText: '4-5' })],
    now: SAT(6, 0),
  });
  const today = plan.filter((p) => p.fireAt.getDate() === 3);
  assert.deepEqual(today.map((p) => hm(p.fireAt)), ['06:45', '09:40']);
  assert.equal(plan.filter((p) => p.fireAt.getDate() === 3 && p.fireAt.getHours() >= 12).length, 0);
  assert.match(today[0].body, /07:00 \(tiết 1-3\)/);
  assert.match(today[1].body, /09:55 \(tiết 4-5\)/);
});

test('Hôm nay không có lịch → 0 thông báo cho hôm nay', () => {
  const plan = planReminders({ schedule: [cls({ dayOfWeek: 2 })], now: SAT(6, 0) });
  assert.equal(plan.filter((p) => p.fireAt.getDate() === 3).length, 0);
  // Thứ Hai 05/10 vẫn được nhắc vì có lịch thật
  assert.equal(plan.filter((p) => p.fireAt.getDate() === 5).length, 1);
});

test('Lịch trống → 0 thông báo', () => {
  assert.equal(planReminders({ schedule: [], exams: [], now: SAT() }).length, 0);
});

test('Học kỳ năm trước (cùng ngày/tháng) → 0 thông báo', () => {
  const plan = planReminders({ schedule: [cls({ schoolYear: '2025-2026' })], now: SAT(6, 0) });
  assert.equal(plan.length, 0);
});

test('Giai đoạn học đã kết thúc → 0 thông báo', () => {
  const plan = planReminders({ schedule: [cls({ studyTime: '17/08 - 27/09' })], now: SAT(6, 0) });
  assert.equal(plan.length, 0);
});

test('Dữ liệu mơ hồ (không đọc được ngày / tiết / thứ) → KHÔNG báo', () => {
  const plan = planReminders({
    schedule: [
      cls({ studyTime: '' }),
      cls({ studyTime: 'chưa xếp' }),
      cls({ periodText: '10 tiết' }),
      cls({ periodText: '0-4' }),
      cls({ dayOfWeek: 0 }),
      cls({ studyTime: '2026-09-17' }), // ngày đơn đã qua
    ],
    now: SAT(6, 0),
  });
  assert.equal(plan.length, 0);
});

test('Giờ nhắc đã qua → không báo bù; buổi sau vẫn báo', () => {
  const plan = planReminders({
    schedule: [cls({ periodText: '1-3' }), cls({ classCode: 'LY', courseName: 'Lý', periodText: '4-5' })],
    now: SAT(7, 0),
  });
  const today = plan.filter((p) => p.fireAt.getDate() === 3);
  assert.deepEqual(today.map((p) => hm(p.fireAt)), ['09:40']);
});

test('Mã thông báo cố định dù UUID đổi sau mỗi lần đồng bộ; bản ghi trùng bị gộp', () => {
  const a = planReminders({ schedule: [cls({ id: 'uuid-A' })], now: SAT(6, 0) });
  const b = planReminders({ schedule: [cls({ id: 'uuid-B' }), cls({ id: 'uuid-C' })], now: SAT(6, 0) });
  assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
  assert.equal(b.length, 1);
});

test('Quét đúng 7 ngày, không vượt giới hạn 64 của iOS', () => {
  const many = [];
  for (let d = 2; d <= 8; d++) {
    for (const p of ['1-1', '2-2', '3-3', '4-4', '5-5', '6-6', '7-7', '8-8', '9-9', '10-10', '11-11']) {
      many.push(cls({ dayOfWeek: d, periodText: p, classCode: `C${d}-${p}` }));
    }
  }
  const plan = planReminders({ schedule: many, now: SAT(0, 0) });
  assert.equal(plan.length, MAX_SCHEDULED);
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i].fireAt >= plan[i - 1].fireAt);
});

test('Giảng viên: tiêu đề là giờ dạy', () => {
  const plan = planReminders({ schedule: [cls()], role: 'lecturer', now: SAT(6, 0) });
  assert.equal(plan[0].title, '⏰ Sắp đến giờ dạy');
});

test('getClassSessions: chỉ trả buổi học thật hôm nay', () => {
  const s = getClassSessions([cls({ periodText: '1-3' }), cls({ dayOfWeek: 3 })], { from: SAT(10, 0), days: 1 });
  assert.equal(s.length, 1);
  assert.equal(s[0].endTime, '09:40');
});

// ─── Lịch thi ──────────────────────────────────────────────

test('Lịch thi: chỉ báo khi có ngày + giờ thật', () => {
  const base = { courseName: 'Hóa', examDate: '05/10/2026', startTime: '13:15', examTime: 'Tiết 6-7 (13:15)' };
  assert.equal(hasRealExamTime(base), true);
  assert.equal(hasRealExamTime({ ...base, examTime: 'Chưa xếp giờ', startTime: '07:00' }), false);
  assert.equal(hasRealExamTime({ ...base, examTime: 'Ca 2', startTime: '07:00' }), false);

  const plan = planReminders({
    exams: [base, { ...base, courseName: 'Sinh', examTime: 'Chưa xếp giờ', startTime: '07:00' }],
    now: SAT(6, 0),
  });
  assert.equal(plan.length, 1);
  assert.equal(hm(plan[0].fireAt), '13:00');
  assert.equal(plan[0].fireAt.getDate(), 5);
});

test('Lịch thi đã qua / ngoài 7 ngày → không báo', () => {
  const plan = planReminders({
    exams: [
      { courseName: 'A', examDate: '01/10/2026', startTime: '07:00', examTime: 'Tiết 1-2 (07:00)' },
      { courseName: 'B', examDate: '20/10/2026', startTime: '07:00', examTime: 'Tiết 1-2 (07:00)' },
    ],
    now: SAT(6, 0),
  });
  assert.equal(plan.length, 0);
});

// ─── Điểm mới / điểm thay đổi ─────────────────────────────

const g = (over = {}) => ({
  courseCode: 'MATH101', courseName: 'Toán', semester: 'HocKy1', schoolYear: '2025-2026',
  examAttempt: 1, finalGrade: 7, totalGrade10: 7.5, letterGrade: 'B', processGrade: null, ...over,
});

test('Điểm: lần đầu chỉ lập mốc, không báo', () => {
  const r = diffGrades(null, [g()]);
  assert.equal(r.events.length, 0);
  assert.ok(Object.keys(r.snapshot).length === 1);
});

test('Điểm: không đổi → không báo', () => {
  const { snapshot } = diffGrades(null, [g()]);
  assert.equal(diffGrades(snapshot, [g()]).events.length, 0);
});

test('Điểm: có môn mới có điểm → báo "new"; đổi điểm → báo "changed"', () => {
  const { snapshot } = diffGrades(null, [g()]);
  const r1 = diffGrades(snapshot, [g(), g({ courseCode: 'PHY', courseName: 'Lý', totalGrade10: 8 })]);
  assert.deepEqual(r1.events.map((e) => e.type), ['new']);
  const r2 = diffGrades(snapshot, [g({ totalGrade10: 8.2, letterGrade: 'B+' })]);
  assert.deepEqual(r2.events.map((e) => e.type), ['changed']);
});

test('Điểm: môn mới nhưng CHƯA có điểm → không báo', () => {
  const { snapshot } = diffGrades(null, [g()]);
  const r = diffGrades(snapshot, [g(), g({ courseCode: 'X', finalGrade: null, totalGrade10: null, letterGrade: null })]);
  assert.equal(r.events.length, 0);
});

test('Điểm: khác định dạng giữa các luồng đồng bộ (HocKy1/1, 2025_2026, 7/7.0) → không báo giả', () => {
  const { snapshot } = diffGrades(null, [g()]);
  const r = diffGrades(snapshot, [g({ semester: '1', schoolYear: '2025_2026', finalGrade: '7.0', totalGrade10: '7.50', letterGrade: 'b', processGrade: 9 })]);
  assert.equal(r.events.length, 0);
});

test('Điểm: thay đổi hàng loạt (đồng bộ lại dữ liệu) → không báo', () => {
  const old = Array.from({ length: 30 }, (_, i) => g({ courseCode: `C${i}` }));
  const { snapshot } = diffGrades(null, old);
  const changed = old.map((x) => ({ ...x, totalGrade10: 9 }));
  const r = diffGrades(snapshot, changed);
  assert.equal(r.events.length, 0);
  assert.equal(r.suppressed, true);
  assert.ok(MAX_GRADE_EVENTS < 30);
});
