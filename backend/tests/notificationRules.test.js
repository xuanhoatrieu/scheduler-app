// Chạy: cd backend && node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../services/notificationRules');

// 2026-10-07 là Thứ Tư (TUAF dayOfWeek = 4)
const vn = (y, m, d, h = 0, min = 0) => r.vnTime(y, m, d, h, min);

test('giờ VN không phụ thuộc TZ: 23:30 UTC ngày 6 = 06:30 ngày 7 giờ VN', () => {
  const p = r.vnParts(new Date(Date.UTC(2026, 9, 6, 23, 30)));
  assert.deepEqual([p.y, p.m, p.d, p.h, p.min], [2026, 10, 7, 6, 30]);
  assert.equal(r.tuafDayOfWeek(new Date(Date.UTC(2026, 9, 6, 23, 30))), 4);
});

test('parseStudyTimeDays: "dd/MM - dd/MM" suy năm theo năm học, vắt qua năm mới', () => {
  const a = r.parseStudyTimeDays('25/08 - 30/11', '2026-2027');
  assert.equal(a.startDay, r.dayNumber(2026, 8, 25));
  assert.equal(a.endDay, r.dayNumber(2026, 11, 30));
  const b = r.parseStudyTimeDays('15/12 - 20/01', '2026-2027');
  assert.equal(b.endDay, r.dayNumber(2027, 1, 20));
  assert.equal(r.parseStudyTimeDays('', '2026-2027'), null);
  assert.equal(r.parseStudyTimeDays('không rõ', '2026-2027'), null);
});

test('sessionsOnDay: tiết 1-3 sáng thứ 4 tuần này, tuần sau đổi sang thứ 5 tiết 4-5', () => {
  const rows = [
    { courseName: 'Tin học', classCode: 'TH1', studyTime: '05/10 - 11/10', dayOfWeek: 4, periodText: '1-3', room: 'A1', schoolYear: '2026-2027' },
    { courseName: 'Tin học', classCode: 'TH1', studyTime: '12/10 - 18/10', dayOfWeek: 5, periodText: '4-5', room: 'B2', schoolYear: '2026-2027' }
  ];
  const wed = r.sessionsOnDay(rows, vn(2026, 10, 7, 6));
  assert.equal(wed.length, 1);
  assert.equal(wed[0].periodText, '1-3');
  // Thứ 5 tuần này: KHÔNG có (giai đoạn thứ 5 bắt đầu từ tuần sau)
  assert.equal(r.sessionsOnDay(rows, vn(2026, 10, 8, 6)).length, 0);
  // Thứ 4 tuần sau: KHÔNG có
  assert.equal(r.sessionsOnDay(rows, vn(2026, 10, 14, 6)).length, 0);
  const thu = r.sessionsOnDay(rows, vn(2026, 10, 15, 6));
  assert.equal(thu.length, 1);
  assert.equal(thu[0].periodText, '4-5');
  assert.equal(thu[0].startTime, '09:55');
});

test('sessionsOnDay: tiết không hợp lệ / ngày không đọc được → không tính là buổi học', () => {
  const rows = [
    { courseName: 'A', studyTime: '05/10 - 11/10', dayOfWeek: 4, periodText: '10 tiết', schoolYear: '2026-2027' },
    { courseName: 'B', studyTime: '???', dayOfWeek: 4, periodText: '1-3', schoolYear: '2026-2027' },
    { courseName: 'C', studyTime: '05/10 - 11/10', dayOfWeek: 4, periodText: '0-4', schoolYear: '2026-2027' }
  ];
  assert.equal(r.sessionsOnDay(rows, vn(2026, 10, 7, 6)).length, 0);
});

test('buildDigestMessage: không có buổi nào → null (không báo)', () => {
  assert.equal(r.buildDigestMessage([], []), null);
  const m = r.buildDigestMessage([{ periodText: '1-3', courseName: 'Toán', room: 'A1' }], [{ courseName: 'Lý', examTime: 'Ca 2', room: '' }]);
  assert.match(m.body, /Tiết 1-3: Toán \(A1\)/);
  assert.match(m.body, /Thi: Lý - Ca 2/);
});

test('examsOnDay: chỉ lấy đúng ngày thi', () => {
  const exams = [{ courseName: 'Toán', examDate: '7/10/2026', examTime: 'Ca 1' }, { courseName: 'Lý', examDate: '8/10/2026' }];
  assert.deepEqual(r.examsOnDay(exams, vn(2026, 10, 7, 6)).map((e) => e.courseName), ['Toán']);
});

test('diffGradeRows: điểm mới / điểm đổi / không đổi / chưa có mốc / quá nhiều', () => {
  const old = [
    { courseCode: 'MH1', courseName: 'Toán', semester: 'HocKy1', schoolYear: '2026-2027', examAttempt: 1, finalGrade: 7, totalGrade10: 7.5, letterGrade: 'B' },
    { courseCode: 'MH2', courseName: 'Lý', semester: 'HocKy1', schoolYear: '2026-2027', examAttempt: 1, finalGrade: null, totalGrade10: null, letterGrade: null }
  ];
  const now = [
    { ...old[0] },
    { ...old[1], finalGrade: 8, totalGrade10: 8.2, letterGrade: 'B+' },
    { courseCode: 'MH3', courseName: 'Hóa', semester: 'HocKy1', schoolYear: '2026-2027', examAttempt: 1, finalGrade: 6, totalGrade10: 6.5, letterGrade: 'C+' },
    { courseCode: 'MH4', courseName: 'Sinh', semester: 'HocKy1', schoolYear: '2026-2027', examAttempt: 1 } // chưa có điểm
  ];
  const { events } = r.diffGradeRows(old, now);
  assert.deepEqual(events.map((e) => `${e.type}:${e.courseName}`).sort(), ['changed:Lý', 'new:Hóa']);

  // Không đổi gì → không có sự kiện
  assert.equal(r.diffGradeRows(old, old).events.length, 0);
  // 7.50 vs "7.5" là cùng điểm
  assert.equal(r.diffGradeRows(old, [{ ...old[0], totalGrade10: '7.50' }]).events.length, 0);
  // Chưa có mốc → không báo
  assert.equal(r.diffGradeRows([], now, { hasBaseline: false }).events.length, 0);
  // Quá MAX → coi là đồng bộ lại, không báo
  const many = Array.from({ length: r.MAX_GRADE_EVENTS + 1 }, (_, i) => ({ courseCode: `X${i}`, semester: 'HocKy1', schoolYear: '2026-2027', totalGrade10: 5 }));
  const res = r.diffGradeRows([], many);
  assert.equal(res.events.length, 0);
  assert.equal(res.suppressed, true);
});

