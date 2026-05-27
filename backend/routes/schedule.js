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

module.exports = router;
