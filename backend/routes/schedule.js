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
 * Chuẩn hóa tham số học kỳ và năm học từ request query
 */
const normalizeTerm = (semQuery, yearQuery) => {
  const semester = String(semQuery || '1').replace('HocKy', '');
  const rawYear = String(yearQuery || '2026').replace('_', '-');
  const startYear = parseInt(rawYear.split('-')[0]) || 2026;
  const formattedSemester = `HocKy${semester}`;
  const formattedSchoolYear = `${startYear}-${startYear + 1}`;
  return { semester, startYear, formattedSemester, formattedSchoolYear };
};

/**
 * Hàm trợ giúp để kích hoạt ép buộc đồng bộ (Force Sync) dữ liệu thời gian thực
 */
const handleForceSync = async (user, req) => {
  const { semester, startYear } = normalizeTerm(req.query.semester, req.query.schoolYear);
  const dataSource = process.env.DATA_SOURCE || 'database';
  
  console.log(`🔄 [API Sync] Đang kích hoạt ép buộc đồng bộ cho ${user.username} (mode: ${dataSource})...`);
  const decryptedPassword = decrypt(user.encryptedPassword);
  const strategy = strategyManager.getStrategy();
  
  try {
    return await strategy.getSchedule(user, decryptedPassword, { semester, schoolYear: String(startYear) });
  } catch (err) {
    if (dataSource === 'database') {
      console.warn(`⚠️ [API Sync] Database lỗi, fallback crawler: ${err.message}`);
      const crawler = strategyManager.getCrawlerStrategy();
      return await crawler.getSchedule(user, decryptedPassword, { semester, schoolYear: String(startYear) });
    }
    throw err;
  }
};

/**
 * @route   GET /api/schedule/semesters
 * @desc    Lấy danh sách các học kỳ có dữ liệu hoặc đang hoạt động (cho Semester Picker)
 * @access  Private (JWT)
 */
