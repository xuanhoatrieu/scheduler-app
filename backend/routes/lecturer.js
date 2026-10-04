const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/auth');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const StudentAttendance = require('../models/StudentAttendance');
const HomeroomNotification = require('../models/HomeroomNotification');
const User = require('../models/User');
const tuafQueries = require('../services/tuafQueries');
const financeReader = require('../services/financeReader');
const { getPool, sql } = require('../services/namvietConnector');
const {
  createLecturerAccess,
  isValidStudentCode,
  resolveLecturerIdCb: resolveIdCb
} = require('../middleware/requireHomeroom');

const { requireLecturer, requireHomeroomOf, requireTeachingClass } = createLecturerAccess({ getPool, tuafQueries });

/**
 * Helper lấy idCb của giảng viên (chỉ gọi khi user.role === 'lecturer')
 */
function resolveLecturerIdCb(pool, user) {
  return resolveIdCb(pool, user, tuafQueries.findLecturerId);
}

/**
 * Điều kiện lọc thông báo điểm danh thuộc về GVCN đang đăng nhập
 * (theo user id, ID_cb và tên/mã các lớp đang chủ nhiệm hiện tại).
 */
async function buildHomeroomAlertScope(pool, user) {
  const idCb = await resolveLecturerIdCb(pool, user);
  const homeroomClassNames = [];
  if (idCb) {
    const classes = await tuafQueries.getHomeroomClasses(pool, idCb);
    for (const c of classes) {
      if (c.className) {
        homeroomClassNames.push(c.className);
        homeroomClassNames.push(c.className.replace(/\s+/g, ''));
      }
      if (c.classCode) {
        homeroomClassNames.push(c.classCode);
        homeroomClassNames.push(c.classCode.replace(/\s+/g, ''));
      }
    }
  }

  const conditions = [{ homeroomTeacherId: user.id }];
  if (idCb) conditions.push({ tuafLecturerId: String(idCb) });
  if (homeroomClassNames.length > 0) {
    conditions.push({ homeroomClass: { [Op.in]: [...new Set(homeroomClassNames)] } });
  }
  return conditions;
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
router.get('/classes/:idLopTc/students', authMiddleware, requireTeachingClass, async (req, res) => {
  try {
    const { pool, idLopTc } = req.teaching;
    const students = await tuafQueries.getClassStudents(pool, idLopTc);

    res.json({
      success: true,
      idLopTc,
      totalStudents: students.length,
      data: students
    });
  } catch (error) {
    console.error('❌ [API /lecturer/classes/:idLopTc/students] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải danh sách sinh viên lớp!' });
  }
});

/**
 * @route   GET /api/lecturer/exams/candidates
 * @desc    Lấy danh sách thí sinh của 1 ca thi (theo phòng thi ID_dot_thi_phong hoặc theo lớp tín chỉ ID_lop_tc)
 * @access  Private (JWT, role=lecturer)
 */
