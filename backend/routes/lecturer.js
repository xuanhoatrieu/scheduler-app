const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Schedule = require('../models/Schedule');

/**
 * @route   GET /api/lecturer/classes
 * @desc    Lấy danh sách các lớp mà Giảng viên đang phụ trách (trích xuất từ lịch dạy)
 * @access  Private (JWT, role=lecturer)
 */
router.get('/classes', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'lecturer') {
      return res.status(403).json({ success: false, message: 'Chức năng chỉ dành cho Giảng viên!' });
    }

    const schedules = await Schedule.findAll({
      where: { userId: req.user.id },
      order: [['schoolYear', 'DESC'], ['semester', 'DESC'], ['courseName', 'ASC']]
    });

    // Nhóm theo courseName + classCode để tạo danh sách lớp không trùng lặp
    const classMap = {};
    for (const s of schedules) {
      const key = `${s.courseName}|${s.classCode}|${s.semester}|${s.schoolYear}`;
      if (!classMap[key]) {
        classMap[key] = {
          courseName: s.courseName,
          classCode: s.classCode,
          credits: s.credits || 0,
          semester: s.semester,
          schoolYear: s.schoolYear,
          room: s.room,
          schedules: []
        };
      }
      classMap[key].schedules.push({
        dayOfWeek: s.dayOfWeek,
        studyTime: s.studyTime,
        room: s.room,
        batch: s.batch
      });
    }

    const classes = Object.values(classMap);

    res.json({
      success: true,
      data: classes,
      totalClasses: classes.length,
      lastSyncedAt: req.user.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ [API /lecturer/classes] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải danh sách lớp!', error: error.message });
  }
});

module.exports = router;