test('buildGradeMessage: KHÔNG chứa số điểm', () => {
  const m = r.buildGradeMessage([{ type: 'new', courseName: 'Hóa', fingerprint: '6|6.5|C+' }]);
  assert.equal(m.title, '📊 Có điểm mới');
  assert.doesNotMatch(m.body, /6\.5|C\+/);
  const m2 = r.buildGradeMessage([{ type: 'changed', courseName: 'Lý' }]);
  assert.equal(m2.title, '📊 Điểm vừa được cập nhật');
  assert.equal(r.buildGradeMessage([]), null);
});

test('gradeDedupeKey: cùng sự kiện → cùng khóa, điểm khác → khóa khác', () => {
  const e = [{ key: 'a', fingerprint: '1' }, { key: 'b', fingerprint: '2' }];
  assert.equal(r.gradeDedupeKey('u1', e), r.gradeDedupeKey('u1', [...e].reverse()));
  assert.notEqual(r.gradeDedupeKey('u1', e), r.gradeDedupeKey('u1', [{ key: 'a', fingerprint: '9' }, e[1]]));
});

test('nextAllowedSendTime: 03:00 → 06:30 cùng ngày; 23:00 → 06:30 hôm sau; 10:00 → ngay', () => {
  assert.equal(r.nextAllowedSendTime(vn(2026, 10, 7, 3)).getTime(), vn(2026, 10, 7, 6, 30).getTime());
  assert.equal(r.nextAllowedSendTime(vn(2026, 10, 7, 23)).getTime(), vn(2026, 10, 8, 6, 30).getTime());
  assert.equal(r.nextAllowedSendTime(vn(2026, 10, 31, 22, 15)).getTime(), vn(2026, 11, 1, 6, 30).getTime());
  const t = vn(2026, 10, 7, 10);
  assert.equal(r.nextAllowedSendTime(t).getTime(), t.getTime());
});

test('isValidExpoToken: chỉ nhận đúng định dạng Expo', () => {
  assert.equal(r.isValidExpoToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]'), true);
  assert.equal(r.isValidExpoToken('ExpoPushToken[abcdefghijkl_-12]'), true);
  assert.equal(r.isValidExpoToken('ExponentPushToken[short]'), false);
  assert.equal(r.isValidExpoToken("ExponentPushToken[aaaaaaaaaaaa]'; DROP TABLE"), false);
  assert.equal(r.isValidExpoToken({ token: 1 }), false);
  assert.equal(r.isValidExpoToken(`ExponentPushToken[${'a'.repeat(300)}]`), false);
});

test('scheduleFingerprint: đổi phòng / tiết → đổi hash; đổi thứ tự bản ghi → giữ hash', () => {
  const s = [{ courseName: 'A', studyTime: '05/10 - 11/10', dayOfWeek: 4, periodText: '1-3', room: 'A1' }, { courseName: 'B', dayOfWeek: 5, periodText: '4-5' }];
  const h = r.scheduleFingerprint(s, []);
  assert.equal(h, r.scheduleFingerprint([...s].reverse(), []));
  assert.notEqual(h, r.scheduleFingerprint([{ ...s[0], room: 'A2' }, s[1]], []));
  assert.notEqual(h, r.scheduleFingerprint([{ ...s[0], periodText: '4-5' }, s[1]], []));
});

test('buildExpoMessages: push ẩn không có title/body; push hiển thị kèm owner', () => {
  const silent = r.buildExpoMessages({ kind: 'sync', silent: true, data: '{"date":"2026-10-07"}' }, ['T1'], 'sv1|student');
  assert.equal(silent[0].title, undefined);
  assert.equal(silent[0].body, undefined);
  assert.equal(silent[0]._contentAvailable, true);
  assert.equal(silent[0].data.type, 'sync');
  assert.equal(silent[0].data.owner, 'sv1|student');
  const vis = r.buildExpoMessages({ kind: 'grade', silent: false, title: 't', body: 'b', data: '{}' }, ['T1', 'T2'], 'sv1|student');
  assert.equal(vis.length, 2);
  assert.equal(vis[1].to, 'T2');
  assert.equal(vis[0].data.owner, 'sv1|student');
  assert.equal(vis[0].channelId, 'exam_and_schedule_reminders');
});

test('interpretTickets: ok / DeviceNotRegistered / lỗi khác', () => {
  const res = r.interpretTickets(['A', 'B', 'C'], [
    { status: 'ok', id: 't1' },
    { status: 'error', details: { error: 'DeviceNotRegistered' } },
    { status: 'error', details: { error: 'MessageRateExceeded' } }
  ]);
  assert.deepEqual(res.okTickets, [{ id: 't1', token: 'A' }]);
  assert.deepEqual(res.deadTokens, ['B']);
  assert.deepEqual(res.retryTokens, ['C']);
});
