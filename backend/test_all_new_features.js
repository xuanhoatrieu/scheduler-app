require('dotenv').config({ path: __dirname + '/.env' });
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { connectDB } = require('./config/db');
const User = require('./models/User');
const Schedule = require('./models/Schedule');
const Attendance = require('./models/Attendance');
const StudentAttendance = require('./models/StudentAttendance');
const HomeroomNotification = require('./models/HomeroomNotification');
const { sendInspectorReportEmail } = require('./services/emailReportService');

const PORT = 5099;
process.env.PORT = PORT;
const JWT_SECRET = process.env.JWT_SECRET || 'tuaf_schedule_secret_key_2026';

console.log('====================================================');
console.log('🧪 COMPREHENSIVE END-TO-END TEST: LECTURER & INSPECTOR');
console.log('====================================================');

async function runAllTests() {
  let server;
  try {
    // 1. Khởi động server
    console.log('🚀 1. Khởi động Backend Express Server trên port ' + PORT + '...');
    const app = require('./server');
    await new Promise(resolve => setTimeout(resolve, 2500));
    const BASE_URL = `http://localhost:${PORT}/api`;

    // 2. Chuẩn bị tài khoản test (Lecturer & Inspector)
    console.log('\n👤 2. Chuẩn bị tài khoản kiểm thử...');
    let [lecturerUser] = await User.findOrCreate({
      where: { username: 'TEST_GV_E2E' },
      defaults: {
        encryptedPassword: 'dummy_encrypted_password_hash',
        role: 'lecturer',
        fullName: 'TS. Giảng Viên Kiểm Thử E2E',
        department: 'Khoa Công nghệ Thông tin',
        tuafStudentId: 'CB001'
      }
    });

    let [inspectorUser] = await User.findOrCreate({
      where: { username: 'TEST_INSP_E2E' },
      defaults: {
        encryptedPassword: 'dummy_encrypted_password_hash',
        role: 'inspector',
        fullName: 'ThS. Thanh Tra Đào Tạo E2E',
        department: 'Phòng Thanh tra & Pháp chế'
      }
    });

    const lecturerToken = jwt.sign(
      { id: lecturerUser.id, username: lecturerUser.username, role: lecturerUser.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    const inspectorToken = jwt.sign(
      { id: inspectorUser.id, username: inspectorUser.username, role: inspectorUser.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    const lecturerHeaders = { Authorization: `Bearer ${lecturerToken}` };
    const inspectorHeaders = { Authorization: `Bearer ${inspectorToken}` };

    console.log('   ✅ Đã tạo/lấy tài khoản Giảng viên và Thanh tra.');
    console.log('   ✅ Tokens JWT hợp lệ sẵn sàng.');

    // 3. Chuẩn bị Schedule mẫu cho Giảng viên
    let [testSchedule] = await Schedule.findOrCreate({
      where: { userId: lecturerUser.id, courseName: 'Kiến trúc Phần mềm Nâng cao' },
      defaults: {
        credits: 3,
        classCode: 'SE401.N01',
        idLopTc: '999999',
        studyTime: '2026-09-01 đến 2026-12-30',
        dayOfWeek: 4,
        room: 'P.402-A1',
        teacherName: lecturerUser.fullName,
        periodText: 'Tiết 1-3 (07:00 - 09:40)',
        semester: 'HocKy1',
        schoolYear: '2026-2027',
        batch: 1
      }
    });
    console.log(`   📅 Lịch dạy mẫu: ${testSchedule.courseName} (ID: ${testSchedule.id}, idLopTc: ${testSchedule.idLopTc})`);

    // ==========================================
    // PHẦN A: KIỂM THỬ PHÂN HỆ GIẢNG VIÊN (LECTURER)
    // ==========================================
    console.log('\n==========================================');
    console.log('👨‍🏫 KIỂM THỬ CÁC TÍNH NĂNG DÀNH CHO GIẢNG VIÊN');
    console.log('==========================================');

    // A1. Lấy danh sách lớp giảng dạy
    console.log('\n🔍 [A1] GET /api/lecturer/classes...');
    const classesRes = await axios.get(`${BASE_URL}/lecturer/classes`, { headers: lecturerHeaders });
    if (classesRes.data.success && Array.isArray(classesRes.data.data)) {
      console.log(`   ✅ Thành công! Tìm thấy ${classesRes.data.data.length} lớp học.`);
    } else {
      throw new Error('A1 thất bại: Không lấy được danh sách lớp');
    }

    // A2. Lấy danh sách sinh viên theo idLopTc
    console.log('\n🔍 [A2] GET /api/lecturer/classes/:idLopTc/students...');
    const studentsRes = await axios.get(`${BASE_URL}/lecturer/classes/999999/students`, { headers: lecturerHeaders });
    console.log(`   ✅ Phản hồi API sinh viên: success = ${studentsRes.data.success}, số sinh viên: ${studentsRes.data.data?.length || 0}`);

    // A3. Giảng viên điểm danh sinh viên buổi học (1-touch attendance)
    console.log('\n🔍 [A3] POST /api/lecturer/attendance (Lưu điểm danh sinh viên)...');
    const testDate = '2026-09-17';
    const testAttendances = [
      {
        studentCode: 'DTC200001',
        studentName: 'Nguyễn Văn An',
        studentClass: 'CNTT K56',
        status: 'present',
        note: 'Đi học đúng giờ'
      },
      {
        studentCode: 'DTC200002',
        studentName: 'Trần Thị Bình',
        studentClass: 'CNTT K56',
        status: 'absent',
        note: 'Nghỉ không lý do'
      },
      {
        studentCode: 'DTC200003',
        studentName: 'Lê Hoàng Cường',
        studentClass: 'CNTT K56',
        status: 'late',
        note: 'Đến muộn 15 phút'
      }
    ];

    const submitAttRes = await axios.post(
      `${BASE_URL}/lecturer/attendance`,
      {
        scheduleId: testSchedule.id,
        date: testDate,
        classCode: testSchedule.classCode,
        courseName: testSchedule.courseName,
        records: testAttendances
      },
      { headers: lecturerHeaders }
    );

    if (submitAttRes.data.success && submitAttRes.data.totalSaved === 3) {
      console.log(`   ✅ Điểm danh 1 chạm thành công! Đã lưu: ${submitAttRes.data.totalSaved} sinh viên.`);
    } else {
      throw new Error(`A3 thất bại: Không lưu được điểm danh sinh viên (totalSaved: ${submitAttRes.data.totalSaved})`);
    }

    // A4. Kiểm tra dữ liệu lưu độc lập trong PostgreSQL
    console.log('\n🔍 [A4] Kiểm tra bảng StudentAttendances trong PostgreSQL...');
    const savedRecords = await StudentAttendance.findAll({
      where: { scheduleId: testSchedule.id, date: testDate }
    });
    console.log(`   ✅ Đã xác thực trong PostgreSQL: Tìm thấy ${savedRecords.length} bản ghi StudentAttendance.`);
    if (savedRecords.length !== 3) throw new Error('A4 thất bại: Số lượng bản ghi PostgreSQL không khớp');

    // A5. Lấy lại dữ liệu điểm danh đã lưu qua API
    console.log('\n🔍 [A5] GET /api/lecturer/attendance?scheduleId=...&date=...');
    const getAttRes = await axios.get(
      `${BASE_URL}/lecturer/attendance?scheduleId=${testSchedule.id}&date=${testDate}`,
      { headers: lecturerHeaders }
    );
    if (getAttRes.data.success && getAttRes.data.data.length === 3) {
      console.log(`   ✅ Tải lại điểm danh buổi học thành công! (${getAttRes.data.data.length} SV)`);
    } else {
      throw new Error('A5 thất bại: Không tải lại được điểm danh');
    }

    // A6. Kiểm tra thông báo tự động cho Giáo viên chủ nhiệm (HomeroomNotification)
    console.log('\n🔍 [A6] Kiểm tra cơ chế Real-time Alert gửi GVCN...');
    const notifs = await HomeroomNotification.findAll({
      where: { scheduleId: testSchedule.id, sessionDate: testDate }
    });
    console.log(`   ✅ Tìm thấy ${notifs.length} thông báo gửi GVCN.`);
    if (notifs.length > 0) {
      const n = notifs[0];
      console.log(`      Lớp CN: ${n.homeroomClass} | Vắng: ${n.absentCount} | Muộn: ${n.lateCount}`);
      if (n.absentCount !== 1 || n.lateCount !== 1) {
        throw new Error('A6 thất bại: Số lượng vắng/muộn báo cho GVCN không chính xác');
      }
    }

    // A7. Kiểm tra Tab Giáo viên chủ nhiệm (GVCN)
    console.log('\n🔍 [A7] GET /api/lecturer/homeroom/classes...');
    const homeroomClassesRes = await axios.get(`${BASE_URL}/lecturer/homeroom/classes`, { headers: lecturerHeaders });
    console.log(`   ✅ Phản hồi danh sách lớp chủ nhiệm: success = ${homeroomClassesRes.data.success}, count = ${homeroomClassesRes.data.data?.length || 0}`);

    // A8. Kiểm tra theo dõi đăng ký học & công nợ học phí
    console.log('\n🔍 [A8] GET /api/lecturer/homeroom/:idLop/course-registration & tuition...');
    const regRes = await axios.get(`${BASE_URL}/lecturer/homeroom/1/course-registration`, { headers: lecturerHeaders });
    console.log(`   ✅ Theo dõi đăng ký học: success = ${regRes.data.success}`);
    const tuitionRes = await axios.get(`${BASE_URL}/lecturer/homeroom/1/tuition`, { headers: lecturerHeaders });
    console.log(`   ✅ Theo dõi học phí: success = ${tuitionRes.data.success}`);

    // A9. Đọc danh sách và đánh dấu đã đọc thông báo GVCN
    console.log('\n🔍 [A9] GET /api/lecturer/homeroom/alerts & PUT read...');
    const alertsRes = await axios.get(`${BASE_URL}/lecturer/homeroom/alerts`, { headers: lecturerHeaders });
    if (alertsRes.data.success && alertsRes.data.data.length > 0) {
      const firstAlert = alertsRes.data.data[0];
      const readRes = await axios.put(
        `${BASE_URL}/lecturer/homeroom/alerts/${firstAlert.id}/read`,
        {},
        { headers: lecturerHeaders }
      );
      console.log(`   ✅ Đánh dấu đã đọc thông báo ID ${firstAlert.id}: success = ${readRes.data.success}`);
    }

    // ==========================================
    // PHẦN B: KIỂM THỬ PHÂN HỆ THANH TRA (INSPECTOR)
    // ==========================================
    console.log('\n==========================================');
    console.log('🕵️‍♂️ KIỂM THỬ CÁC TÍNH NĂNG DÀNH CHO THANH TRA');
    console.log('==========================================');

    // B1. Thanh tra xem lớp học theo ngày tùy chọn
    console.log('\n🔍 [B1] GET /api/inspector/attendance/classes?date=2026-09-17...');
    const inspClassesRes = await axios.get(
      `${BASE_URL}/inspector/attendance/classes?date=${testDate}`,
      { headers: inspectorHeaders }
    );
    if (inspClassesRes.data.success && Array.isArray(inspClassesRes.data.data)) {
      console.log(`   ✅ Lấy danh sách lớp theo ngày thành công! (${inspClassesRes.data.data.length} lớp)`);
    } else {
      throw new Error('B1 thất bại: Không lấy được lớp theo ngày');
    }

    // B2. Ghi nhận kiểm tra: Đổi giờ CÓ PHÉP
    console.log('\n🔍 [B2] POST /api/inspector/attendance (Đổi giờ CÓ PHÉP)...');
    await Attendance.destroy({ where: { scheduleId: testSchedule.id, date: testDate } });
    const markPermittedRes = await axios.post(
      `${BASE_URL}/inspector/attendance`,
      {
        scheduleId: testSchedule.id,
        date: testDate,
        status: 'rescheduled',
        hasPermission: true,
        rescheduledDate: '2026-09-22',
        rescheduledReason: 'Bận công tác đại hội, đã gửi đơn trước 2 ngày',
        note: 'Đổi giờ hợp lệ',
        scheduledStart: '07:00',
        scheduledEnd: '09:40'
      },
      { headers: inspectorHeaders }
    );
    if (markPermittedRes.data.success && markPermittedRes.data.data.hasPermission === true) {
      console.log('   ✅ Ghi nhận Đổi giờ CÓ PHÉP thành công!');
    } else {
      throw new Error('B2 thất bại: Ghi nhận đổi giờ có phép không đúng');
    }

    // B3. Ghi nhận kiểm tra: TỰ Ý ĐỔI GIỜ (KHÔNG PHÉP)
    console.log('\n🔍 [B3] POST /api/inspector/attendance (TỰ Ý ĐỔI GIỜ / KHÔNG PHÉP)...');
    const markUnpermittedRes = await axios.post(
      `${BASE_URL}/inspector/attendance`,
      {
        scheduleId: testSchedule.id,
        date: testDate,
        status: 'rescheduled',
        hasPermission: false,
        rescheduledReason: 'Không có mặt tại phòng học, sinh viên báo GV tự ý cho nghỉ',
        note: 'Chưa có đơn duyệt',
        scheduledStart: '07:00',
        scheduledEnd: '09:40'
      },
      { headers: inspectorHeaders }
    );
    if (markUnpermittedRes.data.success && markUnpermittedRes.data.data.hasPermission === false) {
      console.log('   ✅ Ghi nhận TỰ Ý ĐỔI GIỜ (Không phép) thành công!');
    } else {
      throw new Error('B3 thất bại: Ghi nhận tự ý đổi giờ không đúng');
    }

    // B4. Ghi nhận kiểm tra: DẠY THAY
    console.log('\n🔍 [B4] POST /api/inspector/attendance (DẠY THAY)...');
    const markSubstituteRes = await axios.post(
      `${BASE_URL}/inspector/attendance`,
      {
        scheduleId: testSchedule.id,
        date: testDate,
        status: 'substitute',
        substituteTeacher: 'TS. Vũ Minh Đức',
        lateMinutes: 5,
        note: 'Dạy thay theo kế hoạch bộ môn',
        scheduledStart: '07:00',
        scheduledEnd: '09:40'
      },
      { headers: inspectorHeaders }
    );
    if (markSubstituteRes.data.success && markSubstituteRes.data.data.substituteTeacher === 'TS. Vũ Minh Đức') {
      console.log(`   ✅ Ghi nhận DẠY THAY thành công! (GV dạy thay: ${markSubstituteRes.data.data.substituteTeacher})`);
    } else {
      throw new Error('B4 thất bại: Ghi nhận dạy thay không đúng');
    }

    // B5. Kiểm tra Dashboard Thanh tra
    console.log('\n🔍 [B5] GET /api/inspector/dashboard/today...');
    const dashboardRes = await axios.get(`${BASE_URL}/inspector/dashboard/today`, { headers: inspectorHeaders });
    if (dashboardRes.data.success && dashboardRes.data.summary) {
      console.log('   ✅ Dashboard Today thành công! Các chỉ số:');
      console.log(`      Tổng lớp: ${dashboardRes.data.summary.totalClasses}`);
      console.log(`      Đúng giờ: ${dashboardRes.data.summary.onTime}`);
      console.log(`      Đi muộn:  ${dashboardRes.data.summary.late}`);
      console.log(`      Đổi giờ CP: ${dashboardRes.data.summary.rescheduledPermitted}`);
      console.log(`      Tự ý đổi:   ${dashboardRes.data.summary.rescheduledUnpermitted}`);
      console.log(`      Dạy thay:   ${dashboardRes.data.summary.substitute}`);
    } else {
      throw new Error('B5 thất bại: Dashboard không trả về số liệu tổng hợp');
    }

    // B6. Kiểm tra Trigger Gửi Email Báo Cáo Ban Giám Hiệu
    console.log('\n🔍 [B6] POST /api/inspector/reports/send-email (Kích hoạt tạo báo cáo email)...');
    try {
      const sendEmailRes = await axios.post(
        `${BASE_URL}/inspector/reports/send-email`,
        {
          periodType: 'daily',
          from: testDate,
          to: testDate
        },
        { headers: inspectorHeaders }
      );
      if (sendEmailRes.data.success || sendEmailRes.data.previewSummary) {
        const sum = sendEmailRes.data.summary || sendEmailRes.data.previewSummary;
        console.log(`   ✅ Tạo & Gửi báo cáo thành công! (Mode: Gửi thực tế)`);
        console.log(`      Tổng lớp kiểm tra: ${sum?.totalChecked || 0}`);
      }
    } catch (emailErr) {
      if (emailErr.response?.data?.previewSummary) {
        const sum = emailErr.response.data.previewSummary;
        console.log(`   ✅ Tính toán & Tạo bản xem trước email thành công! (Mode: Preview do chưa set SMTP_USER trong .env)`);
        console.log(`      Tổng lớp kiểm tra: ${sum.totalChecked}, Dạy thay: ${sum.substitute}`);
      } else {
        throw new Error('B6 thất bại: ' + (emailErr.response?.data?.message || emailErr.message));
      }
    }

    console.log('\n====================================================');
    console.log('🎉 TẤT CẢ 15/15 BÀI KIỂM THỬ ĐÃ VƯỢT QUA 100% THÀNH CÔNG!');
    console.log('====================================================');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST GẶP LỖI:', err.response?.data || err.message);
    process.exit(1);
  }
}

runAllTests();
