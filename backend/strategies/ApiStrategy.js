const ScheduleStrategy = require('./ScheduleStrategy');

/**
 * Chiến lược kết nối và truy xuất trực tiếp dữ liệu từ Database nội bộ của trường qua API bảo mật
 */
class ApiStrategy extends ScheduleStrategy {
  async getSchedule(user, decryptedPassword, options = { semester: '2', schoolYear: '2025' }) {
    console.log(`🔌 [Strategy: API] Đang kết nối trực tiếp cổng API trường cho tài khoản ${user.username}...`);

    // Mô phỏng việc gọi API chính thức của trường (Mock response dữ liệu sạch)
    // Sau này khi trường cấp API, chỉ cần chỉnh sửa module này gửi request GET/POST tới API trường và trả về JSON tương tự.
    const fullName = user.role === 'student' ? 'Nguyễn Văn A (API Mode)' : 'Giảng viên B (API Mode)';
    const className = user.role === 'student' ? 'CN&ĐMST 56' : 'Giảng viên TUAF';
    const department = 'Khoa Công nghệ thông tin';

    const scheduleList = [
      {
        courseName: 'Lập trình Web nâng cao (API Mode)',
        credits: 3,
        classCode: 'Web_IT_56',
        studyTime: '26/02/2026 - 15/06/2026',
        dayOfWeek: 3,
        periodText: '1-3',
        room: 'Phòng 301-A1',
        teacherName: 'Giáo viên Khoa CNTT',
        semester: `HocKy${options.semester}`,
        schoolYear: `${options.schoolYear}-${parseInt(options.schoolYear) + 1}`,
        batch: 'Dothoc1'
      }
    ];

    const examList = [
      {
        courseName: 'Lập trình Web nâng cao (API Mode)',
        examDate: '2026-06-20',
        examTime: 'Ca 2 - 9:30',
        room: 'Phòng thi 101-A1',
        seatNumber: '045',
        examFormat: 'Trắc nghiệm',
        semester: `HocKy${options.semester}`,
        schoolYear: `${options.schoolYear}-${parseInt(options.schoolYear) + 1}`
      }
    ];

    const gradeList = [
      {
        courseName: 'Cơ sở dữ liệu',
        processGrade: 9.0,
        midtermGrade: 8.5,
        finalGrade: 8.0,
        totalGrade10: 8.3,
        totalGrade4: 3.5,
        letterGrade: 'B+',
        semester: `HocKy${options.semester}`,
        schoolYear: `${options.schoolYear}-${parseInt(options.schoolYear) + 1}`
      }
    ];

    const financeData = {
      totalTuition: 4500000,
      paidTuition: 4500000,
      debtTuition: 0,
      invoiceDetails: [
        { invoiceNo: 'HD-92837', amount: 4500000, date: '2026-03-01' }
      ]
    };

    // Giả lập độ trễ phản hồi API của trường siêu nhanh (dưới 50ms)
    await new Promise(resolve => setTimeout(resolve, 30));

    console.log(`✅ [Strategy: API] Lấy dữ liệu thành công cho ${user.username}!`);

    return {
      fullName,
      className,
      department,
      lastSyncedAt: new Date(),
      scheduleList,
      examList,
      gradeList,
      financeData
    };
  }
}

module.exports = ApiStrategy;
