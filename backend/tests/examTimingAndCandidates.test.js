process.env.DB_URI = process.env.DB_URI || 'postgres://localhost/test';
const test = require('node:test');
const assert = require('node:assert/strict');
const DatabaseStrategy = require('../strategies/DatabaseStrategy');

test('DatabaseStrategy: Tính giờ bắt đầu thi từ gioThi hoặc tuTiet', () => {
  const strategy = new DatabaseStrategy();

  // 1. Chuỗi gioThi dạng "13 giờ 30" hoặc "7:30"
  assert.equal(strategy._getExamStartTime('13 giờ 30', null), '13:30');
  assert.equal(strategy._getExamStartTime('7 giờ 15', null), '07:15');
  assert.equal(strategy._getExamStartTime('08:45', null), '08:45');

  // 2. Không có gioThi -> ánh xạ theo tuTiet của lịch thi
  // Tiết 11 trong lịch thi = 13h30 chiều (môn Nền tảng AI)
  assert.equal(strategy._getExamStartTime('', 11), '13:30');
  // Tiết 14 trong lịch thi = 15h00
  assert.equal(strategy._getExamStartTime(null, 14), '15:00');
  // Tiết 1 trong lịch thi = 07h30 sáng
  assert.equal(strategy._getExamStartTime('', 1), '07:30');
  // Tiết 4 trong lịch thi = 09h00 sáng
  assert.equal(strategy._getExamStartTime('', 4), '09:00');
  // Tiết 10 trong lịch thi = 13h00 chiều
  assert.equal(strategy._getExamStartTime('', 10), '13:00');
  // Tiết 31 = 07h30, Tiết 34 = 09h05, Tiết 37 = 10h40
  assert.equal(strategy._getExamStartTime('', 31), '07:30');
  assert.equal(strategy._getExamStartTime('', 34), '09:05');
  assert.equal(strategy._getExamStartTime('', 37), '10:40');
});

test('DatabaseStrategy: Tính giờ kết thúc từ thời lượng thi', () => {
  const strategy = new DatabaseStrategy();

  assert.equal(strategy._calculateExamEndTime('13:30', 60), '14:30');
  assert.equal(strategy._calculateExamEndTime('07:30', 90), '09:00');
  assert.equal(strategy._calculateExamEndTime('08:00', 120), '10:00');
  assert.equal(strategy._calculateExamEndTime('15:15', 45), '16:00');
});

test('DatabaseStrategy: Định dạng examTime và examShift chuẩn xác', () => {
  const strategy = new DatabaseStrategy();

  // Ca chiều 13:30 thi 60 phút
  const examTime = strategy._formatExamTime('13:30', 60);
  assert.equal(examTime, '13:30 - 14:30 (60p)');

  const shiftAfternoon = strategy._formatExamShift('13:30', null);
  assert.equal(shiftAfternoon, 'Ca Chiều');

  const shiftMorning = strategy._formatExamShift('07:30', null);
  assert.equal(shiftMorning, 'Ca Sáng');

  const shiftNight = strategy._formatExamShift('18:30', null);
  assert.equal(shiftNight, 'Ca Tối');
});

test('DatabaseStrategy: _transformLecturerExams gán đúng idDotThiPhong và định dạng', () => {
  const strategy = new DatabaseStrategy();

  const rawRows = [
    {
      courseCode: 'QT703051',
      courseName: 'Nền tảng của Trí tuệ nhân tạo',
      credits: 3,
      ID_lop_tc: 11951,
      idDotThiPhong: 19999,
      Ten_lop_hp: 'Nền tảng của Trí tuệ nhân tạo_CN&ĐMST 57',
      Ngay_thi: '2026-10-26T00:00:00.000Z',
      Tu_tiet: 11,
      So_tiet: 2,
      Gio_thi: '13 giờ 30',
      Phong: 'PM1',
      Si_so: 30,
      Hinh_thuc: 12,
      So_phut_thi: 60,
      Ten_hinh_thuc: 'Thực hành máy',
      Lan_thi: 1,
      Ten_dot: '1',
      CbCoiThi1: 'Nguyễn Văn A',
      CbCoiThi2: ''
    }
  ];

  const transformed = strategy._transformLecturerExams(rawRows);
  assert.equal(transformed.length, 1);
  const exam = transformed[0];

  assert.equal(exam.idDotThiPhong, 19999);
  assert.equal(exam.startTime, '13:30');
  assert.equal(exam.examTime, '13:30 - 14:30 (60p)');
  assert.equal(exam.examShift, 'Ca Chiều');
  assert.equal(exam.studentCount, 30);
  assert.equal(exam.room, 'PM1');
});

test('tuafQueries.isAuthorizedForExamRoom: Phân quyền xem danh sách ca thi', async () => {
  const tuafQueries = require('../services/tuafQueries');

  function createMockPool(recordset = []) {
    return {
      request() {
        return {
          input() { return this; },
          async query() { return { recordset }; }
        };
      }
    };
  }

  // 1. Không có idCb -> false
  const noCb = await tuafQueries.isAuthorizedForExamRoom(null, null, 19999, 11951);
  assert.equal(noCb, false);

  // 2. Mock pool trả về kết quả dạy học -> true
  const mockPoolTeaching = createMockPool([{ ok: 1 }]);
  const authTeaching = await tuafQueries.isAuthorizedForExamRoom(mockPoolTeaching, 'cb-123', null, 11951);
  assert.equal(authTeaching, true);

  // 3. Mock pool không dạy và không coi thi -> false
  const mockPoolNone = createMockPool([]);
  const authNone = await tuafQueries.isAuthorizedForExamRoom(mockPoolNone, 'cb-unknown', 19999, 99999);
  assert.equal(authNone, false);
});