router.get('/exams/candidates', authMiddleware, requireLecturer, async (req, res) => {
  try {
    const pool = await getPool();
    const idCb = await resolveLecturerIdCb(pool, req.user);
    if (!idCb && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Bạn chưa được phân quyền giảng viên trong hệ thống!' });
    }

    const idDotThiPhong = req.query.idDotThiPhong ? parseInt(req.query.idDotThiPhong, 10) : null;
    const idLopTc = req.query.idLopTc || req.query.classCode ? parseInt(req.query.idLopTc || req.query.classCode, 10) : null;

    if (!idDotThiPhong && !idLopTc) {
      return res.status(400).json({ success: false, message: 'Thiếu idDotThiPhong hoặc idLopTc!' });
    }

    // Kiểm tra quyền: admin hoặc giảng viên có thẩm quyền đối với ca thi này
    if (req.user.role !== 'admin') {
      const isAuth = await tuafQueries.isAuthorizedForExamRoom(pool, idCb, idDotThiPhong, idLopTc);
      if (!isAuth) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xem danh sách sinh viên ca thi này!' });
      }
    }

    let candidates = [];
    let source = 'room';

    // 1. Ưu tiên lấy theo phòng thi
    if (idDotThiPhong && idDotThiPhong > 0) {
      candidates = await tuafQueries.getExamRoomCandidates(pool, idDotThiPhong);
    }

    // 2. Fallback: Nếu phòng thi chưa xếp danh sách thí sinh hoặc không có idDotThiPhong, lấy theo lớp tín chỉ
    if (candidates.length === 0 && idLopTc && idLopTc > 0) {
      source = 'class';
      const classStudents = await tuafQueries.getClassStudents(pool, idLopTc);
      candidates = classStudents.map((st, idx) => ({
        sbd: String(idx + 1).padStart(3, '0'),
        studentCode: st.studentCode,
        studentName: st.studentName,
        studentClass: st.studentClass,
        dob: st.dob,
        note: null
      }));
    }

    res.json({
      success: true,
      source,
      idDotThiPhong,
      idLopTc,
      totalStudents: candidates.length,
      data: candidates
    });
  } catch (error) {
    console.error('❌ [API /lecturer/exams/candidates] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải danh sách thí sinh ca thi!' });
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

        // Lấy thông tin lớp chủ nhiệm & GVCN thực tế cho từng sinh viên bất thường từ SQL Server
        const studentCodes = abnormalStudents.map(s => s.studentCode).filter(Boolean);
        const studentInfoMap = new Map();

        if (studentCodes.length > 0) {
          const codeList = studentCodes.map(c => `'${c.replace(/'/g, '')}'`).join(',');
          const stuClassRes = await pool.request().query(`
            SELECT
              sv.Ma_sv,
              l.ID_lop AS idLop,
              COALESCE(l.Ten_lop, l.Ma_lop, '') AS homeroomClassName,
              gv.Id_cb AS gvcnIdCb
            FROM STU_HoSoSinhVien sv
            LEFT JOIN (
              SELECT dsl.ID_sv, MAX(dsl.ID_lop) AS ID_lop
              FROM STU_DanhSach dsl
              WHERE ISNULL(dsl.Trang_thai, 0) = 0
              GROUP BY dsl.ID_sv
            ) dsl ON sv.ID_sv = dsl.ID_sv
            LEFT JOIN STU_Lop l ON dsl.ID_lop = l.ID_lop
            LEFT JOIN STU_GiaoVienChuNghiem gv ON l.ID_lop = gv.ID_lop
            WHERE sv.Ma_sv IN (${codeList})
            ORDER BY gv.Nam_hoc DESC
          `);

          for (const row of stuClassRes.recordset) {
            if (!studentInfoMap.has(row.Ma_sv)) {
              studentInfoMap.set(row.Ma_sv, row);
            }
          }
        }

        // Nhóm SV theo lớp sinh hoạt thực tế
        const byClass = {};
        for (const s of abnormalStudents) {
          const info = studentInfoMap.get(s.studentCode);
          const cls = (info?.homeroomClassName || s.studentClass || 'Chưa rõ').trim();
          s.studentClass = cls;
          if (!byClass[cls]) {
            byClass[cls] = {
              gvcnIdCb: info?.gvcnIdCb,
              students: []
            };
          }
          byClass[cls].students.push(s);
        }

        // Với mỗi lớp sinh hoạt có SV vắng/muộn, tạo thông báo gửi GVCN
        for (const [homeroomClass, group] of Object.entries(byClass)) {
          const studentsList = group.students;
          const absentCount = studentsList.filter(s => s.status === 'absent').length;
          const lateCount = studentsList.filter(s => s.status === 'late').length;
          const excusedCount = studentsList.filter(s => s.status === 'excused').length;

          let tuafGvcnId = group.gvcnIdCb ? String(group.gvcnIdCb) : null;
          let homeroomTeacherUserId = null;

          if (!tuafGvcnId && homeroomClass !== 'Chưa rõ') {
            const gvcnRes = await pool.request()
              .input('homeroomClass', sql.NVarChar(100), homeroomClass)
              .query(`
                SELECT TOP 1 gv.Id_cb
                FROM STU_GiaoVienChuNghiem gv
                JOIN STU_Lop l ON gv.ID_lop = l.ID_lop
                WHERE l.Ten_lop = @homeroomClass 
                   OR l.Ma_lop = @homeroomClass
                   OR REPLACE(l.Ten_lop, ' ', '') = REPLACE(@homeroomClass, ' ', '')
                ORDER BY gv.Nam_hoc DESC
              `);

            if (gvcnRes.recordset.length > 0) {
              tuafGvcnId = String(gvcnRes.recordset[0].Id_cb);
            }
          }

          if (tuafGvcnId) {
            const gvcnUser = await User.findOne({
              where: {
                [Op.or]: [
                  { tuafStudentId: tuafGvcnId }
                ]
              }
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

          console.log(`📢 [GVCN Alert] Đã tạo thông báo điểm danh cho lớp ${homeroomClass} (GVCN: ${tuafGvcnId}): ${absentCount} vắng, ${lateCount} muộn, ${excusedCount} phép`);
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
router.get('/homeroom/classes', authMiddleware, requireLecturer, async (req, res) => {
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
    res.status(500).json({ success: false, message: 'Không thể tải danh sách lớp chủ nhiệm!' });
  }
});

/**
 * @route   GET /api/lecturer/homeroom/:idLop/course-registration
 * @desc    Theo dõi đăng ký học (tín chỉ, cảnh báo thiếu môn kế hoạch)
 * @access  Private (JWT, role=lecturer)
 */
router.get('/homeroom/:idLop/course-registration', authMiddleware, requireHomeroomOf, async (req, res) => {
  try {
    const { pool, idLop } = req.homeroom;
    const hocKy = parseInt(req.query.semester) || 1;
    const namHoc = req.query.schoolYear || '2026-2027';

    const result = await tuafQueries.getHomeroomStudentsRegistration(pool, idLop, hocKy, namHoc);

    // Tính toán tóm tắt
    const students = result.students || [];
    const activeStudents = students.filter(s => s.statusId === 0);
    const leaveStudents = students.filter(s => s.statusId === 2);
    const reservedStudents = students.filter(s => s.statusId === 1);
    const warningCount = activeStudents.filter(s => s.hasWarning).length;
    const normalCount = activeStudents.length - warningCount;
    const avgCredits = activeStudents.length > 0
      ? Math.round((activeStudents.reduce((sum, s) => sum + s.totalCredits, 0) / activeStudents.length) * 10) / 10
      : 0;

    res.json({
      success: true,
      data: {
        className: result.className,
        classCode: result.classCode,
        plannedCourses: result.plannedCourses || [],
        summary: {
          totalStudents: students.length,
          activeCount: activeStudents.length,
          leaveCount: leaveStudents.length,
          reservedCount: reservedStudents.length,
          warningCount,
          normalCount,
          avgCredits,
          averageCredits: avgCredits
        },
        students
      }
    });
  } catch (error) {
    console.error('❌ [API /lecturer/homeroom/:idLop/course-registration] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải dữ liệu đăng ký học!' });
  }
});

/**
 * @route   GET /api/lecturer/homeroom/:idLop/tuition
 * @desc    Theo dõi học phí lớp chủ nhiệm (nợ, không nợ, thừa tiền) — tổng toàn khóa, đọc trực tiếp
 *          SQL Server và tính bằng cùng bộ tính với màn hình Học phí của sinh viên
 * @access  Private (JWT, role=lecturer, GVCN hiện tại của lớp)
 */
router.get('/homeroom/:idLop/tuition', authMiddleware, requireHomeroomOf, async (req, res) => {
  try {
    const { pool, idLop } = req.homeroom;
    const result = await financeReader.getClassFinanceView(pool, idLop);

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ [API /lecturer/homeroom/:idLop/tuition] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải dữ liệu học phí!' });
  }
});

/**
 * @route   GET /api/lecturer/homeroom/:idLop/students/:studentCode/tuition
 * @desc    Chi tiết học phí từng kỳ + biên lai của 1 sinh viên thuộc lớp chủ nhiệm
 *          (cùng dữ liệu/cách tính với /api/finance/all của sinh viên)
 * @access  Private (JWT, role=lecturer, GVCN hiện tại của lớp, SV phải thuộc lớp)
 */
router.get('/homeroom/:idLop/students/:studentCode/tuition', authMiddleware, requireHomeroomOf, async (req, res) => {
  try {
    const { pool, idLop } = req.homeroom;
    const studentCode = String(req.params.studentCode || '').trim();
    if (!isValidStudentCode(studentCode)) {
      return res.status(400).json({ success: false, message: 'Mã sinh viên không hợp lệ!' });
    }

    const student = await tuafQueries.findStudentInClass(pool, idLop, studentCode);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên trong lớp chủ nhiệm!' });
    }

    const { data, summary } = await financeReader.getStudentFinanceView(pool, student.ID_sv);
    console.log(`👀 [GVCN-TUITION] ${req.user.username} xem ${student.studentCode} lớp ${idLop}`);

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        student: {
          studentCode: (student.studentCode || '').trim(),
          studentName: (student.studentName || '').trim(),
          studentClass: (student.studentClass || '').trim(),
          statusId: student.statusId,
          statusName: student.statusName,
          phone: (student.phone || '').trim(),
          email: (student.email || '').trim()
        },
        data,
        summary,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ [API /lecturer/homeroom/:idLop/students/:studentCode/tuition] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải chi tiết học phí sinh viên!' });
  }
});

/**
 * @route   GET /api/lecturer/homeroom/alerts
 * @desc    Lấy danh sách thông báo điểm danh từ GV học phần gửi cho GVCN
 * @access  Private (JWT, role=lecturer)
 */
router.get('/homeroom/alerts', authMiddleware, requireLecturer, async (req, res) => {
  try {
    const pool = await getPool();
    const where = { [Op.or]: await buildHomeroomAlertScope(pool, req.user) };

    const alerts = await HomeroomNotification.findAll({
      where,
      order: [['sessionDate', 'DESC'], ['createdAt', 'DESC']],
      limit: 50
    });

    const unreadCount = alerts.filter(a => !a.isRead).length;

    const formattedAlerts = alerts.map(a => {
      const plain = a.toJSON ? a.toJSON() : a;
      let students = [];
      try {
        students = typeof plain.studentDetails === 'string'
          ? JSON.parse(plain.studentDetails)
          : (plain.studentDetails || []);
      } catch (e) {
        students = [];
      }

      return {
        ...plain,
        lecturerName: plain.courseTeacherName || plain.lecturerName || '',
        className: plain.homeroomClass || plain.className || '',
        abnormalStudents: students,
        studentDetails: plain.studentDetails
      };
    });

    res.json({
      success: true,
      unreadCount,
      totalAlerts: alerts.length,
      data: formattedAlerts
    });
  } catch (error) {
    console.error('❌ [API /lecturer/homeroom/alerts] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải thông báo chủ nhiệm!' });
  }
});

/**
 * @route   PUT /api/lecturer/homeroom/alerts/:id/read
 * @desc    Đánh dấu đã xem thông báo điểm danh (chỉ thông báo thuộc lớp mình chủ nhiệm)
 * @access  Private (JWT, role=lecturer)
 */
router.put('/homeroom/alerts/:id/read', authMiddleware, requireLecturer, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ success: false, message: 'Mã thông báo không hợp lệ!' });
    }
    const pool = await getPool();
    const alert = await HomeroomNotification.findOne({
      where: { id, [Op.or]: await buildHomeroomAlertScope(pool, req.user) }
    });
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo!' });
    }
    alert.isRead = true;
    await alert.save();

    res.json({ success: true, message: 'Đã đánh dấu đã đọc!' });
  } catch (error) {
    console.error('❌ [API PUT /lecturer/homeroom/alerts/:id/read] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái!' });
  }
});

