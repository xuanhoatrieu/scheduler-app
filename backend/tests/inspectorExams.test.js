process.env.DB_URI = process.env.DB_URI || 'postgres://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-unit-tests';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePeriodNumbers,
  classifySchedulePeriodBlock,
  getExamStartTime,
  calculateExamEndTime,
  classifyExamShift,
  formatExamFormat,
  formatExamTime,
} = require('../utils/periodMapping');
const inspectorRouter = require('../routes/inspector');
const tuafQueries = require('../services/tuafQueries');
const {
  buildHtmlReport,
  escapeHtml,
  evaluateReportSendCondition,
} = require('../services/emailReportService');

test('periodMapping: parsePeriodNumbers & classifySchedulePeriodBlock gom nhóm linh hoạt 2, 3, 4, 5 tiết', () => {
  // 1. parsePeriodNumbers
  assert.deepEqual(parsePeriodNumbers('1-3'), { startPeriod: 1, endPeriod: 3 });
  assert.deepEqual(parsePeriodNumbers('Tiết 6->10'), { startPeriod: 6, endPeriod: 10 });
  assert.deepEqual(parsePeriodNumbers('11-13'), { startPeriod: 11, endPeriod: 13 });

  // 2. Lớp 3 tiết & 2 tiết ca sáng
  const b13 = classifySchedulePeriodBlock('1-3');
  assert.equal(b13.shiftKey, 'morning');
  assert.equal(b13.blockKey, 'morning_1_3');

  const b45 = classifySchedulePeriodBlock('4-5');
  assert.equal(b45.shiftKey, 'morning');
  assert.equal(b45.blockKey, 'morning_4_5');

  // 3. Lớp 4 tiết & 5 tiết xuyên ca sáng (1-4, 1-5)
  const b14 = classifySchedulePeriodBlock('1-4');
  assert.equal(b14.shiftKey, 'morning');
  assert.equal(b14.blockKey, 'morning_1_4');

  const b15 = classifySchedulePeriodBlock('1-5');
  assert.equal(b15.shiftKey, 'morning');
  assert.equal(b15.blockKey, 'morning_1_5');

  // 4. Lớp ca chiều (6-8, 9-10, 6-9, 6-10)
  const b68 = classifySchedulePeriodBlock('6-8');
  assert.equal(b68.shiftKey, 'afternoon');
  assert.equal(b68.blockKey, 'afternoon_6_8');

  const b910 = classifySchedulePeriodBlock('9-10');
  assert.equal(b910.shiftKey, 'afternoon');
  assert.equal(b910.blockKey, 'afternoon_9_10');

  const b69 = classifySchedulePeriodBlock('6-9');
  assert.equal(b69.shiftKey, 'afternoon');
  assert.equal(b69.blockKey, 'afternoon_6_9');

  const b610 = classifySchedulePeriodBlock('6-10');
  assert.equal(b610.shiftKey, 'afternoon');
  assert.equal(b610.blockKey, 'afternoon_6_10');

  // 5. Lớp ca tối (11-13)
  const b1113 = classifySchedulePeriodBlock('11-13');
  assert.equal(b1113.shiftKey, 'evening');
  assert.equal(b1113.blockKey, 'evening_11_13');
});

test('periodMapping: Chuẩn hóa giờ thi và phân ca thi cho Thanh tra', () => {
  assert.equal(getExamStartTime('07 giờ 30', 1), '07:30');
  assert.equal(getExamStartTime('', 4), '09:00');
  assert.equal(getExamStartTime('', 11), '13:30');
  assert.equal(calculateExamEndTime('07:30', 90), '09:00');
  assert.equal(formatExamTime('07:30', 90), '07:30 - 09:00 (90p)');
  assert.equal(formatExamFormat(12, ''), 'Thực hành máy');

  const shift1 = classifyExamShift('07:30');
  assert.equal(shift1.shiftKey, 'ca1');
  assert.equal(shift1.sessionKey, 'morning');

  const shift2 = classifyExamShift('09:30');
  assert.equal(shift2.shiftKey, 'ca2');
  assert.equal(shift2.sessionKey, 'morning');

  const shift3 = classifyExamShift('13:30');
  assert.equal(shift3.shiftKey, 'ca3');
  assert.equal(shift3.sessionKey, 'afternoon');

  const shift4 = classifyExamShift('15:30');
  assert.equal(shift4.shiftKey, 'ca4');
  assert.equal(shift4.sessionKey, 'afternoon');
});

