const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/auth');
const Schedule = require('../models/Schedule');
const StudentAttendance = require('../models/StudentAttendance');
const HomeroomNotification = require('../models/HomeroomNotification');
const User = require('../models/User');
const tuafQueries = require('../services/tuafQueries');
const { getPool, sql } = require('../services/namvietConnector');

/**
 * Helper lấy idCb của giảng viên
 */
async function resolveLecturerIdCb(pool, user) {
  if (user.tuafLecturerId) return user.tuafLecturerId;
  const cb = await tuafQueries.findLecturerId(pool, user.username);
  if (cb && cb.ID_cb) {
    user.tuafLecturerId = cb.ID_cb;
    await user.save().catch(() => {});
    return cb.ID_cb;
  }
  return null;
}

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

    // Nhóm theo courseName + classCode
    const classMap = {};
    for (const s of schedules) {
      const key = `${s.courseName}|${s.classCode}|${s.semester}|${s.schoolYear}`;
      if (!classMap[key]) {
        classMap[key] = {
          scheduleId: s.id,
          courseName: s.courseName,
          classCode: s.classCode,
          idLopTc: s.idLopTc || null,
          credits: s.credits || 0,
          semester: s.semester,
          schoolYear: s.schoolYear,
          room: s.room,
          schedules: []
        };
      }
      classMap[key].schedules.push({
        scheduleId: s.id,
        idLopTc: s.idLopTc || null,
        dayOfWeek: s.dayOfWeek,
        studyTime: s.studyTime,
        periodText: s.periodText,
        room: s.room,
        batch: s.batch
      });
      if (!classMap[key].idLopTc && s.idLopTc) {
        classMap[key].idLopTc = s.idLopTc;
      }
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

/**
 * @route   GET /api/lecturer/classes/:idLopTc/students
 * @desc    Lấy danh sách sinh viên đăng ký lớp tín chỉ từ SQL Server
 * @access  Private (JWT, role=lecturer)
 */
router.get('/classes/:idLopTc/students', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Quyền truy cập bị từ chối!' });
    }

    const idLopTc = parseInt(req.params.idLopTc);
    if (!idLopTc) {
      return res.status(400).json({ success: false, message: 'Mã lớp tín chỉ không hợp lệ!' });
    }

    const pool = await getPool();
    const students = await tuafQueries.getClassStudents(pool, idLopTc);

    res.json({
      success: true,
      idLopTc,
      totalStudents: students.length,
      data: students
    });
  } catch (error) {
    console.error('❌ [API /lecturer/classes/:idLopTc/students] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải danh sách sinh viên lớp!', error: error.message });
  }
});

/**
 * @route   GET /api/lecturer/attendance
 * @desc    Lấy dữ liệu điểm danh đã lưu của 1 buổi học
 * @access  Private (JWT, role=lecturer)
 */
router.get('/attendance', authMiddleware, async (req, res) => {
  try {
    const { scheduleId, date } = req.query;
    if (!scheduleId || !date) {
      return res.status(400).json({ success: false, message: 'Thiếu scheduleId hoặc date!' });
    }

    const attendanceRecords = await StudentAttendance.findAll({
      where: { scheduleId, date },
      order: [['studentClass', 'ASC'], ['studentCode', 'ASC']]
    });

    res.json({
      success: true,
      scheduleId,
      date,
      totalRecords: attendanceRecords.length,
      data: attendanceRecords
    });
  } catch (error) {
    console.error('❌ [API GET /lecturer/attendance] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải bảng điểm danh!', error: error.message });
  }
});

/**
 * @route   POST /api/lecturer/attendance
 * @desc    Lưu điểm danh sinh viên buổi học + TỰ ĐỘNG BÁO CHO GVCN NẾU CÓ SV VẮNG/MUỘN
 * @access  Private (JWT, role=lecturer)
 */