router.get('/schedule/semesters', authMiddleware, async (req, res) => {
  try {
    const dataSource = process.env.DATA_SOURCE || 'database';
    const semestersSet = new Map();

    const addEntry = (semRaw, syRaw, isCurrent = false) => {
      if (!semRaw || !syRaw) return;
      const semNum = String(semRaw).replace('HocKy', '');
      const rawY = String(syRaw).replace('_', '-');
      const startYear = parseInt(rawY.split('-')[0]) || 2026;
      const fullSchoolYear = `${startYear}-${startYear + 1}`;
      const key = `${semNum}|${startYear}`;
      if (!semestersSet.has(key)) {
        semestersSet.set(key, {
          label: `HK${semNum} ${fullSchoolYear}`,
          semester: semNum,
          schoolYear: String(startYear),
          fullSchoolYear,
          current: isCurrent
        });
      } else if (isCurrent) {
        semestersSet.get(key).current = true;
      }
    };

    // 1. Lấy tất cả các kỳ đã có dữ liệu trong PostgreSQL cache
    const [userSchedules, userGrades, userFinances] = await Promise.all([
      Schedule.findAll({
        attributes: ['semester', 'schoolYear'],
        where: { userId: req.user.id },
        group: ['semester', 'schoolYear']
      }),
      Grade.findAll({
        attributes: ['semester', 'schoolYear'],
        where: { userId: req.user.id },
        group: ['semester', 'schoolYear']
      }),
      Finance.findAll({
        attributes: ['semester', 'schoolYear'],
        where: { userId: req.user.id },
        group: ['semester', 'schoolYear']
      })
    ]);

    userSchedules.forEach(s => addEntry(s.semester, s.schoolYear));
    userGrades.forEach(g => addEntry(g.semester, g.schoolYear));
    userFinances.forEach(f => addEntry(f.semester, f.schoolYear));

    // 2. Nếu ở mode database, lấy thêm kỳ active từ SQL Server TUAF
    if (dataSource === 'database') {
      try {
        const namvietConnector = require('../services/namvietConnector');
        const tuafQueries = require('../services/tuafQueries');
        const pool = await namvietConnector.getPool();
        const currentTerm = await tuafQueries.getCurrentTerm(pool);
        if (currentTerm) {
          addEntry(currentTerm.Hoc_ky, currentTerm.Nam_hoc, true);
        }
      } catch (dbErr) {
        console.warn('⚠️ [API /schedule/semesters] Lỗi lấy currentTerm từ SQL Server:', dbErr.message);
      }
    }

    // 3. Đảm bảo các kỳ hiện tại và kỳ kế tiếp luôn có mặt trong danh sách
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const isSem1 = currentMonth >= 8;
    const baseYear = isSem1 ? currentYear : currentYear - 1;
    const activeSem = isSem1 ? '1' : '2';

    if (isSem1) {
      addEntry('2', String(baseYear), false); // Kỳ 2 sắp tới
    } else {
      addEntry('1', String(baseYear + 1), false); // Kỳ 1 năm sau sắp tới
    }
    addEntry(activeSem, String(baseYear), true);

    for (let y = baseYear; y >= baseYear - 4; y--) {
      addEntry('2', String(y));
      addEntry('1', String(y));
    }

    // 4. Sắp xếp giảm dần theo năm học, sau đó theo học kỳ
    const sortedList = Array.from(semestersSet.values()).sort((a, b) => {
      const yearDiff = parseInt(b.schoolYear) - parseInt(a.schoolYear);
      if (yearDiff !== 0) return yearDiff;
      return parseInt(b.semester) - parseInt(a.semester);
    });

    if (!sortedList.some(s => s.current) && sortedList.length > 0) {
      sortedList[0].current = true;
    }

    res.json({
      success: true,
      data: sortedList
    });
  } catch (error) {
    console.error('❌ [API /schedule/semesters] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách học kỳ!',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/schedule
 * @desc    Lấy thời khóa biểu (lịch học/lịch giảng dạy) từ cache PostgreSQL, hỗ trợ forceSync=true
 * @access  Private (JWT)
 */
router.get('/schedule', authMiddleware, async (req, res) => {
  try {
    const { formattedSemester, formattedSchoolYear } = normalizeTerm(req.query.semester, req.query.schoolYear);

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
    const { formattedSemester, formattedSchoolYear } = normalizeTerm(req.query.semester, req.query.schoolYear);

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
 * @desc    Lấy bảng điểm số, hỗ trợ khảo sát (môn chưa KS → ẩn điểm)
 * @access  Private (JWT)
 */
router.get('/grades', authMiddleware, async (req, res) => {
  try {
    const { semester, formattedSemester, formattedSchoolYear } = normalizeTerm(req.query.semester, req.query.schoolYear);
    const dataSource = process.env.DATA_SOURCE || 'database';

    if (req.query.forceSync === 'true') {
      await handleForceSync(req.user, req);
    }

    // Nếu dùng database mode + có tuafStudentId → query trực tiếp với survey
    if (dataSource === 'database' && req.user.tuafStudentId) {
      try {
        const namvietConnector = require('../services/namvietConnector');
        const tuafQueries = require('../services/tuafQueries');
        const pool = await namvietConnector.getPool();
        
        const result = await tuafQueries.getStudentGradesWithSurvey(
          pool, req.user.tuafStudentId,
          parseInt(semester), formattedSchoolYear
        );

        return res.json({
          success: true,
          data: result.grades,
          surveyActive: result.surveyActive,
          surveyInfo: result.surveyInfo,
          surveyStats: result.stats,
          lastSyncedAt: req.user.lastSyncedAt,
          source: 'database'
        });
      } catch (dbErr) {
        console.warn(`⚠️ [API /grades] Database lỗi, fallback cache: ${dbErr.message}`);
      }
    }

    // Fallback: đọc từ PostgreSQL cache (không có survey filter)
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
      surveyActive: false,
      surveyStats: { total: grades.length, visible: grades.length, hidden: 0 },
      lastSyncedAt: req.user.lastSyncedAt,
      source: 'cache'
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
    const semester = req.query.semester || '1';
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

    // Chuẩn hóa tính toán công nợ và miễn giảm theo thực tế
    const processedFinances = finances.map(f => {
      const totalTuition = f.totalTuition || 0;
      let mustPayTuition = f.mustPayTuition !== undefined && f.mustPayTuition !== null ? f.mustPayTuition : totalTuition;
      let discountTuition = f.discountTuition || 0;
      const paidTuition = f.paidTuition || 0;
      const refundTuition = f.refundTuition || 0;
      const debtTuition = f.debtTuition || 0;

      // Xử lý sinh viên được miễn giảm 100% (Phải nộp = 0, Học phí gốc > 0)
      if (discountTuition === 0 && mustPayTuition === 0 && totalTuition > 0) {
        discountTuition = totalTuition;
      } else if (!discountTuition && totalTuition > mustPayTuition) {
        discountTuition = totalTuition - mustPayTuition;
      }

      const discountPercent = totalTuition > 0 ? Math.min(100, Math.round((discountTuition / totalTuition) * 100)) : 0;

      return {
        ...f.toJSON(),
        totalTuition,
        discountTuition,
        discountPercent,
        mustPayTuition,
        paidTuition,
        refundTuition,
        debtTuition
      };
    });

    // Tính tổng qua các kỳ đã ghi nhận
    const totalTuition = processedFinances.reduce((sum, f) => sum + f.totalTuition, 0);
    const totalDiscount = processedFinances.reduce((sum, f) => sum + f.discountTuition, 0);
    const totalMustPay = processedFinances.reduce((sum, f) => sum + f.mustPayTuition, 0);
    const totalPaid = processedFinances.reduce((sum, f) => sum + f.paidTuition, 0);
    const totalRefund = processedFinances.reduce((sum, f) => sum + f.refundTuition, 0);
    const totalDebt = processedFinances.reduce((sum, f) => sum + f.debtTuition, 0);

    res.json({
      success: true,
      data: processedFinances,
      summary: {
        totalTuition,
        totalDiscount,
        totalMustPay,
        totalPaid,
        totalRefund,
        totalDebt,
        totalSemesters: processedFinances.length
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

    let result;
    try {
      result = await strategy.syncHistory(req.user, decryptedPassword);
    } catch (stratErr) {
      console.warn('⚠️ [Strategy] Lỗi syncHistory, tự động fallback sang CrawlerStrategy:', stratErr.message);
      const crawlerStrategy = strategyManager.getCrawlerStrategy();
      result = await crawlerStrategy.syncHistory(req.user, decryptedPassword);
    }

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

/**
 * @route   GET /api/diem-ren-luyen
 * @desc    Lấy điểm rèn luyện kỳ hiện tại
 * @access  Private (JWT)
 */
router.get('/diem-ren-luyen', authMiddleware, async (req, res) => {
  try {
    const { formattedSemester, formattedSchoolYear } = normalizeTerm(req.query.semester, req.query.schoolYear);

    const DiemRenLuyen = require('../models/DiemRenLuyen');
    const drl = await DiemRenLuyen.findOne({
      where: {
        userId: req.user.id,
        semester: formattedSemester,
        schoolYear: formattedSchoolYear
      }
    });

    res.json({
      success: true,
      data: drl || { score: null, classification: '' },
      lastSyncedAt: req.user.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ [API /diem-ren-luyen] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải điểm rèn luyện!' });
  }
});

/**
 * @route   GET /api/diem-ren-luyen/all
 * @desc    Lấy điểm rèn luyện tất cả kỳ
 * @access  Private (JWT)
 */
router.get('/diem-ren-luyen/all', authMiddleware, async (req, res) => {
  try {
    const DiemRenLuyen = require('../models/DiemRenLuyen');
    const drlList = await DiemRenLuyen.findAll({
      where: { userId: req.user.id },
      order: [['schoolYear', 'ASC'], ['semester', 'ASC']]
    });

    res.json({
      success: true,
      data: drlList,
      lastSyncedAt: req.user.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ [API /diem-ren-luyen/all] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải lịch sử điểm rèn luyện!' });
  }
});

module.exports = router;