/**
 * @route   GET /api/lecturer/teaching-payment
 * @desc    Lấy dữ liệu thanh toán giờ giảng / duyệt tiền giảng từ SQL Server TUAF
 * @access  Private (JWT, role=lecturer)
 */
router.get('/teaching-payment', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'lecturer') {
      return res.status(403).json({ success: false, message: 'Chức năng chỉ dành cho Giảng viên!' });
    }

    let { schoolYear, semester } = req.query;

    const pool = await getPool();
    const idCb = await resolveLecturerIdCb(pool, req.user);
    if (!idCb) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ cán bộ giảng viên trong CSDL đào tạo!' });
    }

    // Xác định năm học
    let namHoc = schoolYear;
    if (!namHoc) {
      if (semester && typeof semester === 'string' && semester.includes('_')) {
        namHoc = semester.split('_')[0];
      } else {
        const currentTerm = await tuafQueries.getCurrentTerm(pool);
        namHoc = currentTerm?.Nam_hoc || '2025-2026';
      }
    }

    const availableYears = ['2025-2026', '2024-2025', '2023-2024', '2022-2023'];

    const result = await tuafQueries.getLecturerYearlyTeachingSummary(pool, idCb, namHoc);

    // Ghép danh sách phẳng cho các client cũ tương thích
    const allFlatClasses = [
      ...(result.teaching?.semester1?.classes || []),
      ...(result.teaching?.semester2?.classes || []),
      ...(result.teaching?.otherSemesters || [])
    ];

    res.json({
      success: true,
      schoolYear: namHoc,
      availableYears,
      isOfficial: result.summary?.isOfficial ?? false,
      summary: result.summary,
      settlement: result.summary?.settlement,
      teaching: result.teaching,
      otherTasks: result.otherTasks,
      data: allFlatClasses // tương thích ngược
    });
  } catch (error) {
    console.error('❌ [API /lecturer/teaching-payment] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải dữ liệu thanh toán giờ giảng!', error: error.message });
  }
});