router.post('/attendance', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Chức năng chỉ dành cho Giảng viên!' });
    }

    const { scheduleId, date, classCode, courseName, records } = req.body;
    if (!scheduleId || !date || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, message: 'Dữ liệu điểm danh không hợp lệ!' });
    }

    // 1. Lưu/Cập nhật từng bản ghi điểm danh vào PostgreSQL
    const savedRecords = [];
    for (const item of records) {
      const [record] = await StudentAttendance.upsert({
        scheduleId,
        date,
        classCode: classCode || '',
        courseName: courseName || '',
        studentCode: item.studentCode,
        studentName: item.studentName || '',
        studentClass: item.studentClass || '',
        status: item.status || 'present',
        note: item.note || '',
        lecturerId: req.user.id
      });
      savedRecords.push(record);
    }

    // 2. TỰ ĐỘNG THÔNG BÁO CHO GVCN NẾU CÓ SINH VIÊN VẮNG HOẶC ĐI MUỘN HOẶC CÓ PHÉP
    const abnormalStudents = records.filter(r => ['absent', 'late', 'excused'].includes(r.status));
    
    if (abnormalStudents.length > 0) {
      try {
        const pool = await getPool();
        const schedule = await Schedule.findByPk(scheduleId);

        // Nhóm SV theo lớp sinh hoạt
        const byClass = {};
        for (const s of abnormalStudents) {
          const cls = s.studentClass || 'Chưa rõ';
          if (!byClass[cls]) byClass[cls] = [];
          byClass[cls].push(s);
        }

        // Với mỗi lớp sinh hoạt có SV vắng/muộn, tạo thông báo gửi GVCN
        for (const [homeroomClass, studentsList] of Object.entries(byClass)) {
          const absentCount = studentsList.filter(s => s.status === 'absent').length;
          const lateCount = studentsList.filter(s => s.status === 'late').length;
          const excusedCount = studentsList.filter(s => s.status === 'excused').length;

          // Tra cứu GVCN của lớp này từ SQL Server
          let tuafGvcnId = null;
          let homeroomTeacherUserId = null;

          const gvcnRes = await pool.request()
            .input('homeroomClass', sql.NVarChar(100), homeroomClass)
            .query(`
              SELECT TOP 1 gv.Id_cb
              FROM STU_GiaoVienChuNghiem gv
              JOIN STU_Lop l ON gv.ID_lop = l.ID_lop
              WHERE l.Ten_lop = @homeroomClass OR l.Ma_lop = @homeroomClass
              ORDER BY gv.Nam_hoc DESC
            `);

          if (gvcnRes.recordset.length > 0) {
            tuafGvcnId = String(gvcnRes.recordset[0].Id_cb);
            const gvcnUser = await User.findOne({
              where: { tuafLecturerId: tuafGvcnId }
            });
            if (gvcnUser) homeroomTeacherUserId = gvcnUser.id;
          }

          await HomeroomNotification.create({
            homeroomClass,
            homeroomTeacherId: homeroomTeacherUserId,
            tuafLecturerId: tuafGvcnId,
            scheduleId,
            courseName: courseName || schedule?.courseName || 'Học phần',
            sessionDate: date,
            periodText: schedule?.periodText || '',
            room: schedule?.room || '',
            courseTeacherName: req.user.fullName || req.user.username,
            absentCount,
            lateCount,
            excusedCount,
            studentDetails: JSON.stringify(studentsList),
            isRead: false
          });

          console.log(`📢 [GVCN Alert] Đã tạo thông báo điểm danh cho lớp ${homeroomClass}: ${absentCount} vắng, ${lateCount} muộn, ${excusedCount} phép`);
        }
      } catch (notifErr) {
        console.error('⚠️ [Attendance Notification Warning] Không thể tạo thông báo GVCN:', notifErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Lưu điểm danh thành công!',
      totalSaved: savedRecords.length,
      abnormalCount: abnormalStudents.length
    });
  } catch (error) {
    console.error('❌ [API POST /lecturer/attendance] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi lưu bảng điểm danh!', error: error.message });
  }
});

// ══════════════════════════════════════════════════════
// TAB GIÁO VIÊN CHỦ NHIỆM (GVCN / CỐ VẤN HỌC TẬP)
// ══════════════════════════════════════════════════════

/**
 * @route   GET /api/lecturer/homeroom/classes
 * @desc    Lấy danh sách các lớp mà Giảng viên làm Chủ nhiệm (GVCN)
 * @access  Private (JWT, role=lecturer)
 */
router.get('/homeroom/classes', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    const idCb = await resolveLecturerIdCb(pool, req.user);

    if (!idCb) {
      return res.json({
        success: true,
        data: [],
        message: 'Không tìm thấy hồ sơ cán bộ trên hệ thống đào tạo!'
      });
    }

    const { schoolYear } = req.query;
    const homeroomClasses = await tuafQueries.getHomeroomClasses(pool, idCb, schoolYear);

    res.json({
      success: true,
      data: homeroomClasses,
      totalClasses: homeroomClasses.length
    });
  } catch (error) {
    console.error('❌ [API /lecturer/homeroom/classes] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải danh sách lớp chủ nhiệm!', error: error.message });
  }
});

