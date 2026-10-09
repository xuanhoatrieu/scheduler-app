const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const Grade = require('../models/Grade');
const Finance = require('../models/Finance');
const { decrypt } = require('../utils/security');
const strategyManager = require('../strategies/StrategyManager');
const { loadOwnFinance } = require('../services/financeReader');
const { summarizeFinance } = require('../services/financeCalculator');

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
 * Hàm trợ giúp để kích hoạt ép buộc đồng bộ (Force Sync) dữ liệu thời gian thực từ SQL Server TUAF
 */
const handleForceSync = async (user, req) => {
  const { semester, startYear } = normalizeTerm(req.query.semester, req.query.schoolYear);
  const trainingSystem = user.role === 'student'
    ? 'ALL'
    : String(req.query.heDaoTao || req.query.trainingSystem || 'DHCQ').toUpperCase();
  console.log(`🔄 [API Sync Database] Đang đồng bộ trực tiếp từ SQL Server TUAF cho ${user.username} (role: ${user.role}, hệ: ${trainingSystem})...`);
  const decryptedPassword = decrypt(user.encryptedPassword);
  const databaseStrategy = strategyManager.getDatabaseStrategy();
  return await databaseStrategy.getSchedule(user, decryptedPassword, { semester, schoolYear: String(startYear), trainingSystem });
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
    const [userSchedules, userExams, userGrades, userFinances] = await Promise.all([
      Schedule.findAll({
        attributes: ['semester', 'schoolYear'],
        where: { userId: req.user.id },
        group: ['semester', 'schoolYear']
      }),
      Exam.findAll({
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
    userExams.forEach(e => addEntry(e.semester, e.schoolYear));
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

    // 3. Đảm bảo kỳ hiện tại luôn có mặt và được đánh dấu current: true
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const isSem1 = currentMonth >= 8;
    const baseYear = isSem1 ? currentYear : currentYear - 1;
    const activeSem = isSem1 ? '1' : '2';

    addEntry(activeSem, String(baseYear), true);

    // Thêm các kỳ đã và đang diễn ra từ kỳ hiện tại trở về trước
    for (let y = baseYear; y >= baseYear - 4; y--) {
      if (y < baseYear || !isSem1) {
        addEntry('2', String(y));
      }
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
    const trainingSystem = String(req.query.heDaoTao || req.query.trainingSystem || 'DHCQ').toUpperCase();

    // 1. Kích hoạt đồng bộ realtime nếu forceSync = true
    if (req.query.forceSync === 'true') {
      await handleForceSync(req.user, req);
    }

    // 2. Lấy dữ liệu đã cache từ PostgreSQL theo hệ đào tạo (Sinh viên xem toàn bộ, Giảng viên lọc theo hệ)
    const { Op } = require('sequelize');
    const whereClause = {
      userId: req.user.id,
      semester: formattedSemester,
      schoolYear: formattedSchoolYear
    };
    if (req.user.role !== 'student' && trainingSystem && trainingSystem !== 'ALL') {
      whereClause[Op.or] = [
        { trainingSystem },
        { trainingSystem: null } // Tương thích dữ liệu TKB cũ trước khi có cột này
      ];
    }

    let schedules = await Schedule.findAll({
      where: whereClause,
      order: [['dayOfWeek', 'ASC'], ['studyTime', 'ASC']]
    });

    // 3. Nếu cache trống và không phải forceSync, tự động nạp từ SQL Server lần đầu
    if (schedules.length === 0 && req.query.forceSync !== 'true') {
      try {
        await handleForceSync(req.user, req);
        schedules = await Schedule.findAll({
          where: whereClause,
          order: [['dayOfWeek', 'ASC'], ['studyTime', 'ASC']]
        });
      } catch (e) {
        console.warn('⚠️ Tự động nạp TKB SQL Server:', e.message);
      }
    }

    const sortSchedules = (list) => {
      return [...list].sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        const pA = parseInt((a.periodText || '1').split('-')[0]) || 1;
        const pB = parseInt((b.periodText || '1').split('-')[0]) || 1;
        return pA - pB;
      });
    };

    res.json({
      success: true,
      data: sortSchedules(schedules),
      trainingSystem: req.user.role === 'student' ? 'ALL' : trainingSystem,
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
    const trainingSystem = req.user.role === 'student'
      ? 'ALL'
      : String(req.query.heDaoTao || req.query.trainingSystem || 'DHCQ').toUpperCase();

    if (req.query.forceSync === 'true') {
      await handleForceSync(req.user, req);
    }

    const whereClause = {
      userId: req.user.id,
      semester: formattedSemester,
      schoolYear: formattedSchoolYear
    };
    if (req.user.role !== 'student' && trainingSystem !== 'ALL') {
      whereClause.trainingSystem = trainingSystem;
    }

    let exams = await Exam.findAll({
      where: whereClause
    });

    if (exams.length === 0 && req.query.forceSync !== 'true') {
      try {
        await handleForceSync(req.user, req);
        exams = await Exam.findAll({
          where: whereClause
        });
      } catch (e) {
        console.warn('⚠️ Tự động nạp Lịch thi SQL Server:', e.message);
      }
    }

    const sortExams = (list) => {
      return [...list].sort((a, b) => {
        const parseD = (str) => {
          if (!str) return 0;
          const parts = str.split(/[\/\-]/);
          if (parts.length === 3) {
            if (parts[2].length === 4) {
              return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
            }
            if (parts[0].length === 4) {
              return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime();
            }
          }
          return 0;
        };
        const diff = parseD(a.examDate) - parseD(b.examDate);
        if (diff !== 0) return diff;
        return (a.startTime || a.examTime || '').localeCompare(b.startTime || b.examTime || '');
      });
    };

    res.json({
      success: true,
      data: sortExams(exams),
      trainingSystem: req.user.role === 'student' ? 'ALL' : trainingSystem,
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
 * @desc    Lấy học phí/công nợ 1 kỳ (đọc trực tiếp SQL Server, dự phòng bằng cache PostgreSQL), hỗ trợ forceSync=true
 * @access  Private (JWT)
 */
router.get('/finance', authMiddleware, async (req, res) => {
  try {
    const semester = req.query.semester || '1';
    const formattedSemester = `HocKy${semester}`;

    if (req.query.forceSync === 'true') {
      await handleForceSync(req.user, req);
    }

    // Cùng bộ tính với /finance/all và màn GVCN (cấn trừ liên kỳ + dung sai làm tròn)
    const { rows } = await loadOwnFinance(req.user);
    const { data, summary } = summarizeFinance(rows);
    const overallDebt = summary.totalDebt;
    const overallSurplus = summary.totalSurplus;

    const term = data
      .filter(f => f.semester === formattedSemester && (!req.query.schoolYear || f.schoolYear === req.query.schoolYear))
      .sort((a, b) => String(b.schoolYear || '').localeCompare(String(a.schoolYear || '')))[0];

    let responseData;
    if (term) {
      responseData = { ...term };
      delete responseData.note;
    } else {
      responseData = {
        totalTuition: 0,
        paidTuition: 0,
        debtTuition: 0,
        invoiceDetails: [],
        rawDebtTuition: 0,
        surplusTuition: 0,
        badge: '✓ Đã nộp đủ'
      };
    }

    responseData.overallDebt = overallDebt;
    responseData.overallSurplus = overallSurplus;
    responseData.status = overallDebt > 0 ? 'debt' : (overallSurplus > 0 ? 'surplus' : 'completed');
    responseData.statusText = overallDebt > 0 
      ? `Còn nợ ${overallDebt.toLocaleString('vi-VN')}đ` 
      : (overallSurplus > 0 ? `Đang nộp thừa ${overallSurplus.toLocaleString('vi-VN')}đ` : 'Đã nộp đủ');

    res.json({
      success: true,
      data: responseData,
      lastSyncedAt: req.user.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ [API /finance] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể tải thông tin học phí công nợ!'
    });
  }
});
/**
 * Helper: Đảm bảo sinh viên đã được đồng bộ bảng điểm chuẩn từ SQL Server TUAF
 * Tự động tìm ID_sv nếu chưa có, xóa sạch các môn ma/kỳ ma của crawler cũ
 */
async function ensureStudentGrades(user, pool, forceSync = false) {
  if (!pool || user.role !== 'student') return;
  try {
    const tuafQueries = require('../services/tuafQueries');
    let studentId = user.tuafStudentId;
    if (!studentId) {
      const sv = await tuafQueries.findStudentId(pool, user.username);
      if (sv && sv.ID_sv) {
        studentId = sv.ID_sv;
        await user.update({ tuafStudentId: studentId });
        user.tuafStudentId = studentId;
      }
    }
    if (!studentId) return;

    const grades = await Grade.findAll({ where: { userId: user.id } });
    // Cần đồng bộ nếu: forceSync = true, chưa có điểm, có điểm credits == 0 / null, số môn > 50, hoặc chưa có điểm CC / GK
    const needsSync = forceSync || grades.length === 0 || grades.length > 50 
      || grades.some(g => g.credits == null || g.credits === 0)
      || (grades.length > 0 && grades.some(g => g.processGrade == null && g.midtermGrade == null && g.finalGrade != null));

    if (needsSync) {
      console.log(`🔄 [ensureStudentGrades] Đang đồng bộ lại điểm chuẩn từ SQL Server cho SV ${user.username}...`);
      const rawAllGrades = await tuafQueries.getAllStudentGrades(pool, studentId);
      if (rawAllGrades && rawAllGrades.length > 0) {
        const DatabaseStrategy = require('../strategies/DatabaseStrategy');
        const strategy = new DatabaseStrategy();

        // Xóa TOÀN BỘ điểm cũ của user để triệt tiêu sạch các môn ma và học kỳ ma do crawler cũ tạo ra
        await Grade.destroy({ where: { userId: user.id } });

        const gradesByKey = {};
        for (const r of rawAllGrades) {
          const semKey = `HocKy${r.Hoc_ky}`;
          const yrKey = r.Nam_hoc;
          const key = `${semKey}|${yrKey}`;
          if (!gradesByKey[key]) gradesByKey[key] = [];
          gradesByKey[key].push(r);
        }

        for (const [key, rawList] of Object.entries(gradesByKey)) {
          const [sem, yr] = key.split('|');
          const transformed = strategy._transformGrades(rawList);
          await Grade.bulkCreate(transformed.map(g => ({
            ...g, semester: sem, schoolYear: yr, userId: user.id
          })));
        }
        console.log(`✅ [ensureStudentGrades] Đã đồng bộ thành công ${rawAllGrades.length} môn chuẩn cho ${user.username}!`);
      }
    }
  } catch (err) {
    console.warn('⚠️ [ensureStudentGrades] Lỗi đồng bộ điểm:', err.message);
  }
}

/**
 * Đánh giá Chuẩn đầu ra Ngoại ngữ & Tin học từ danh sách môn học
 * @param {Array} grades 
 */
function evaluateGraduationStandards(grades) {
  const englishCodes = ['NN703011', 'NN703012', 'NN702013', 'NN703013', 'ENG131', 'ENG132', 'ENG133'];
  const itCodes = ['GIN131', 'GIN121', 'NN703008'];

  const langCourses = grades.filter(c => {
    const code = (c.courseCode || '').toUpperCase().trim();
    const name = (c.courseName || '').toLowerCase();
    return englishCodes.includes(code) || 
           code.startsWith('ENG') || 
           code.startsWith('CDRTA') || 
           name.includes('tiếng anh') || 
           name.includes('ngoại ngữ') || 
           name.includes('english');
  });

  const itCourses = grades.filter(c => {
    const code = (c.courseCode || '').toUpperCase().trim();
    const name = (c.courseName || '').toLowerCase();
    return itCodes.includes(code) || 
           code.startsWith('GIN') || 
           code.startsWith('INF') || 
           code.startsWith('CDRTH') || 
           code.startsWith('CDRIC3') || 
           name.includes('tin học') || 
           name.includes('công nghệ số') || 
           name.includes('trí tuệ nhân tạo') || 
           name.includes('ic3');
  });

  const passedLangCourses = langCourses.filter(c => c.letterGrade && c.letterGrade !== 'F' && c.totalGrade4 != null && c.totalGrade4 >= 2.0);
  
  let highestLang = null;
  if (passedLangCourses.length > 0) {
    passedLangCourses.sort((a, b) => {
      const codeA = (a.courseCode || '').toUpperCase();
      const codeB = (b.courseCode || '').toUpperCase();
      const nameA = (a.courseName || '').toLowerCase();
      const nameB = (b.courseName || '').toLowerCase();

      const getRank = (code, name) => {
        if (code === 'NN702013' || code === 'NN703013' || code === 'ENG133' || code.startsWith('CDRTA') || name.includes('tiếng anh 3') || name.includes('b1')) return 3;
        if (code === 'NN703012' || code === 'ENG132' || name.includes('tiếng anh 2')) return 2;
        if (code === 'NN703011' || code === 'ENG131' || name.includes('tiếng anh 1')) return 1;
        return 0;
      };

      const rankA = getRank(codeA, nameA);
      const rankB = getRank(codeB, nameB);
      if (rankA !== rankB) return rankB - rankA;
      return (b.totalGrade4 || 0) - (a.totalGrade4 || 0);
    });
    highestLang = passedLangCourses[0];
  }

  const isLangPassed = highestLang != null;

  const passedITCourses = itCourses.filter(c => c.letterGrade && c.letterGrade !== 'F' && c.totalGrade4 != null && c.totalGrade4 >= 2.0);
  const isITPassed = passedITCourses.length > 0;
  
  let topIT = null;
  if (passedITCourses.length > 0) {
    passedITCourses.sort((a, b) => (b.totalGrade4 || 0) - (a.totalGrade4 || 0));
    topIT = passedITCourses[0];
  }

  return {
    foreignLanguage: {
      isPassed: isLangPassed,
      courseCode: highestLang ? highestLang.courseCode : null,
      courseName: highestLang ? highestLang.courseName : null,
      letterGrade: highestLang ? highestLang.letterGrade : null,
      score4: highestLang ? highestLang.totalGrade4 : null,
      statusText: isLangPassed 
        ? `Đạt (${highestLang.courseName} - Điểm ${highestLang.letterGrade})`
        : (langCourses.length > 0 ? 'Chưa đạt (Cần học phần Tiếng Anh từ C trở lên)' : 'Chưa đăng ký/Chưa có điểm')
    },
    informationTechnology: {
      isPassed: isITPassed,
      courseCode: topIT ? topIT.courseCode : null,
      courseName: topIT ? topIT.courseName : null,
      letterGrade: topIT ? topIT.letterGrade : null,
      score4: topIT ? topIT.totalGrade4 : null,
      statusText: isITPassed 
        ? `Đạt (${topIT.courseName} - Điểm ${topIT.letterGrade})`
        : (itCourses.length > 0 ? 'Chưa đạt (Cần học phần Tin học/CNS&AI từ C trở lên)' : 'Chưa đăng ký/Chưa có điểm')
    }
  };
}

/**
 * @route   GET /api/grades/all
 * @desc    Lấy bảng điểm TẤT CẢ các kỳ, nhóm theo semester + schoolYear kèm thống kê tín chỉ & tiến độ tốt nghiệp
 * @access  Private (JWT)
 */
router.get('/grades/all', authMiddleware, async (req, res) => {
  try {
    let pool = null;
    try {
      const namvietConnector = require('../services/namvietConnector');
      pool = await namvietConnector.getPool();
    } catch (e) {
      console.warn('⚠️ [API /grades/all] Không thể kết nối SQL Server TUAF:', e.message);
    }

    // 1. Đảm bảo dữ liệu bảng điểm trong PG cache đã được làm sạch và có số tín chỉ chuẩn
    await ensureStudentGrades(req.user, pool, req.query.force === 'true');

    let grades = await Grade.findAll({
      where: { userId: req.user.id },
      order: [['schoolYear', 'ASC'], ['semester', 'ASC'], ['courseName', 'ASC']]
    });

    // 2. Lấy tổng số tín chỉ yêu cầu của CTĐT
    let totalRequiredCredits = 0;
    try {
      const MasterCurriculum = require('../models/MasterCurriculum');
      const tuafQueries = require('../services/tuafQueries');
      let ctdtSummary = null;
      if (pool && req.user.tuafStudentId) {
        try {
          ctdtSummary = await tuafQueries.getStudentCurriculumSummary(pool, req.user.tuafStudentId);
        } catch (ctErr) {}
      }

      // Ưu tiên 1: Tra cứu theo Khung chuẩn MasterCurriculum đã duyệt
      let masterList = [];
      if (ctdtSummary?.ID_dt) {
        masterList = await MasterCurriculum.findAll({
          where: { idDt: ctdtSummary.ID_dt, isActive: true }
        });
      }
      if (masterList.length === 0 && ctdtSummary?.majorCode) {
        const cohortCode = ctdtSummary.cohort ? (String(ctdtSummary.cohort).startsWith('K') ? String(ctdtSummary.cohort) : `K${ctdtSummary.cohort}`) : 'K56';
        masterList = await MasterCurriculum.findAll({
          where: { majorCode: ctdtSummary.majorCode, cohort: cohortCode, isActive: true }
        });
      }

      if (masterList.length > 0) {
        const seenGradCodes = new Set();
        totalRequiredCredits = masterList
          .filter(c => c.isOrganized !== false && !c.isCondition)
          .reduce((sum, c) => {
            const code = (c.courseCode || '').toUpperCase().trim();
            if (code && seenGradCodes.has(code)) return sum;
            if (code) seenGradCodes.add(code);
            return sum + (c.credits || 0);
          }, 0);
      }

      // Ưu tiên 2: Lấy theo ctdtSummary từ trường nếu chưa cấu hình MasterCurriculum
      if ((!totalRequiredCredits || totalRequiredCredits === 0) && ctdtSummary && ctdtSummary.totalCredits) {
        totalRequiredCredits = Number(ctdtSummary.totalCredits);
      }

      // Ưu tiên 3: Lấy theo Curriculum lưu trong cache
      if (!totalRequiredCredits || totalRequiredCredits === 0) {
        const Curriculum = require('../models/Curriculum');
        const cCredits = await Curriculum.sum('credits', { where: { userId: req.user.id } });
        if (cCredits && cCredits > 0) {
          totalRequiredCredits = cCredits;
        }
      }
    } catch (e) {}

    // Mặc định chuẩn đại học nếu không có thông tin
    if (!totalRequiredCredits || totalRequiredCredits === 0) {
      totalRequiredCredits = 153;
    }

    // 3. Gom nhóm theo semester + schoolYear theo thứ tự thời gian
    const groupsMap = new Map();
    for (const g of grades) {
      const key = `${g.schoolYear}|${g.semester}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          semester: g.semester,
          schoolYear: g.schoolYear,
          courses: []
        });
      }
      groupsMap.get(key).courses.push(g);
    }

    // Chuyển sang array và sắp xếp thứ tự học kỳ (VD: 2024-2025 HocKy1 -> 2024-2025 HocKy2)
    const semesterGroups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.schoolYear !== b.schoolYear) return a.schoolYear.localeCompare(b.schoolYear);
      return a.semester.localeCompare(b.semester);
    });

    // 4. Tính toán chi tiết cho từng kỳ và tích lũy
    let cumulativeCreditsStudied = 0;
    let cumulativeCreditsAccumulated = 0;
    let cumulativeWeightedScore4 = 0;
    let cumulativeWeightedScore10 = 0;
    let cumulativeCreditsForGpa = 0;

    const enrichedGroups = semesterGroups.map(group => {
      let semCreditsStudied = 0;
      let semCreditsAccumulated = 0;
      let semWeightedScore4 = 0;
      let semWeightedScore10 = 0;
      let semCreditsForGpa = 0;
      let failedCoursesCount = 0;

      for (const c of group.courses) {
        const cr = Number(c.credits) || 0;
        const g4 = c.totalGrade4 != null ? Number(c.totalGrade4) : null;
        const g10 = c.totalGrade10 != null ? Number(c.totalGrade10) : null;
        const isPassed = c.letterGrade && c.letterGrade !== 'F' && (g4 === null || g4 > 0);

        const codeUpper = (c.courseCode || '').toUpperCase();
        const isNonGpaCourse = Boolean(
          c.isNonGpaCourse || 
          c.ThuocTinhMon === 1 || 
          c.Mon_chung_chi === true || 
          c.ID_bm === 3 || 
          codeUpper.startsWith('PHE') || 
          codeUpper.startsWith('GDQP')
        );

        semCreditsStudied += cr;
        if (isPassed) {
          if (!isNonGpaCourse) {
            semCreditsAccumulated += cr;
          }
        } else if (c.letterGrade === 'F') {
          failedCoursesCount++;
        }

        if (g4 !== null && cr > 0 && !isNonGpaCourse) {
          semWeightedScore4 += g4 * cr;
          semWeightedScore10 += (g10 !== null ? g10 : 0) * cr;
          semCreditsForGpa += cr;
        }
      }

      // Cập nhật lũy kế toàn khóa đến kỳ này
      cumulativeCreditsStudied += semCreditsStudied;
      cumulativeCreditsAccumulated += semCreditsAccumulated;
      cumulativeWeightedScore4 += semWeightedScore4;
      cumulativeWeightedScore10 += semWeightedScore10;
      cumulativeCreditsForGpa += semCreditsForGpa;

      const semGpa = semCreditsForGpa > 0 ? parseFloat((semWeightedScore4 / semCreditsForGpa).toFixed(2)) : null;
      const semGpa10 = semCreditsForGpa > 0 ? parseFloat((semWeightedScore10 / semCreditsForGpa).toFixed(2)) : null;
      const cumGpa = cumulativeCreditsForGpa > 0 ? parseFloat((cumulativeWeightedScore4 / cumulativeCreditsForGpa).toFixed(2)) : null;
      const cumGpa10 = cumulativeCreditsForGpa > 0 ? parseFloat((cumulativeWeightedScore10 / cumulativeCreditsForGpa).toFixed(2)) : null;

      return {
        semester: group.semester,
        schoolYear: group.schoolYear,
        totalCourses: group.courses.length,
        failedCoursesCount,
        creditsStudied: semCreditsStudied,
        creditsAccumulated: semCreditsAccumulated,
        failedCredits: semCreditsStudied - semCreditsAccumulated,
        semesterGPA: semGpa,
        semesterGPA10: semGpa10,
        cumulativeGPA: cumGpa,
        cumulativeGPA10: cumGpa10,
        cumulativeCreditsStudied,
        cumulativeCreditsAccumulated,
        courses: group.courses
      };
    });

    // 5. Thống kê toàn khóa
    const totalCourses = grades.length;
    const totalSemesters = enrichedGroups.length;
    const finalCumulativeGPA = cumulativeCreditsForGpa > 0
      ? parseFloat((cumulativeWeightedScore4 / cumulativeCreditsForGpa).toFixed(2))
      : null;
    const finalCumulativeGPA10 = cumulativeCreditsForGpa > 0
      ? parseFloat((cumulativeWeightedScore10 / cumulativeCreditsForGpa).toFixed(2))
      : null;

    const graduationProgress = totalRequiredCredits > 0
      ? parseFloat(Math.min(100, (cumulativeCreditsAccumulated / totalRequiredCredits) * 100).toFixed(1))
      : 0;

    const graduationStandards = evaluateGraduationStandards(grades);

    // Tính tổng tín chỉ các môn hiện tại đang bị điểm F (chưa học lại hoặc học lại vẫn F)
    let totalFailedCredits = 0;
    let totalFailedCourses = 0;
    for (const c of grades) {
      if (c.letterGrade === 'F') {
        const codeUpper = (c.courseCode || '').toUpperCase();
        const isNonGpa = Boolean(
          c.isNonGpaCourse || 
          c.ThuocTinhMon === 1 || 
          c.Mon_chung_chi === true || 
          c.ID_bm === 3 || 
          codeUpper.startsWith('PHE') || 
          codeUpper.startsWith('GDQP')
        );
        if (!isNonGpa) {
          totalFailedCredits += (Number(c.credits) || 0);
          totalFailedCourses++;
        }
      }
    }

    res.json({
      success: true,
      data: enrichedGroups,
      summary: {
        totalCourses,
        totalSemesters,
        creditsStudied: cumulativeCreditsStudied,
        creditsAccumulated: cumulativeCreditsAccumulated,
        failedCredits: totalFailedCredits,
        failedCoursesCount: totalFailedCourses,
        cumulativeGPA: finalCumulativeGPA,
        cumulativeGPA10: finalCumulativeGPA10,
        totalRequiredCredits,
        graduationProgress,
        graduationStandards
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
 * @desc    Lấy lịch sử tài chính TẤT CẢ các kỳ (đọc trực tiếp SQL Server, dự phòng bằng cache PostgreSQL).
 *          Cùng bộ tính với màn chi tiết học phí của GVCN nên số liệu luôn khớp.
 * @access  Private (JWT)
 */
router.get('/finance/all', authMiddleware, async (req, res) => {
  try {
    const { rows, source, updatedAt } = await loadOwnFinance(req.user);
    const { data, summary } = summarizeFinance(rows);

    res.json({
      success: true,
      data,
      summary,
      lastSyncedAt: req.user.lastSyncedAt,
      dataSource: source,
      updatedAt
    });
  } catch (error) {
    console.error('❌ [API /finance/all] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải lịch sử tài chính!' });
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
    const strategy = strategyManager.getDatabaseStrategy();

    const result = await strategy.syncHistory(req.user, decryptedPassword);

    res.json({
      success: true,
      message: `Đồng bộ lịch sử SQL Server hoàn tất!`,
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
    let pool = null;
    try {
      const namvietConnector = require('../services/namvietConnector');
      pool = await namvietConnector.getPool();
    } catch (e) {
      console.warn('⚠️ [API /curriculum] Không thể kết nối SQL Server TUAF:', e.message);
    }

    // Đảm bảo dữ liệu bảng điểm trong PG cache đã được làm sạch và có số tín chỉ chuẩn
    await ensureStudentGrades(req.user, pool, req.query.force === 'true');

    const Curriculum = require('../models/Curriculum');
    const MasterCurriculum = require('../models/MasterCurriculum');

    // Đồng bộ lại Curriculum từ SQL Server nếu force=true hoặc chưa có dữ liệu trong cache
    const currCount = await Curriculum.count({ where: { userId: req.user.id } });
    if ((req.query.force === 'true' || currCount === 0) && pool && req.user.tuafStudentId) {
      try {
        const tuafQueries = require('../services/tuafQueries');
        const dbCurriculum = await tuafQueries.getStudentCurriculum(pool, req.user.tuafStudentId);
        if (dbCurriculum && dbCurriculum.length > 0) {
          await Curriculum.destroy({ where: { userId: req.user.id } });
          await Curriculum.bulkCreate(dbCurriculum.map(r => ({
            courseName: r.courseName,
            courseCode: r.courseCode || '',
            credits: r.credits || 0,
            courseType: r.isElective ? 'Tự chọn' : 'Bắt buộc',
            semester: r.semester || 1,
            knowledgeBlock: r.knowledgeBlock || 'Kiến thức giáo dục chuyên nghiệp',
            status: 'Chưa học',
            userId: req.user.id
          })));
        }
      } catch (cErr) {
        console.warn('⚠️ [API /curriculum] Lỗi đồng bộ CTĐT SQL Server:', cErr.message);
      }
    }

    // 1. Lấy thông tin ngành & khóa đào tạo của sinh viên từ SQL Server để tra đúng khung chuẩn
    let studentSummary = null;
    if (pool && req.user.tuafStudentId) {
      try {
        const tuafQueries = require('../services/tuafQueries');
        studentSummary = await tuafQueries.getStudentCurriculumSummary(pool, req.user.tuafStudentId);
      } catch (sErr) {
        console.warn('⚠️ [API /curriculum] Lỗi lấy thông tin ngành của sinh viên:', sErr.message);
      }
    }

    // 1.1 Tìm MasterCurriculum phù hợp cho sinh viên:
    // Ưu tiên 1: Theo idDt (Chương trình đào tạo gán theo lớp sinh viên)
    // Ưu tiên 2: Theo majorCode và cohort (ví dụ 7480201 - K56)
    // Ưu tiên 3: Mặc định ngành 7480201 - K56
    let masterList = [];
    if (studentSummary?.ID_dt) {
      masterList = await MasterCurriculum.findAll({
        where: { idDt: studentSummary.ID_dt, isActive: true },
        order: [['semester', 'ASC'], ['stt', 'ASC'], ['courseName', 'ASC']]
      });
    }

    if (masterList.length === 0 && studentSummary?.majorCode) {
      const cohortCode = studentSummary.cohort ? (String(studentSummary.cohort).startsWith('K') ? String(studentSummary.cohort) : `K${studentSummary.cohort}`) : 'K56';
      masterList = await MasterCurriculum.findAll({
        where: { majorCode: studentSummary.majorCode, cohort: cohortCode, isActive: true },
        order: [['semester', 'ASC'], ['stt', 'ASC'], ['courseName', 'ASC']]
      });
    }

    if (masterList.length === 0) {
      masterList = await MasterCurriculum.findAll({
        where: { majorCode: '7480201', cohort: 'K56', isActive: true },
        order: [['semester', 'ASC'], ['stt', 'ASC'], ['courseName', 'ASC']]
      });
    }

    // Fallback: nếu chưa cấu hình MasterCurriculum, dùng rawCurriculum
    const rawCurriculum = await Curriculum.findAll({
      where: { userId: req.user.id },
      order: [['semester', 'ASC'], ['knowledgeBlock', 'ASC'], ['courseName', 'ASC']]
    });

    // 2. Lấy tất cả điểm đã có
    const grades = await Grade.findAll({
      where: { userId: req.user.id }
    });

    // 3. Lấy lịch học kỳ hiện tại (môn đang học)
    const schedules = await Schedule.findAll({
      where: { userId: req.user.id }
    });

    // 4. Tạo lookup maps cho grades và schedules (ưu tiên theo courseCode, fallback theo courseName)
    const gradeMapByCode = {};
    const gradeMapByName = {};
    for (const g of grades) {
      const codeKey = (g.courseCode || '').toUpperCase().trim();
      const nameKey = (g.courseName || '').toLowerCase().trim();
      if (codeKey) {
        if (!gradeMapByCode[codeKey] || (g.totalGrade4 !== null && (gradeMapByCode[codeKey].totalGrade4 === null || g.totalGrade4 > gradeMapByCode[codeKey].totalGrade4))) {
          gradeMapByCode[codeKey] = g;
        }
      }
      if (nameKey) {
        if (!gradeMapByName[nameKey] || (g.totalGrade4 !== null && (gradeMapByName[nameKey].totalGrade4 === null || g.totalGrade4 > gradeMapByName[nameKey].totalGrade4))) {
          gradeMapByName[nameKey] = g;
        }
      }
    }

    const studyingCodeSet = new Set();
    const studyingNameSet = new Set();
    for (const s of schedules) {
      if (s.courseCode) studyingCodeSet.add(s.courseCode.toUpperCase().trim());
      if (s.courseName) studyingNameSet.add(s.courseName.toLowerCase().trim());
    }

    // 5. Tính toán Chuẩn đầu ra (Graduation Requirements)
    // 5.1 Giáo dục thể chất (3 TC): CB701% hoặc các môn thể chất
    const peCourses = [];
    let peEarnedCredits = 0;
    const peKeywords = ['bóng chuyền', 'cầu lông', 'bóng đá', 'pickleball', 'bóng rổ', 'bóng ném', 'thể chất', 'võ', 'golf'];
    for (const g of grades) {
      const code = (g.courseCode || '').toUpperCase().trim();
      const name = (g.courseName || '').toLowerCase().trim();
      const isPE = code.startsWith('CB701') || peKeywords.some(k => name.includes(k));
      if (isPE) {
        const isPassed = g.letterGrade && g.letterGrade !== 'F';
        const credits = 1;
        peCourses.push({
          courseCode: g.courseCode,
          courseName: g.courseName,
          letterGrade: g.letterGrade,
          credits,
          isPassed
        });
        if (isPassed) peEarnedCredits += credits;
      }
    }
    const gdtcMet = peEarnedCredits >= 3;

    // 5.2 Giáo dục quốc phòng (GDQP)
    const gdqpGrade = grades.find(g => (g.courseCode || '').toUpperCase().includes('GDQP') || (g.courseName || '').toLowerCase().includes('quốc phòng'));
    const gdqpMet = Boolean(gdqpGrade && gdqpGrade.letterGrade && gdqpGrade.letterGrade !== 'F');

    // 5.3 Chuẩn đầu ra Tin học & 5.4 Chuẩn đầu ra Ngoại ngữ (Dùng helper đa khóa evaluateGraduationStandards)
    const stds = evaluateGraduationStandards(grades);
    const tinHocMet = stds.informationTechnology.isPassed;
    const ngoaiNguMet = stds.foreignLanguage.isPassed;

    const graduationRequirements = {
      allMet: gdtcMet && gdqpMet && tinHocMet && ngoaiNguMet,
      gdtc: {
        title: 'Giáo dục thể chất',
        requiredCredits: 3,
        earnedCredits: peEarnedCredits,
        isMet: gdtcMet,
        details: gdtcMet ? `Đã hoàn thành ${peEarnedCredits}/3 tín chỉ điều kiện` : `Đạt ${peEarnedCredits}/3 tín chỉ (cần thêm ${3 - peEarnedCredits} TC)`,
        courses: peCourses
      },
      gdqp: {
        title: 'Giáo dục quốc phòng',
        isMet: gdqpMet,
        details: gdqpMet ? `Đã hoàn thành chứng chỉ GDQP (${gdqpGrade?.letterGrade || 'Đạt'})` : 'Chưa hoàn thành chứng chỉ GDQP'
      },
      tinHoc: {
        title: 'Chuẩn đầu ra Tin học',
        courseCode: stds.informationTechnology.courseCode || 'GIN131',
        courseName: stds.informationTechnology.courseName || 'Tin học đại cương / CNS & AI',
        minGradeRequired: 'C',
        currentGrade: stds.informationTechnology.letterGrade,
        isMet: tinHocMet,
        details: stds.informationTechnology.statusText
      },
      ngoaiNgu: {
        title: 'Chuẩn đầu ra Ngoại ngữ (Tiếng Anh 1, 2, 3)',
        minGradeRequired: 'C',
        isMet: ngoaiNguMet,
        details: stds.foreignLanguage.statusText,
        courses: [stds.foreignLanguage]
      }
    };

    // 6. Xây dựng danh sách môn học đã merge
    let baseList = [];
    let isMasterUsed = false;
    if (masterList.length > 0) {
      isMasterUsed = true;
      baseList = masterList;
    } else {
      baseList = rawCurriculum;
    }

    const matchedGrades = new Set();

    const mergedList = baseList.map(c => {
      const codeKey = (c.courseCode || '').toUpperCase().trim();
      const nameKey = (c.courseName || '').toLowerCase().trim();

      const grade = (codeKey && gradeMapByCode[codeKey]) || (nameKey && gradeMapByName[nameKey]);
      const isStudying = (codeKey && studyingCodeSet.has(codeKey)) || (nameKey && studyingNameSet.has(nameKey));

      if (grade) matchedGrades.add(grade.id);

      let status = 'not_started';
      let letterGrade = null;
      let totalGrade10 = null;
      let totalGrade4 = null;

      if (grade) {
        letterGrade = grade.letterGrade;
        totalGrade10 = grade.totalGrade10;
        totalGrade4 = grade.totalGrade4;
        if (grade.letterGrade === 'F') {
          status = 'failed';
        } else if (grade.letterGrade && grade.letterGrade !== '') {
          status = 'passed';
        } else if (isStudying) {
          status = 'studying';
        }
      } else if (isStudying) {
        status = 'studying';
      }

      return {
        courseName: c.courseName,
        courseNameEn: c.courseNameEn || '',
        courseCode: c.courseCode,
        credits: c.credits,
        theoryHours: c.theoryHours || 0,
        practiceHours: c.practiceHours || 0,
        courseType: c.courseType || (c.isCondition ? 'Điều kiện' : (c.isElective ? 'Tự chọn' : 'Bắt buộc')),
        isElective: Boolean(c.isElective),
        isCondition: Boolean(c.isCondition),
        semester: c.semester,
        blockCode: c.blockCode || 'I',
        knowledgeBlock: c.blockName || (c.semester ? `Học kỳ ${c.semester}` : 'Chung'),
        subBlockName: c.subBlockName || '',
        status,
        letterGrade,
        totalGrade10,
        totalGrade4
      };
    });

    // 7. Bổ sung các môn sinh viên đã học nhưng không có trong Khung chuẩn (ví dụ NN702008, môn tự chọn khác)
    const addedUnmatchedCodes = new Set();
    for (const g of grades) {
      if (!matchedGrades.has(g.id)) {
        const code = (g.courseCode || '').toUpperCase().trim();
        if (code && addedUnmatchedCodes.has(code)) continue;
        if (code) addedUnmatchedCodes.add(code);

        const isPE = code.startsWith('CB701') || peKeywords.some(k => (g.courseName || '').toLowerCase().includes(k));
        const status = g.letterGrade === 'F' ? 'failed' : (g.letterGrade ? 'passed' : 'studying');
        const credits = g.credits != null && g.credits > 0 ? Number(g.credits) : 2;

        mergedList.push({
          courseName: g.courseName,
          courseNameEn: '',
          courseCode: g.courseCode || '',
          credits,
          theoryHours: 0,
          practiceHours: 0,
          courseType: isPE ? 'Điều kiện' : 'Tự chọn / Bổ sung',
          isElective: !isPE,
          isCondition: isPE,
          semester: null,
          blockCode: isPE ? 'I.3' : 'II.3',
          knowledgeBlock: isPE ? 'Khối kiến thức giáo dục thể chất*' : 'Học phần tích lũy đã học khác',
          subBlockName: `${g.semester} — ${g.schoolYear}`,
          status,
          letterGrade: g.letterGrade,
          totalGrade10: g.totalGrade10,
          totalGrade4: g.totalGrade4
        });
      }
    }

    // 8. Gom nhóm theo Khối kiến thức (byBlock)
    const blockGroups = {};
    for (const item of mergedList) {
      const blockKey = item.knowledgeBlock || 'Chung';
      if (!blockGroups[blockKey]) {
        blockGroups[blockKey] = {
          blockName: blockKey,
          blockCode: item.blockCode || '',
          isCondition: item.isCondition,
          totalCourses: 0,
          passedCourses: 0,
          totalCredits: 0,
          passedCredits: 0,
          courses: []
        };
      }
      blockGroups[blockKey].totalCourses++;
      blockGroups[blockKey].totalCredits += item.credits;
      if (item.status === 'passed') {
        blockGroups[blockKey].passedCourses++;
        blockGroups[blockKey].passedCredits += item.credits;
      }
      blockGroups[blockKey].courses.push(item);
    }
    const byBlock = Object.values(blockGroups);

    // 9. Gom nhóm theo Học kỳ (bySemester)
    const semesterGroups = {};
    for (let sem = 1; sem <= 8; sem++) {
      semesterGroups[sem] = {
        semester: sem,
        semesterName: `Học kỳ ${sem}`,
        totalCredits: 0,
        passedCredits: 0,
        totalCourses: 0,
        passedCourses: 0,
        courses: []
      };
    }
    const otherGroup = {
      semester: 0,
      semesterName: 'Học phần bổ sung / Môn điều kiện',
      totalCredits: 0,
      passedCredits: 0,
      totalCourses: 0,
      passedCourses: 0,
      courses: []
    };

    const unorganizedGroup = {
      semester: 99,
      semesterName: 'Môn tự chọn chưa/không tổ chức mở lớp (Dự phòng)',
      totalCredits: 0,
      passedCredits: 0,
      totalCourses: 0,
      passedCourses: 0,
      courses: []
    };

    for (const item of mergedList) {
      const sem = item.semester;
      if (item.isOrganized === false) {
        unorganizedGroup.totalCourses++;
        unorganizedGroup.totalCredits += item.credits;
        if (item.status === 'passed') {
          unorganizedGroup.passedCourses++;
          unorganizedGroup.passedCredits += item.credits;
        }
        unorganizedGroup.courses.push(item);
      } else if (sem && semesterGroups[sem]) {
        semesterGroups[sem].totalCourses++;
        semesterGroups[sem].totalCredits += item.credits;
        if (item.status === 'passed') {
          semesterGroups[sem].passedCourses++;
          semesterGroups[sem].passedCredits += item.credits;
        }
        semesterGroups[sem].courses.push(item);
      } else {
        otherGroup.totalCourses++;
        otherGroup.totalCredits += item.credits;
        if (item.status === 'passed') {
          otherGroup.passedCourses++;
          otherGroup.passedCredits += item.credits;
        }
        otherGroup.courses.push(item);
      }
    }
    const bySemester = Object.values(semesterGroups);
    if (otherGroup.courses.length > 0) {
      bySemester.push(otherGroup);
    }
    if (unorganizedGroup.courses.length > 0) {
      bySemester.push(unorganizedGroup);
    }

    // 10. Thống kê tiến độ tốt nghiệp chuẩn
    let totalGraduationCredits = 153;
    if (masterList.length > 0) {
      const seenGradCodes = new Set();
      const calcCredits = masterList
        .filter(c => c.isOrganized !== false && !c.isCondition)
        .reduce((sum, c) => {
          const code = (c.courseCode || '').toUpperCase().trim();
          if (code && seenGradCodes.has(code)) return sum;
          if (code) seenGradCodes.add(code);
          return sum + (c.credits || 0);
        }, 0);
      if (calcCredits > 0) totalGraduationCredits = calcCredits;
    } else if (rawCurriculum.length > 0) {
      const cCredits = rawCurriculum.reduce((sum, c) => sum + (c.credits || 0), 0);
      if (cCredits > 0) totalGraduationCredits = cCredits;
    }

    const passedGraduationCodes = new Set();
    const passedCredits = mergedList
      .filter(c => !c.isCondition && c.status === 'passed')
      .reduce((sum, c) => {
        const code = (c.courseCode || '').toUpperCase().trim();
        if (code && passedGraduationCodes.has(code)) return sum;
        if (code) passedGraduationCodes.add(code);
        return sum + (c.credits || 0);
      }, 0);

    const effectiveTotalCredits = totalGraduationCredits > 0 ? totalGraduationCredits : 153;

    const failedCount = mergedList.filter(c => c.status === 'failed').length;
    const studyingCount = mergedList.filter(c => c.status === 'studying').length;
    const progressPercent = Math.min(100, Math.round((passedCredits / effectiveTotalCredits) * 100));

    res.json({
      success: true,
      data: mergedList,
      byBlock,
      bySemester,
      graduationRequirements,
      summary: {
        totalCourses: mergedList.length,
        totalCredits: effectiveTotalCredits,
        passedCredits,
        failedCount,
        studyingCount,
        progressPercent,
        conditionCredits: peEarnedCredits
      },
      source: isMasterUsed ? 'master_curriculum' : (rawCurriculum.length > 0 ? 'portal' : 'grades_fallback'),
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
