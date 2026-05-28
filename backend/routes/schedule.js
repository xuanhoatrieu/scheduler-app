const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const Grade = require('../models/Grade');
const Finance = require('../models/Finance');
const { decrypt } = require('../utils/security');
const strategyManager = require('../strategies/StrategyManager');

/**
 * Hàm trợ giúp để kích hoạt ép buộc đồng bộ (Force Sync) dữ liệu thời gian thực
 */
const handleForceSync = async (user, req) => {
  const semester = req.query.semester || '2';
  const schoolYear = req.query.schoolYear || '2025';
  
  console.log(`🔄 [API Sync] Đang kích hoạt ép buộc đồng bộ thời gian thực cho ${user.username}...`);
  const decryptedPassword = decrypt(user.encryptedPassword);
  const strategy = strategyManager.getStrategy();
  
  return await strategy.getSchedule(user, decryptedPassword, {
    semester,
    schoolYear
  });
};

/**
 * @route   GET /api/schedule
 * @desc    Lấy thời khóa biểu (lịch học/lịch giảng dạy) từ cache PostgreSQL, hỗ trợ forceSync=true
 * @access  Private (JWT)
 */
router.get('/schedule', authMiddleware, async (req, res) => {
  try {
    const semester = req.query.semester || '2';
    const schoolYear = req.query.schoolYear || '2025';
    const formattedSemester = `HocKy${semester}`;
    const formattedSchoolYear = `${schoolYear}-${parseInt(schoolYear) + 1}`;

    // 1. Kích hoạt đồng bộ realtime nếu forceSync = true
    if (req.query.forceSync === 'true') {
      await handleForceSync(req.user, req);
    }

    // 2. Lấy dữ liệu đã cache từ PostgreSQL
    const schedules = await Schedule.findAll({
      where: {
        userId: req.user.id,
        semester: formattedSemester,
        schoolYear: formattedSchoolYear
      },
      order: [['dayOfWeek', 'ASC'], ['studyTime', 'ASC']]
    });

    res.json({
      success: true,
      data: schedules,
      lastSyncedAt: req.user.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ [API /schedule] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể tải lịch học. Vui lòng thử lại sau!',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/exams
 * @desc    Lấy lịch thi từ cache PostgreSQL, hỗ trợ forceSync=true
 * @access  Private (JWT)
 */
router.get('/exams', authMiddleware, async (req, res) => {
  try {
    const semester = req.query.semester || '2';
    const schoolYear = req.query.schoolYear || '2025';
    const formattedSemester = `HocKy${semester}`;
    const formattedSchoolYear = `${schoolYear}-${parseInt(schoolYear) + 1}`;

    if (req.query.forceSync === 'true') {
      await handleForceSync(req.user, req);
    }

    const exams = await Exam.findAll({
      where: {
        userId: req.user.id,
        semester: formattedSemester,
        schoolYear: formattedSchoolYear
      },
      order: [['examDate', 'ASC']]
    });

    res.json({
      success: true,
      data: exams,
      lastSyncedAt: req.user.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ [API /exams] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể tải lịch thi!',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/grades
 * @desc    Lấy bảng điểm số từ cache PostgreSQL, hỗ trợ forceSync=true
 * @access  Private (JWT)
 */
router.get('/grades', authMiddleware, async (req, res) => {
  try {
    const semester = req.query.semester || '2';
    const schoolYear = req.query.schoolYear || '2025';
    const formattedSemester = `HocKy${semester}`;
    const formattedSchoolYear = `${schoolYear}-${parseInt(schoolYear) + 1}`;

    if (req.query.forceSync === 'true') {
      await handleForceSync(req.user, req);
    }

    const grades = await Grade.findAll({
      where: {
        userId: req.user.id,
        semester: formattedSemester,
        schoolYear: formattedSchoolYear
      }
    });

    res.json({
      success: true,
      data: grades,
      lastSyncedAt: req.user.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ [API /grades] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể tải bảng điểm học tập!',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/finance
 * @desc    Lấy học phí/công nợ tài chính từ cache PostgreSQL, hỗ trợ forceSync=true
 * @access  Private (JWT)
 */
router.get('/finance', authMiddleware, async (req, res) => {
  try {
    const semester = req.query.semester || '2';
    const formattedSemester = `HocKy${semester}`;

    if (req.query.forceSync === 'true') {
      await handleForceSync(req.user, req);
    }

    const finance = await Finance.findOne({
      where: {
        userId: req.user.id,
        semester: formattedSemester
      }
    });

    res.json({
      success: true,
      data: finance || {
        totalTuition: 0,
        paidTuition: 0,
        debtTuition: 0,
        invoiceDetails: []
      },
      lastSyncedAt: req.user.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ [API /finance] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể tải thông tin học phí công nợ!',
      error: error.message
    });
  }
});
/**
 * @route   GET /api/grades/all
 * @desc    Lấy bảng điểm TẤT CẢ các kỳ, nhóm theo semester + schoolYear
 * @access  Private (JWT)
 */
router.get('/grades/all', authMiddleware, async (req, res) => {
  try {
    const grades = await Grade.findAll({
      where: { userId: req.user.id },
      order: [['schoolYear', 'ASC'], ['semester', 'ASC'], ['courseName', 'ASC']]
    });

    // Nhóm theo semester + schoolYear
    const grouped = {};
    for (const g of grades) {
      const key = `${g.semester}|${g.schoolYear}`;
      if (!grouped[key]) {
        grouped[key] = {
          semester: g.semester,
          schoolYear: g.schoolYear,
          courses: []
        };
      }
      grouped[key].courses.push(g);
    }

    // Tính GPA tích lũy từ tất cả các môn có điểm hệ 4
    const allGradesWithGrade4 = grades.filter(g => g.totalGrade4 !== null && g.totalGrade4 !== undefined);
    const totalCredits = allGradesWithGrade4.length; // mỗi môn tạm tính 1 đơn vị
    const cumulativeGPA = allGradesWithGrade4.length > 0
      ? (allGradesWithGrade4.reduce((sum, g) => sum + g.totalGrade4, 0) / allGradesWithGrade4.length).toFixed(2)
      : null;

    res.json({
      success: true,
      data: Object.values(grouped),
      summary: {
        totalCourses: grades.length,
        totalSemesters: Object.keys(grouped).length,
        cumulativeGPA: cumulativeGPA ? parseFloat(cumulativeGPA) : null
      },
      lastSyncedAt: req.user.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ [API /grades/all] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải bảng điểm tổng hợp!', error: error.message });
  }
});

/**
 * @route   GET /api/finance/all
 * @desc    Lấy lịch sử tài chính TẤT CẢ các kỳ
 * @access  Private (JWT)
 */
router.get('/finance/all', authMiddleware, async (req, res) => {
  try {
    const finances = await Finance.findAll({
      where: { userId: req.user.id },
      order: [['schoolYear', 'ASC'], ['semester', 'ASC']]
    });

    // Tính tổng qua toàn bộ kỳ
    const totalPaid = finances.reduce((sum, f) => sum + (f.paidTuition || 0), 0);
    const totalDebt = finances.reduce((sum, f) => sum + (f.debtTuition || 0), 0);
    const totalTuition = finances.reduce((sum, f) => sum + (f.totalTuition || 0), 0);

    res.json({
      success: true,
      data: finances,
      summary: {
        totalTuition,
        totalPaid,
        totalDebt,
        totalSemesters: finances.length
      },
      lastSyncedAt: req.user.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ [API /finance/all] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải lịch sử tài chính!', error: error.message });
  }
});

/**
 * @route   POST /api/sync-history
 * @desc    Kích hoạt cào đồng bộ lịch sử TẤT CẢ các kỳ (Điểm + Học phí)
 * @access  Private (JWT)
 */
router.post('/sync-history', authMiddleware, async (req, res) => {
  try {
    const { decrypt } = require('../utils/security');
    const decryptedPassword = decrypt(req.user.encryptedPassword);
    const strategy = strategyManager.getStrategy();

    const result = await strategy.syncHistory(req.user, decryptedPassword);

    res.json({
      success: true,
      message: `Đồng bộ lịch sử hoàn tất!`,
      ...result
    });
  } catch (error) {
    console.error('❌ [API /sync-history] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể đồng bộ lịch sử!', error: error.message });
  }
});

/**
 * @route   GET /api/curriculum
 * @desc    Lấy Khung Chương trình Đào tạo, merge với bảng điểm để xác định trạng thái từng môn
 * @access  Private (JWT, role=student)
 */
router.get('/curriculum', authMiddleware, async (req, res) => {
  try {
    const Curriculum = require('../models/Curriculum');

    // 1. Lấy CTĐT đã cache
    const curriculum = await Curriculum.findAll({
      where: { userId: req.user.id },
      order: [['knowledgeBlock', 'ASC'], ['courseName', 'ASC']]
    });

    // 2. Lấy tất cả điểm đã có
    const grades = await Grade.findAll({
      where: { userId: req.user.id }
    });

    // 3. Lấy lịch học kỳ hiện tại (môn đang học)
    const schedules = await Schedule.findAll({
      where: { userId: req.user.id }
    });

    // 4. Tạo lookup maps
    const gradeMap = {};
    for (const g of grades) {
      const key = g.courseName.toLowerCase().trim();
      // Nếu môn xuất hiện nhiều lần (học lại), lấy kết quả mới nhất
      if (!gradeMap[key] || (g.totalGrade4 !== null && (gradeMap[key].totalGrade4 === null || g.totalGrade4 > gradeMap[key].totalGrade4))) {
        gradeMap[key] = g;
      }
    }

    const studyingSet = new Set();
    for (const s of schedules) {
      studyingSet.add(s.courseName.toLowerCase().trim());
    }

    // 5. Merge: gán status cho từng môn trong CTĐT
    const mergedCurriculum = curriculum.map(c => {
      const key = c.courseName.toLowerCase().trim();
      const grade = gradeMap[key];
      const isStudying = studyingSet.has(key);

      let status = 'not_started'; // Chưa học
      let letterGrade = null;
      let totalGrade10 = null;
      let totalGrade4 = null;

      if (grade) {
        letterGrade = grade.letterGrade;
        totalGrade10 = grade.totalGrade10;
        totalGrade4 = grade.totalGrade4;

        if (grade.letterGrade === 'F') {
          status = 'failed'; // Điểm F - học lại
        } else if (grade.letterGrade && grade.letterGrade !== '') {
          status = 'passed'; // Đã đạt
        } else if (isStudying) {
          status = 'studying'; // Đang học
        }
      } else if (isStudying) {
        status = 'studying';
      }

      return {
        courseName: c.courseName,
        courseCode: c.courseCode,
        credits: c.credits,
        courseType: c.courseType,
        knowledgeBlock: c.knowledgeBlock,
        status,
        letterGrade,
        totalGrade10,
        totalGrade4
      };
    });

    // 6. Nếu chưa có CTĐT từ portal → fallback: dùng dữ liệu từ bảng điểm
    let finalData = mergedCurriculum;
    if (finalData.length === 0 && grades.length > 0) {
      finalData = grades.map(g => ({
        courseName: g.courseName,
        courseCode: '',
        credits: 0,
        courseType: 'Đã học',
        knowledgeBlock: `${g.semester} — ${g.schoolYear}`,
        status: g.letterGrade === 'F' ? 'failed' : (g.letterGrade ? 'passed' : 'studying'),
        letterGrade: g.letterGrade,
        totalGrade10: g.totalGrade10,
        totalGrade4: g.totalGrade4
      }));
    }

    // 7. Tính thống kê tiến độ
    const totalCredits = finalData.reduce((sum, c) => sum + (c.credits || 0), 0);
    const passedCredits = finalData.filter(c => c.status === 'passed').reduce((sum, c) => sum + (c.credits || 0), 0);
    const failedCount = finalData.filter(c => c.status === 'failed').length;
    const studyingCount = finalData.filter(c => c.status === 'studying').length;

    res.json({
      success: true,
      data: finalData,
      summary: {
        totalCourses: finalData.length,
        totalCredits,
        passedCredits,
        failedCount,
        studyingCount,
        progressPercent: totalCredits > 0 ? Math.round((passedCredits / totalCredits) * 100) : 0
      },
      source: curriculum.length > 0 ? 'portal' : 'grades_fallback',
      lastSyncedAt: req.user.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ [API /curriculum] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải chương trình đào tạo!', error: error.message });
  }
});

module.exports = router;
