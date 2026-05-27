const ScheduleStrategy = require('./ScheduleStrategy');
const { syncStudentData } = require('../services/studentCrawler');
const { syncLecturerData } = require('../services/lecturerCrawler');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const Grade = require('../models/Grade');
const Finance = require('../models/Finance');

/**
 * Chiến lược cào dữ liệu trực tiếp từ cổng trường và tự động lưu đệm (Cache) vào MongoDB
 */
class CrawlerStrategy extends ScheduleStrategy {
  async getSchedule(user, decryptedPassword, options = { semester: '2', schoolYear: '2025' }) {
    console.log(`🔌 [Strategy: Crawler] Đang cào dữ liệu cho tài khoản ${user.username} (Role: ${user.role})...`);
    
    let crawledData;
    
    // 1. Gọi đúng module cào dựa trên vai trò
    if (user.role === 'student') {
      crawledData = await syncStudentData(user.username, decryptedPassword, options);
    } else {
      crawledData = await syncLecturerData(user.username, decryptedPassword, options);
    }

    const { fullName, className, department, scheduleList = [], examList = [], gradeList = [], financeData = null } = crawledData;

    // 2. Lưu đệm (Cache) vào PostgreSQL via Sequelize
    console.log(`💾 [Strategy: Crawler] Đang cập nhật Database Cache cho ${user.username}...`);

    const formattedSemester = `HocKy${options.semester}`;
    const formattedSchoolYear = `${options.schoolYear}-${parseInt(options.schoolYear) + 1}`;

    // A. Xóa lịch học cũ trong kỳ này của user để tránh trùng lặp, sau đó chèn mới
    await Schedule.destroy({ where: { userId: user.id, semester: formattedSemester, schoolYear: formattedSchoolYear } });
    if (scheduleList.length > 0) {
      const schedulesToInsert = scheduleList.map(item => ({
        courseName: item.courseName,
        credits: item.credits,
        classCode: item.classCode || '',
        studyTime: item.studyTime || '',
        dayOfWeek: item.dayOfWeek,
        room: item.room || '',
        teacherName: item.teacherName || '',
        semester: formattedSemester,
        schoolYear: formattedSchoolYear,
        batch: item.batch || 'Dothoc1',
        userId: user.id
      }));
      await Schedule.bulkCreate(schedulesToInsert);
    }

    // B. Xóa lịch thi cũ trong kỳ này của user, sau đó chèn mới
    await Exam.destroy({ where: { userId: user.id, semester: formattedSemester, schoolYear: formattedSchoolYear } });
    if (examList.length > 0) {
      const examsToInsert = examList.map(item => ({
        courseName: item.courseName,
        examDate: item.examDate,
        examTime: item.examTime,
        room: item.room || '',
        seatNumber: item.seatNumber || '',
        examFormat: item.examFormat || '',
        semester: formattedSemester,
        schoolYear: formattedSchoolYear,
        userId: user.id
      }));
      await Exam.bulkCreate(examsToInsert);
    }

    // C. Xóa bảng điểm cũ, sau đó chèn mới
    await Grade.destroy({ where: { userId: user.id, semester: formattedSemester, schoolYear: formattedSchoolYear } });
    if (gradeList.length > 0) {
      const gradesToInsert = gradeList.map(item => ({
        courseName: item.courseName,
        processGrade: item.processGrade,
        midtermGrade: item.midtermGrade,
        finalGrade: item.finalGrade,
        totalGrade10: item.totalGrade10,
        totalGrade4: item.totalGrade4,
        letterGrade: item.letterGrade,
        semester: formattedSemester,
        schoolYear: formattedSchoolYear,
        userId: user.id
      }));
      await Grade.bulkCreate(gradesToInsert);
    }

    // D. Cập nhật học phí công nợ tài chính
    if (financeData) {
      await Finance.destroy({ where: { userId: user.id, semester: formattedSemester } });
      await Finance.create({
        userId: user.id,
        semester: formattedSemester,
        totalTuition: financeData.totalTuition,
        paidTuition: financeData.paidTuition,
        debtTuition: financeData.debtTuition,
        invoiceDetails: financeData.invoiceDetails || []
      });
    }

    // E. Cập nhật hồ sơ cá nhân và thời gian đồng bộ gần nhất của User
    user.fullName = fullName;
    user.className = className;
    user.department = department;
    user.lastSyncedAt = new Date();
    await user.save();

    console.log(`✅ [Strategy: Crawler] Cập nhật Database Cache hoàn tất cho ${user.username}!`);

    return {
      fullName,
      className,
      department,
      lastSyncedAt: user.lastSyncedAt,
      scheduleList,
      examList,
      gradeList,
      financeData
    };
  }
}

module.exports = CrawlerStrategy;