/**
 * @route   GET /api/lecturer/homeroom/:idLop/course-registration
 * @desc    Theo dõi đăng ký học (tín chỉ, cảnh báo thiếu môn kế hoạch)
 * @access  Private (JWT, role=lecturer)
 */
router.get('/homeroom/:idLop/course-registration', authMiddleware, async (req, res) => {
  try {
    const idLop = parseInt(req.params.idLop);
    if (!idLop) {
      return res.status(400).json({ success: false, message: 'Mã lớp không hợp lệ!' });
    }

    const pool = await getPool();
    const hocKy = parseInt(req.query.semester) || 1;
    const namHoc = req.query.schoolYear || '2026-2027';

    const result = await tuafQueries.getHomeroomStudentsRegistration(pool, idLop, hocKy, namHoc);

    // Tính toán tóm tắt
    const students = result.students || [];
    const warningCount = students.filter(s => s.hasWarning).length;
    const normalCount = students.length - warningCount;
    const avgCredits = students.length > 0
      ? Math.round((students.reduce((sum, s) => sum + s.totalCredits, 0) / students.length) * 10) / 10
      : 0;

    res.json({
      success: true,
      data: {
        className: result.className,
        classCode: result.classCode,
        plannedCourses: result.plannedCourses || [],
        summary: {
          totalStudents: students.length,
          warningCount,
          normalCount,
          avgCredits
        },
        students
      }
    });
  } catch (error) {
    console.error('❌ [API /lecturer/homeroom/:idLop/course-registration] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải dữ liệu đăng ký học!', error: error.message });
  }
});

/**
 * @route   GET /api/lecturer/homeroom/:idLop/tuition
 * @desc    Theo dõi học phí lớp chủ nhiệm (nợ, không nợ, thừa tiền)
 * @access  Private (JWT, role=lecturer)
 */
router.get('/homeroom/:idLop/tuition', authMiddleware, async (req, res) => {
  try {
    const idLop = parseInt(req.params.idLop);
    if (!idLop) {
      return res.status(400).json({ success: false, message: 'Mã lớp không hợp lệ!' });
    }

    const pool = await getPool();
    const hocKy = parseInt(req.query.semester) || 1;
    const namHoc = req.query.schoolYear || '2026-2027';

    const result = await tuafQueries.getHomeroomStudentsFinance(pool, idLop, hocKy, namHoc);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ [API /lecturer/homeroom/:idLop/tuition] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải dữ liệu học phí!', error: error.message });
  }
});

/**
 * @route   GET /api/lecturer/homeroom/alerts
 * @desc    Lấy danh sách thông báo điểm danh từ GV học phần gửi cho GVCN
 * @access  Private (JWT, role=lecturer)
 */
router.get('/homeroom/alerts', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();
    const idCb = await resolveLecturerIdCb(pool, req.user);

    // Lấy danh sách tên các lớp chủ nhiệm của GV này
    let homeroomClassNames = [];
    if (idCb) {
      const classes = await tuafQueries.getHomeroomClasses(pool, idCb);
      homeroomClassNames = classes.map(c => c.className).filter(Boolean);
    }

    const whereConditions = [];
    if (req.user.id) {
      whereConditions.push({ homeroomTeacherId: req.user.id });
    }
    if (idCb) {
      whereConditions.push({ tuafLecturerId: String(idCb) });
    }
    if (homeroomClassNames.length > 0) {
      whereConditions.push({ homeroomClass: { [Op.in]: homeroomClassNames } });
    }

    const where = whereConditions.length > 0 ? { [Op.or]: whereConditions } : {};

    const alerts = await HomeroomNotification.findAll({
      where,
      order: [['sessionDate', 'DESC'], ['createdAt', 'DESC']],
      limit: 50
    });

    const unreadCount = alerts.filter(a => !a.isRead).length;

    res.json({
      success: true,
      unreadCount,
      totalAlerts: alerts.length,
      data: alerts
    });
  } catch (error) {
    console.error('❌ [API /lecturer/homeroom/alerts] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải thông báo chủ nhiệm!', error: error.message });
  }
});

/**
 * @route   PUT /api/lecturer/homeroom/alerts/:id/read
 * @desc    Đánh dấu đã xem thông báo điểm danh
 * @access  Private (JWT, role=lecturer)
 */
router.put('/homeroom/alerts/:id/read', authMiddleware, async (req, res) => {
  try {
    const alert = await HomeroomNotification.findByPk(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo!' });
    }
    alert.isRead = true;
    await alert.save();

    res.json({ success: true, message: 'Đã đánh dấu đã đọc!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái!', error: error.message });
  }
});

module.exports = router;