/**
 * @route   GET /api/lecturer/inspector-logs
 * @desc    Lấy danh sách các buổi học bị Thanh tra ghi nhận lỗi (Đi muộn, Về sớm, Bỏ giờ)
 * @access  Private (JWT, role=lecturer)
 */
router.get('/inspector-logs', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'lecturer') {
      return res.status(403).json({ success: false, message: 'Chức năng chỉ dành cho Giảng viên!' });
    }

    const { semester, schoolYear } = req.query;
    const where = {
      lecturerId: req.user.id,
      status: { [Op.in]: ['late', 'early_leave', 'absent'] }
    };
    if (semester) where.semester = String(semester);
    if (schoolYear) where.schoolYear = String(schoolYear);

    const logs = await Attendance.findAll({
      where,
      order: [['date', 'DESC'], ['createdAt', 'DESC']]
    });

    const scheduleIds = logs.map(l => l.scheduleId).filter(Boolean);
    const schedules = await Schedule.findAll({
      where: { id: { [Op.in]: scheduleIds } }
    });
    const schedMap = new Map(schedules.map(s => [s.id, s]));

    const formatted = logs.map(item => {
      const s = schedMap.get(item.scheduleId) || {};
      return {
        id: item.id,
        date: item.date,
        courseName: s.courseName || 'Học phần',
        classCode: s.classCode || '',
        room: s.room || '',
        periodText: s.periodText || '',
        scheduledStart: item.scheduledStart,
        scheduledEnd: item.scheduledEnd,
        checkInTime: item.checkInTime,
        checkOutTime: item.checkOutTime,
        status: item.status,
        statusText: item.status === 'late' ? 'Đi muộn' : item.status === 'early_leave' ? 'Về sớm' : 'Bỏ giờ / Vắng',
        lateMinutes: item.lateMinutes || 0,
        earlyMinutes: item.earlyMinutes || 0,
        note: item.note || '',
        hasPermission: item.hasPermission,
        rescheduledDate: item.rescheduledDate,
        rescheduledReason: item.rescheduledReason,
        semester: item.semester,
        schoolYear: item.schoolYear,
        explanation: item.explanation || null,
        explanationStatus: item.explanationStatus || 'pending'
      };
    });

    res.json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error('❌ [API /lecturer/inspector-logs] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải nhật ký thanh tra!', error: error.message });
  }
});

/**
 * @route   POST /api/lecturer/inspector-logs/:id/explanation
 * @desc    Gửi giải trình cho sự kiện bị thanh tra ghi nhận lỗi
 * @access  Private (JWT, role=lecturer)
 */
router.post('/inspector-logs/:id/explanation', authMiddleware, async (req, res) => {
  try {
    const { reason, proofNote } = req.body;
    res.json({
      success: true,
      message: 'Đã tiếp nhận thông tin giải trình của Thầy/Cô. Hệ thống đang ghi nhận thử nghiệm.'
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