test('inspectorRouter: sortInspectorClasses và sortInspectorExamRooms sắp xếp chuẩn theo tiết, giờ, phòng', () => {
  const classes = [
    { periodText: '4-5', scheduledStart: '09:45', room: 'GD2-202', classCode: 'B' },
    { periodText: '1-3', scheduledStart: '07:00', room: 'GD2-102', classCode: 'C' },
    { periodText: '1-3', scheduledStart: '07:00', room: 'GD2-101', classCode: 'A' },
    { periodText: '1-5', scheduledStart: '07:00', room: 'GD2-101', classCode: 'D' },
  ];

  const sortedClasses = inspectorRouter.sortInspectorClasses(classes);
  assert.equal(sortedClasses[0].room, 'GD2-101');
  assert.equal(sortedClasses[0].periodText, '1-3');
  assert.equal(sortedClasses[1].room, 'GD2-102');
  assert.equal(sortedClasses[1].periodText, '1-3');
  assert.equal(sortedClasses[2].periodText, '1-5');
  assert.equal(sortedClasses[3].periodText, '4-5');

  const examRooms = [
    { startTime: '13:30', tuTiet: 11, room: 'P202', courseCode: 'HP2' },
    { startTime: '07:30', tuTiet: 1, room: 'P105', courseCode: 'HP1' },
    { startTime: '07:30', tuTiet: 1, room: 'P101', courseCode: 'HP1' },
  ];
  const sortedExams = inspectorRouter.sortInspectorExamRooms(examRooms);
  assert.equal(sortedExams[0].room, 'P101');
  assert.equal(sortedExams[1].room, 'P105');
  assert.equal(sortedExams[2].room, 'P202');
});

test('tuafQueries: getInspectorExamRoomsByDate gộp và khử trùng lặp 2 phân hệ thi', async () => {
  let callCount = 0;
  const mockPool = {
    request() {
      return {
        input() {
          return this;
        },
        async query() {
          callCount += 1;
          if (callCount === 1) {
            return {
              recordset: [
                {
                  idDotThiPhong: 5001,
                  idPhongThi: 901,
                  examDate: new Date('2026-06-15'),
                  gioThi: '07:30',
                  tuTiet: 1,
                  soTiet: 2,
                  room: 'GD2-101',
                  studentCount: 35,
                  courseCode: 'IT101',
                  courseName: 'Tin học đại cương',
                  hinhThucId: 12,
                  tenHinhThuc: 'Trắc nghiệm máy',
                  soPhutThi: 60,
                  lanThi: 1,
                  tenDot: 'Đợt 1',
                  cbCoiThi1: 'Nguyễn Văn A',
                  cbCoiThi2: 'Trần Thị B',
                },
              ],
            };
          }
          return {
            recordset: [
              // Bản ghi trùng idDotThiPhong 5001 -> phải được khử trùng lặp
              {
                idDotThiPhong: 5001,
                idPhongThi: 901,
                examDate: new Date('2026-06-15'),
                gioThi: '07:30',
                tuTiet: 1,
                soTiet: 2,
                room: 'GD2-101',
                studentCount: 35,
                courseCode: 'IT101',
                courseName: 'Tin học đại cương',
              },
              // Bản ghi phòng thi thứ 2 chỉ có ở phân hệ MARK
              {
                idDotThiPhong: null,
                idPhongThi: 902,
                examDate: new Date('2026-06-15'),
                gioThi: '09:30',
                tuTiet: 4,
                soTiet: 2,
                room: 'GD2-102',
                studentCount: 40,
                courseCode: 'IT102',
                courseName: 'Cấu trúc dữ liệu',
                cbCoiThi1: 'Lê Văn C',
              },
            ],
          };
        },
      };
    },
  };

  const rooms = await tuafQueries.getInspectorExamRoomsByDate(mockPool, '2026-06-15');
  assert.equal(rooms.length, 2);
  assert.equal(rooms[0].room, 'GD2-101');
  assert.equal(rooms[1].room, 'GD2-102');
});

