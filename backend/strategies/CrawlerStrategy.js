const ScheduleStrategy = require('./ScheduleStrategy');
const { syncStudentData, syncAllSemesters } = require('../services/studentCrawler');
const { syncLecturerData } = require('../services/lecturerCrawler');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const Grade = require('../models/Grade');
const Finance = require('../models/Finance');
const Curriculum = require('../models/Curriculum');

/**
 * Chiến lược cào dữ liệu trực tiếp từ cổng trường và tự động lưu đệm (Cache) vào PostgreSQL
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

    const { fullName, className, department, scheduleList = [], examList = [], gradeList = [], financeData = null, curriculumList = [] } = crawledData;

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
        periodText: item.periodText || '',
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

    // E. Lưu Khung Chương trình Đào tạo (CTĐT)
    if (curriculumList.length > 0) {
      await Curriculum.destroy({ where: { userId: user.id } });
      const curriculumToInsert = curriculumList.map(item => ({
        courseName: item.courseName,
        courseCode: item.courseCode || '',
        credits: item.credits || 0,
        courseType: item.courseType || 'Bắt buộc',
        knowledgeBlock: item.knowledgeBlock || 'Chung',
        userId: user.id
      }));
      await Curriculum.bulkCreate(curriculumToInsert);
    }

    // F. Cập nhật hồ sơ cá nhân và thời gian đồng bộ gần nhất của User
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

  /**
   * Đồng bộ lịch sử TẤT CẢ các kỳ (Điểm + Học phí) và lưu đệm vào PostgreSQL
   * @param {Object} user - User model instance
   * @param {string} decryptedPassword - Mật khẩu đã giải mã
   * @returns {Object} Summary of synced data
   */
  async syncHistory(user, decryptedPassword) {
    if (user.role !== 'student') {
      return { message: 'Chức năng lịch sử hiện chỉ hỗ trợ Sinh viên.' };
    }

    console.log(`📚 [Strategy: Crawler] Bắt đầu đồng bộ lịch sử toàn bộ cho ${user.username}...`);

    const historyData = await syncAllSemesters(user.username, decryptedPassword);
    const { allGrades, allFinance } = historyData;

    // Lưu điểm lịch sử vào PostgreSQL (từng kỳ)
    // Nhóm grades theo semester+schoolYear
    const gradesByKey = {};
    for (const grade of allGrades) {
      const key = `${grade.semester}|${grade.schoolYear}`;
      if (!gradesByKey[key]) gradesByKey[key] = [];
      gradesByKey[key].push(grade);
    }

    for (const [key, grades] of Object.entries(gradesByKey)) {
      const [semester, schoolYear] = key.split('|');
      // Xóa dữ liệu cũ của kỳ này
      await Grade.destroy({ where: { userId: user.id, semester, schoolYear } });
      // Chèn mới
      const gradesToInsert = grades.map(item => ({
        courseName: item.courseName,
        processGrade: item.processGrade,
        midtermGrade: item.midtermGrade,
        finalGrade: item.finalGrade,
        totalGrade10: item.totalGrade10,
        totalGrade4: item.totalGrade4,
        letterGrade: item.letterGrade,
        semester,
        schoolYear,
        userId: user.id
      }));
      await Grade.bulkCreate(gradesToInsert);
    }

    // Lưu học phí lịch sử vào PostgreSQL (từng kỳ)
    for (const finance of allFinance) {
      await Finance.destroy({ where: { userId: user.id, semester: finance.semester } });
      await Finance.create({
        userId: user.id,
        semester: finance.semester,
        schoolYear: finance.schoolYear || '',
        totalTuition: finance.totalTuition,
        paidTuition: finance.paidTuition,
        debtTuition: finance.debtTuition,
        invoiceDetails: finance.invoiceDetails || []
      });
    }

    console.log(`📚 [Strategy: Crawler] Đồng bộ lịch sử hoàn tất! ${allGrades.length} môn điểm, ${allFinance.length} kỳ học phí.`);

    return {
      gradesCount: allGrades.length,
      financeCount: allFinance.length,
      enrollmentYear: historyData.enrollmentYear,
      semestersCrawled: historyData.semesterList.length
    };
  }
}

module.exports = CrawlerStrategy;