test('emailReportService: buildHtmlReport hiển thị thống kê thi cử, vi phạm thi và chống XSS', () => {
  const escaped = escapeHtml('<script>alert("xss")</script>');
  assert.equal(escaped, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');

  const html = buildHtmlReport({
    periodLabel: 'Ngày 15/06/2026',
    from: '2026-06-15',
    to: '2026-06-15',
    summary: {
      totalRecords: 10,
      onTime: 9,
      late: 1,
      earlyLeave: 0,
      absent: 0,
      rescheduledPermitted: 0,
      rescheduledUnpermitted: 0,
      substitute: 0,
    },
    violations: [],
    rescheduledClasses: [],
    substituteClasses: [],
    examSummary: {
      totalRoomsChecked: 5,
      normalRooms: 4,
      issueRooms: 1,
      proctorLate: 1,
      proctorChanged: 0,
      proctorAbsent: 0,
      totalViolations: 1,
      reprimandCount: 0,
      warningCount: 0,
      suspensionCount: 1,
      lateDisqualifiedCount: 0,
    },
    examRoomIssues: [
      {
        examDate: '2026-06-15',
        examTime: '07:30 - 09:00',
        room: 'GD2-101',
        courseName: 'Tin học đại cương',
        proctor1: 'Nguyễn Văn A',
        status: 'proctor_late',
        lateMinutes: 10,
        note: 'Đến muộn do mưa lớn <b>test</b>',
      },
    ],
    examViolations: [
      {
        examDate: '2026-06-15',
        examTime: '07:30 - 09:00',
        room: 'GD2-101',
        courseName: 'Tin học đại cương',
        studentCode: 'DTC215480',
        studentName: 'Phạm Văn X <script>evil()</script>',
        studentClass: 'CNTT K20',
        violationLevel: 'suspension',
        violationActions: ['Sử dụng điện thoại di động trong phòng thi'],
        penalty: 'Điểm 0 bài thi',
        note: 'Thu giữ 1 điện thoại',
      },
    ],
  });

  assert.ok(html.includes('Danh sách Thí sinh Vi phạm Quy chế Thi'));
  assert.ok(html.includes('Ghi nhận Phòng thi & Cán bộ coi thi'));
  assert.ok(html.includes('DTC215480'));
  assert.ok(html.includes('Sử dụng điện thoại di động trong phòng thi'));
  assert.ok(!html.includes('<script>evil()</script>'));
  assert.ok(html.includes('&lt;script&gt;evil()&lt;/script&gt;'));
});

test('emailReportService: evaluateReportSendCondition chỉ gửi email khi có hoạt động kiểm tra VÀ có sự kiện/vi phạm', () => {
  // 1. Cuối tuần / không có lớp học hoặc không có hoạt động kiểm tra nào -> không gửi
  const noActivity = evaluateReportSendCondition({
    summary: { totalChecked: 0, onTime: 0 },
    violations: [],
    examSummary: { totalRoomsChecked: 0, totalViolations: 0, issueRooms: 0 },
    examViolations: [],
    examRoomIssues: [],
  });
  assert.equal(noActivity.shouldSend, false);
  assert.equal(noActivity.reason, 'no_activity');

  // 2. Có kiểm tra 15 lớp học và 4 phòng thi nhưng tất cả đều bình thường hết -> không gửi
  const allNormal = evaluateReportSendCondition({
    summary: { totalChecked: 15, onTime: 15 },
    violations: [],
    examSummary: { totalRoomsChecked: 4, totalViolations: 0, issueRooms: 0 },
    examViolations: [],
    examRoomIssues: [],
  });
  assert.equal(allNormal.shouldSend, false);
  assert.equal(allNormal.reason, 'all_normal');

  // 3. Có sự vụ giảng dạy (đi muộn / vắng / đổi giờ / ghi chú) -> gửi
  const hasTeachingEvent = evaluateReportSendCondition({
    summary: { totalChecked: 10, onTime: 9, late: 1 },
    violations: [{ teacherName: 'Nguyễn Văn A', statusText: 'Muộn 15p' }],
    examSummary: { totalRoomsChecked: 0, totalViolations: 0, issueRooms: 0 },
    examViolations: [],
    examRoomIssues: [],
  });
  assert.equal(hasTeachingEvent.shouldSend, true);
  assert.equal(hasTeachingEvent.reason, 'has_events');

  // 4. Giảng dạy bình thường nhưng có sinh viên vi phạm thi hoặc phòng thi bất thường -> gửi
  const hasExamEvent = evaluateReportSendCondition({
    summary: { totalChecked: 10, onTime: 10 },
    violations: [],
    examSummary: { totalRoomsChecked: 3, totalViolations: 1, issueRooms: 0 },
    examViolations: [{ studentCode: 'DTC123', violationLevel: 'warning' }],
    examRoomIssues: [],
  });
  assert.equal(hasExamEvent.shouldSend, true);
  assert.equal(hasExamEvent.reason, 'has_events');
});

