const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const ExamViolation = require('../models/ExamViolation');
const ExamRoomInspection = require('../models/ExamRoomInspection');
const User = require('../models/User');
const {
  parsePeriodNumbers,
  parsePeriodToTime,
  classifySchedulePeriodBlock,
  calculateAttendanceStatus,
  getExamStartTime,
  calculateExamEndTime,
  getExamDurationMinutes,
  formatExamFormat,
  formatExamTime,
  classifyExamShift
} = require('../utils/periodMapping');
const { calculateSummary, groupByLecturer } = require('../utils/attendanceStats');
const { sendInspectorReportEmail } = require('../services/emailReportService');
const namvietConnector = require('../services/namvietConnector');
const tuafQueries = require('../services/tuafQueries');

const VALID_VIOLATION_LEVELS = ['reprimand', 'warning', 'suspension', 'late_disqualified', 'other'];
const VALID_ROOM_STATUSES = ['pending', 'normal', 'proctor_late', 'proctor_changed', 'proctor_absent', 'other_issue'];

const DEFAULT_PENALTY_BY_LEVEL = {
  reprimand: 'Khiển trách - Trừ 25% điểm bài thi',
  warning: 'Cảnh cáo - Trừ 50% điểm bài thi',
  suspension: 'Đình chỉ thi - Điểm 0 bài thi',
  late_disqualified: 'Đến muộn quá 15 phút - Không được dự thi (Vắng thi)',
  other: 'Nhắc nhở / Xử lý theo quy chế phòng thi'
};

/**
 * Tạo khóa định danh ổn định cho phòng thi trong ngày
 */
function buildExamRoomKey(r, dateStr = '') {
  if (r.roomKey) return String(r.roomKey).trim();
  if (r.idDotThiPhong) return `dtp_${r.idDotThiPhong}`;
  if (r.idPhongThi) return `pt_${r.idPhongThi}`;
  const cleanRoom = String(r.room || '').replace(/\s+/g, '');
  const cleanCourse = String(r.courseCode || r.courseName || '').replace(/\s+/g, '');
  const cleanTime = String(r.startTime || r.tuTiet || '1').replace(/\s+/g, '');
  return `room_${dateStr}_${cleanCourse}_${cleanRoom}_${cleanTime}`;
}

/**
 * Sắp xếp danh sách lớp học phần tăng dần theo Tiết bắt đầu -> Tiết kết thúc -> Giờ bắt đầu -> Phòng học -> Mã lớp
 */
function sortInspectorClasses(classesList) {
  return [...(classesList || [])].sort((a, b) => {
    const parsedA = parsePeriodNumbers(a.periodText);
    const parsedB = parsePeriodNumbers(b.periodText);
    const startA = Number(a.startPeriod) || parsedA.startPeriod || 1;
    const startB = Number(b.startPeriod) || parsedB.startPeriod || 1;
    if (startA !== startB) return startA - startB;

    const endA = Number(a.endPeriod) || parsedA.endPeriod || startA;
    const endB = Number(b.endPeriod) || parsedB.endPeriod || startB;
    if (endA !== endB) return endA - endB;

    const timeCmp = String(a.scheduledStart || '').localeCompare(String(b.scheduledStart || ''));
    if (timeCmp !== 0) return timeCmp;

    const roomCmp = String(a.room || '').localeCompare(String(b.room || ''), 'vi');
    if (roomCmp !== 0) return roomCmp;

    return String(a.classCode || '').localeCompare(String(b.classCode || ''), 'vi');
  });
}

/**
 * Sắp xếp danh sách phòng thi tăng dần theo Giờ bắt đầu -> Tiết bắt đầu -> Phòng thi -> Tên môn
 */
function sortInspectorExamRooms(roomsList) {
  return [...(roomsList || [])].sort((a, b) => {
    const timeCmp = String(a.startTime || '07:30').localeCompare(String(b.startTime || '07:30'));
    if (timeCmp !== 0) return timeCmp;

    const tietA = Number(a.tuTiet) || 1;
    const tietB = Number(b.tuTiet) || 1;
    if (tietA !== tietB) return tietA - tietB;

    const roomCmp = String(a.room || '').localeCompare(String(b.room || ''), 'vi');
    if (roomCmp !== 0) return roomCmp;

    return String(a.courseName || '').localeCompare(String(b.courseName || ''), 'vi');
  });
}

/**
 * Lấy danh sách lớp học theo ngày cho Thanh tra:
 * Ưu tiên đọc trực tiếp từ SQL Server TUAF (toàn trường), đồng bộ vào bảng Schedules của PostgreSQL để phục vụ ghi điểm danh.
 * Fallback sang PostgreSQL nếu mất kết nối SQL Server.
 */
async function fetchInspectorSchedulesByDate(dateStr, dayOfWeek, thuSql) {
  let schedules = [];
  const studentCountMap = new Map();
  try {
    const pool = await namvietConnector.getPool();
    const rawClasses = await tuafQueries.getInspectorClassesByDate(pool, dateStr, thuSql);

    if (rawClasses && rawClasses.length > 0) {
      const idLopTcList = rawClasses.map(c => c.idLopTc).filter(Boolean);
      const existingSchedules = await Schedule.findAll({
        where: {
          idLopTc: { [Op.in]: idLopTcList },
          dayOfWeek
        }
      });

      const scheduleMap = new Map();
      for (const s of existingSchedules) {
        scheduleMap.set(`${s.idLopTc}_${s.periodText}_${s.room || ''}`, s);
        if (!scheduleMap.has(`${s.idLopTc}_${s.periodText}`)) {
          scheduleMap.set(`${s.idLopTc}_${s.periodText}`, s);
        }
        if (!scheduleMap.has(`${s.idLopTc}`)) {
          scheduleMap.set(`${s.idLopTc}`, s);
        }
      }

      const toCreate = [];
      const toUpdate = [];

      for (const c of rawClasses) {
        const startP = (c.startPeriod != null && c.startPeriod >= 0) ? c.startPeriod + 1 : 1;
        const endP = startP + (c.periodCount || 1) - 1;
        const pText = `${startP}-${endP}`;
        const cleanRoom = (c.room || '').replace(/[\r\n]+/g, '').trim();

        if (c.idLopTc && c.studentCount != null) {
          studentCountMap.set(c.idLopTc, Number(c.studentCount) || 0);
        }

        const keyExact = `${c.idLopTc}_${pText}_${cleanRoom}`;
        const keyGeneral = `${c.idLopTc}_${pText}`;
        const existing = scheduleMap.get(keyExact) || scheduleMap.get(keyGeneral) || scheduleMap.get(`${c.idLopTc}`);

        if (!existing) {
          let uId = '00000000-0000-0000-0000-000000000000';
          if (c.lecturerId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.lecturerId)) {
            uId = c.lecturerId;
          }
          toCreate.push({
            userId: uId,
            courseName: c.courseName || '',
            credits: c.credits || 0,
            classCode: c.classCode || '',
            idLopTc: c.idLopTc,
            studyTime: dateStr,
            dayOfWeek,
            room: cleanRoom,
            teacherName: c.teacherName || '',
            periodText: pText,
            semester: 'HocKy1',
            schoolYear: '2026-2027',
            batch: 'Dothoc1'
          });
        } else {
          let needsUpdate = false;
          if (cleanRoom && existing.room !== cleanRoom) {
            existing.room = cleanRoom;
            needsUpdate = true;
          }
          if (pText && existing.periodText !== pText) {
            existing.periodText = pText;
            needsUpdate = true;
          }
          if (c.teacherName && existing.teacherName !== c.teacherName) {
            existing.teacherName = c.teacherName;
            needsUpdate = true;
          }
          if (needsUpdate) {
            toUpdate.push(existing.save());
          }
        }
      }

      if (toCreate.length > 0) {
        const created = await Schedule.bulkCreate(toCreate);
        for (const s of created) {
          scheduleMap.set(`${s.idLopTc}_${s.periodText}_${s.room || ''}`, s);
          scheduleMap.set(`${s.idLopTc}_${s.periodText}`, s);
          scheduleMap.set(`${s.idLopTc}`, s);
        }
      }

      if (toUpdate.length > 0) {
        await Promise.allSettled(toUpdate);
      }

      schedules = rawClasses.map(c => {
        const startP = (c.startPeriod != null && c.startPeriod >= 0) ? c.startPeriod + 1 : 1;
        const endP = startP + (c.periodCount || 1) - 1;
        const pText = `${startP}-${endP}`;
        const cleanRoom = (c.room || '').replace(/[\r\n]+/g, '').trim();

        const s = scheduleMap.get(`${c.idLopTc}_${pText}_${cleanRoom}`) ||
                  scheduleMap.get(`${c.idLopTc}_${pText}`) ||
                  scheduleMap.get(`${c.idLopTc}`);

        if (s) {
          if (cleanRoom) s.room = cleanRoom;
          if (pText) s.periodText = pText;
          if (c.teacherName) s.teacherName = c.teacherName;
          s.studentCount = Number(c.studentCount) || studentCountMap.get(c.idLopTc) || 0;
          return s;
        }
        return null;
      }).filter(Boolean);
    }
  } catch (sqlErr) {
    console.warn('⚠️ [Inspector] Không thể lấy lịch từ SQL Server, fallback sang PostgreSQL cache:', sqlErr.message);
  }

  if (schedules.length === 0) {
    schedules = await Schedule.findAll({
      where: {
        dayOfWeek,
        [Op.and]: [
          { studyTime: { [Op.like]: `%${dateStr.substring(0, 7)}%` } }
        ]
      },
      order: [['studyTime', 'ASC'], ['classCode', 'ASC']]
    });
  }

  return schedules;
}

/**
 * Lấy danh sách phòng thi theo ngày cho Thanh tra (kết hợp SQL Server TUAF + PostgreSQL fallback)
 */
async function fetchInspectorExamRoomsByDate(dateStr) {
  let rawRooms = [];
  try {
    const pool = await namvietConnector.getPool();
    rawRooms = await tuafQueries.getInspectorExamRoomsByDate(pool, dateStr);
  } catch (sqlErr) {
    console.warn('⚠️ [Inspector Exams] Không thể lấy lịch thi từ SQL Server, fallback sang PostgreSQL cache:', sqlErr.message);
  }

  if (!rawRooms || rawRooms.length === 0) {
    // Fallback từ bảng Exams của PostgreSQL (chấp nhận cả YYYY-MM-DD và DD/MM/YYYY)
    const [y, m, d] = dateStr.split('-');
    const dmyStr = `${d}/${m}/${y}`;
    const cachedExams = await Exam.findAll({
      where: {
        examDate: { [Op.in]: [dateStr, dmyStr] }
      }
    });

    const seenFallback = new Set();
    for (const ex of cachedExams) {
      const key = ex.idDotThiPhong ? `dtp_${ex.idDotThiPhong}` : `${ex.courseCode}_${ex.room}_${ex.startTime}`;
      if (seenFallback.has(key)) continue;
      seenFallback.add(key);

      const proctorsParts = String(ex.proctors || '').split(',').map(s => s.trim()).filter(Boolean);
      rawRooms.push({
        idDotThiPhong: ex.idDotThiPhong || null,
        idPhongThi: null,
        gioThi: ex.startTime || '',
        tuTiet: 1,
        soTiet: 2,
        room: ex.room || '',
        studentCount: ex.studentCount || 0,
        courseCode: ex.courseCode || '',
        courseName: ex.courseName || '',
        hinhThucId: 1,
        tenHinhThuc: ex.examFormat || 'Thi viết',
        soPhutThi: 60,
        lanThi: ex.examAttempt || 1,
        tenDot: ex.examBatch || '',
        cbCoiThi1: proctorsParts[0] || '',
        cbCoiThi2: proctorsParts[1] || ''
      });
    }
  }

  // Chuẩn hóa thông tin giờ thi, ca thi, hình thức thi cho từng phòng
  const normalizedRooms = rawRooms.map(r => {
    const examFormat = formatExamFormat(r.hinhThucId, r.tenHinhThuc);
    const durationMinutes = getExamDurationMinutes(r.soPhutThi, examFormat);
    const startTime = getExamStartTime(r.gioThi, r.tuTiet);
    const endTime = calculateExamEndTime(startTime, durationMinutes);
    const examTime = formatExamTime(startTime, durationMinutes);
    const shiftInfo = classifyExamShift(startTime);
    const startTiet = r.tuTiet != null && r.tuTiet > 0 ? r.tuTiet : 1;
    const endTiet = startTiet + (r.soTiet && r.soTiet > 0 ? r.soTiet : 2) - 1;
    const periodText = startTiet <= 15 ? `${startTiet}-${endTiet}` : `${startTiet}`;
    const proctors = [r.cbCoiThi1, r.cbCoiThi2].filter(Boolean).join(', ');
    const roomKey = buildExamRoomKey({ ...r, startTime }, dateStr);

    return {
      roomKey,
      idDotThiPhong: r.idDotThiPhong || null,
      idPhongThi: r.idPhongThi || null,
      examDate: dateStr,
      courseCode: r.courseCode || '',
      courseName: r.courseName || 'Môn thi học phần',
      room: r.room || 'Chưa xếp phòng',
      tuTiet: startTiet,
      soTiet: r.soTiet || 2,
      periodText,
      startTime,
      endTime,
      durationMinutes,
      examTime,
      shiftKey: shiftInfo.shiftKey,
      shiftLabel: shiftInfo.shiftLabel,
      shiftTitle: shiftInfo.shiftLabel,
      sessionKey: shiftInfo.sessionKey,
      sessionLabel: shiftInfo.sessionLabel,
      studentCount: Number(r.studentCount) || 0,
      examFormat,
      examAttempt: Number(r.lanThi) || 1,
      examBatch: r.tenDot || '',
      proctor1: r.cbCoiThi1 || '',
      proctor2: r.cbCoiThi2 || '',
      proctors: proctors || 'Chưa phân công CB coi thi'
    };
  });

  return sortInspectorExamRooms(normalizedRooms);
}

/**
 * Tổng hợp thống kê Thanh tra Lịch thi & Vi phạm quy chế thi theo khoảng ngày
 */
async function buildExamInspectionSummary(startDate, endDate) {
  const [roomInspections, violations] = await Promise.all([
    ExamRoomInspection.findAll({
      where: { examDate: { [Op.between]: [startDate, endDate] } },
      order: [['examDate', 'DESC'], ['updatedAt', 'DESC']]
    }),
    ExamViolation.findAll({
      where: { examDate: { [Op.between]: [startDate, endDate] } },
      order: [['examDate', 'DESC'], ['createdAt', 'DESC']]
    })
  ]);

  const normalRooms = roomInspections.filter(r => r.status === 'normal').length;
  const proctorLate = roomInspections.filter(r => r.status === 'proctor_late').length;
  const proctorChanged = roomInspections.filter(r => r.status === 'proctor_changed').length;
  const proctorAbsent = roomInspections.filter(r => r.status === 'proctor_absent').length;
  const otherRoomIssues = roomInspections.filter(r => r.status === 'other_issue').length;

  const reprimandCount = violations.filter(v => v.violationLevel === 'reprimand').length;
  const warningCount = violations.filter(v => v.violationLevel === 'warning').length;
  const suspensionCount = violations.filter(v => v.violationLevel === 'suspension').length;
  const lateDisqualifiedCount = violations.filter(v => v.violationLevel === 'late_disqualified').length;
  const otherViolationCount = violations.filter(v => v.violationLevel === 'other').length;

  const examRoomIssues = roomInspections
    .filter(r => r.status !== 'normal' || (r.note && r.note.trim()))
    .map(r => {
      const plain = r.toJSON ? r.toJSON() : r;
      return {
        ...plain,
        date: plain.examDate,
        proctors: [plain.proctor1, plain.proctor2].filter(Boolean).join(', ') || plain.proctor1 || ''
      };
    });

  const examViolations = violations.map(v => {
    const plain = v.toJSON ? v.toJSON() : v;
    const actionsArr = Array.isArray(plain.violationActions) ? plain.violationActions : [];
    return {
      ...plain,
      date: plain.examDate,
      violationType: plain.violationLevel,
      violationAction: actionsArr.join('; ')
    };
  });

  return {
    examSummary: {
      totalRoomsChecked: roomInspections.length,
      inspectedRooms: roomInspections.length,
      normalRooms,
      issueRooms: proctorLate + proctorChanged + proctorAbsent + otherRoomIssues,
      proctorLate,
      proctorChanged,
      proctorAbsent,
      otherRoomIssues,
      totalViolations: violations.length,
      reprimandCount,
      warningCount,
      suspensionCount,
      suspension: suspensionCount,
      lateDisqualifiedCount,
      otherViolationCount
    },
    examRoomIssues,
    examViolations
  };
}

/**
 * GET /api/inspector/attendance/today hoặc /api/inspector/attendance/classes?date=YYYY-MM-DD
 * Lay danh sach cac lop hoc theo ngay + trang thai diem danh
 * @access Private (inspector, admin)
 */
const getClassesHandler = async (req, res) => {
  try {
    let dateStr;
    let jsDay;
    if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      dateStr = req.query.date;
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      jsDay = dt.getDay();
    } else {
      const vnTime = new Date(Date.now() + 7 * 3600 * 1000);
      const year = vnTime.getUTCFullYear();
      const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
      const day = String(vnTime.getUTCDate()).padStart(2, '0');
      dateStr = `${year}-${month}-${day}`;
      jsDay = vnTime.getUTCDay();
    }

    const dayOfWeek = jsDay === 0 ? 8 : jsDay + 1;
    const thuSql = jsDay === 0 ? 6 : jsDay - 1;

    const schedules = await fetchInspectorSchedulesByDate(dateStr, dayOfWeek, thuSql);

    const scheduleIds = schedules.map(s => s.id);
    const attendance = await Attendance.findAll({
      where: {
        date: dateStr,
        scheduleId: { [Op.in]: scheduleIds }
      }
    });

    const attendanceMap = {};
    for (const a of attendance) {
      attendanceMap[a.scheduleId] = a;
    }

    const mapped = schedules.map(schedule => {
      const att = attendanceMap[schedule.id];
      const periodTimes = parsePeriodToTime(schedule.periodText);
      const blockInfo = classifySchedulePeriodBlock(schedule.periodText);
      const { startPeriod, endPeriod } = parsePeriodNumbers(schedule.periodText);

      return {
        scheduleId: schedule.id,
        idLopTc: schedule.idLopTc || null,
        courseName: schedule.courseName,
        classCode: schedule.classCode,
        teacherName: schedule.teacherName,
        room: schedule.room,
        studentCount: Number(schedule.studentCount) || 0,
        periodText: schedule.periodText,
        startPeriod,
        endPeriod,
        shiftKey: blockInfo.shiftKey,
        shiftLabel: blockInfo.shiftLabel,
        blockKey: blockInfo.blockKey,
        blockTitle: blockInfo.blockTitle,
        blockTimeRange: blockInfo.blockTimeRange,
        blockOrder: blockInfo.blockOrder,
        scheduledStart: periodTimes?.scheduledStart || blockInfo.scheduledStart || '07:00',
        scheduledEnd: periodTimes?.scheduledEnd || blockInfo.scheduledEnd || '17:55',
        date: dateStr,
        attendance: att ? {
          id: att.id,
          checkInTime: att.checkInTime,
          checkOutTime: att.checkOutTime,
          status: att.status,
          lateMinutes: att.lateMinutes,
          earlyMinutes: att.earlyMinutes,
          hasPermission: att.hasPermission,
          rescheduledDate: att.rescheduledDate,
          rescheduledReason: att.rescheduledReason,
          substituteTeacher: att.substituteTeacher,
          note: att.note
        } : null
      };
    });

    const result = sortInspectorClasses(mapped);

    res.json({
      success: true,
      date: dateStr,
      dayOfWeek,
      data: result
    });
  } catch (error) {
    console.error('[API /inspector/attendance] Loi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Khong the tai danh sach lop hoc!'
    });
  }
};

router.get('/attendance/today', authMiddleware, requireRole('inspector', 'admin'), getClassesHandler);
router.get('/attendance/classes', authMiddleware, requireRole('inspector', 'admin'), getClassesHandler);

/**
 * POST /api/inspector/attendance
 * Ghi nhan gio den/ve cho mot lop
 * @access Private (inspector, admin)
 */
router.post('/attendance', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const {
      scheduleId, date, checkInTime, checkOutTime, note,
      status: explicitStatus, lateMinutes: explicitLate, earlyMinutes: explicitEarly,
      hasPermission, rescheduledDate, rescheduledReason, substituteTeacher
    } = req.body;

    if (!scheduleId || !date) {
      return res.status(400).json({
        success: false,
        message: 'Thieu scheduleId hoac date!'
      });
    }

    const schedule = await Schedule.findByPk(scheduleId);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Khong tim thay lop hoc!'
      });
    }

    const periodTimes = parsePeriodToTime(schedule.periodText);
    const scheduledStart = periodTimes?.scheduledStart || '07:00';
    const scheduledEnd = periodTimes?.scheduledEnd || '17:55';

    let finalStatus = explicitStatus;
    let finalLate = explicitLate != null ? explicitLate : 0;
    let finalEarly = explicitEarly != null ? explicitEarly : 0;

    if (finalStatus === 'absent') {
      finalLate = 0;
      finalEarly = 0;
    } else if (!finalStatus && (checkInTime || checkOutTime)) {
      const calculated = calculateAttendanceStatus(
        checkInTime, checkOutTime, scheduledStart, scheduledEnd
      );
      finalStatus = calculated.status;
      finalLate = calculated.lateMinutes;
      finalEarly = calculated.earlyMinutes;
    } else if (!finalStatus) {
      finalStatus = 'pending';
    }

    const existing = await Attendance.findOne({
      where: { scheduleId, date }
    });

    let attendance;
    if (existing) {
      existing.checkInTime = finalStatus === 'absent' ? null : (checkInTime !== undefined ? checkInTime : existing.checkInTime);
      existing.checkOutTime = finalStatus === 'absent' ? null : (checkOutTime !== undefined ? checkOutTime : existing.checkOutTime);
      existing.status = finalStatus;
      existing.lateMinutes = finalLate;
      existing.earlyMinutes = finalEarly;
      existing.hasPermission = hasPermission !== undefined ? hasPermission : existing.hasPermission;
      existing.rescheduledDate = rescheduledDate !== undefined ? rescheduledDate : existing.rescheduledDate;
      existing.rescheduledReason = rescheduledReason !== undefined ? rescheduledReason : existing.rescheduledReason;
      if (substituteTeacher !== undefined) existing.substituteTeacher = substituteTeacher;
      existing.note = note !== undefined ? note : existing.note;
      existing.inspectorId = req.user.id;
      await existing.save();
      attendance = existing;
    } else {
      attendance = await Attendance.create({
        date,
        scheduleId,
        lecturerId: schedule.userId,
        inspectorId: req.user.id,
        checkInTime: finalStatus === 'absent' ? null : (checkInTime || null),
        checkOutTime: finalStatus === 'absent' ? null : (checkOutTime || null),
        scheduledStart,
        scheduledEnd,
        status: finalStatus,
        lateMinutes: finalLate,
        earlyMinutes: finalEarly,
        hasPermission: hasPermission !== undefined ? hasPermission : null,
        rescheduledDate: rescheduledDate || null,
        rescheduledReason: rescheduledReason || '',
        substituteTeacher: substituteTeacher || '',
        note: note || '',
        semester: schedule.semester,
        schoolYear: schedule.schoolYear
      });
    }

    res.json({
      success: true,
      message: 'Ghi nhan diem danh thanh cong!',
      data: {
        id: attendance.id,
        date: attendance.date,
        courseName: schedule.courseName,
        classCode: schedule.classCode,
        teacherName: schedule.teacherName,
        checkInTime: attendance.checkInTime,
        checkOutTime: attendance.checkOutTime,
        status: attendance.status,
        lateMinutes: attendance.lateMinutes,
        earlyMinutes: attendance.earlyMinutes,
        hasPermission: attendance.hasPermission,
        rescheduledDate: attendance.rescheduledDate,
        rescheduledReason: attendance.rescheduledReason,
        substituteTeacher: attendance.substituteTeacher,
        scheduledStart,
        scheduledEnd,
        note: attendance.note
      }
    });
  } catch (error) {
    console.error('[API /inspector/attendance] Loi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Khong the ghi nhan diem danh!'
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PHÂN HỆ THANH TRA LỊCH THI & GIÁM SÁT VI PHẠM QUY CHẾ THI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/inspector/exams?date=YYYY-MM-DD
 * Lấy danh sách phòng thi / ca thi trong ngày kèm trạng thái kiểm tra phòng/CBCT và số lượng thí sinh vi phạm
 * @access Private (inspector, admin)
 */
router.get('/exams', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    let dateStr;
    let jsDay;
    if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      dateStr = req.query.date;
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      jsDay = dt.getDay();
    } else {
      const vnTime = new Date(Date.now() + 7 * 3600 * 1000);
      const year = vnTime.getUTCFullYear();
      const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
      const day = String(vnTime.getUTCDate()).padStart(2, '0');
      dateStr = `${year}-${month}-${day}`;
      jsDay = vnTime.getUTCDay();
    }

    const dayOfWeek = jsDay === 0 ? 8 : jsDay + 1;

    const [rooms, roomInspections, violations] = await Promise.all([
      fetchInspectorExamRoomsByDate(dateStr),
      ExamRoomInspection.findAll({ where: { examDate: dateStr } }),
      ExamViolation.findAll({
        where: { examDate: dateStr },
        order: [['createdAt', 'DESC']]
      })
    ]);

    // Map trạng thái kiểm tra phòng thi theo roomKey và idDotThiPhong
    const inspectionByKey = new Map();
    for (const ri of roomInspections) {
      const plain = ri.toJSON ? ri.toJSON() : ri;
      if (plain.roomKey) inspectionByKey.set(plain.roomKey, plain);
      if (plain.idDotThiPhong) inspectionByKey.set(`dtp_${plain.idDotThiPhong}`, plain);
      if (plain.idPhongThi) inspectionByKey.set(`pt_${plain.idPhongThi}`, plain);
    }

    // Nhóm vi phạm thí sinh theo phòng thi
    const violationsByRoom = new Map();
    const pushViolationToKey = (k, vPlain) => {
      if (!k) return;
      if (!violationsByRoom.has(k)) violationsByRoom.set(k, []);
      const list = violationsByRoom.get(k);
      if (!list.some(x => x.id === vPlain.id)) {
        list.push(vPlain);
      }
    };

    for (const v of violations) {
      const rawPlain = v.toJSON ? v.toJSON() : v;
      const actionsArr = Array.isArray(rawPlain.violationActions) ? rawPlain.violationActions : [];
      const plain = {
        ...rawPlain,
        violationType: rawPlain.violationLevel,
        violationAction: actionsArr.join('; ')
      };
      if (plain.roomKey) pushViolationToKey(plain.roomKey, plain);
      if (plain.idDotThiPhong) pushViolationToKey(`dtp_${plain.idDotThiPhong}`, plain);
      if (plain.idPhongThi) pushViolationToKey(`pt_${plain.idPhongThi}`, plain);
    }

    const enrichedRooms = rooms.map(room => {
      const inspection =
        inspectionByKey.get(room.roomKey) ||
        (room.idDotThiPhong ? inspectionByKey.get(`dtp_${room.idDotThiPhong}`) : null) ||
        (room.idPhongThi ? inspectionByKey.get(`pt_${room.idPhongThi}`) : null) ||
        null;

      const roomViolations =
        violationsByRoom.get(room.roomKey) ||
        (room.idDotThiPhong ? violationsByRoom.get(`dtp_${room.idDotThiPhong}`) : null) ||
        (room.idPhongThi ? violationsByRoom.get(`pt_${room.idPhongThi}`) : null) ||
        [];

      return {
        ...room,
        roomInspection: inspection,
        violationCount: roomViolations.length,
        violations: roomViolations
      };
    });

    const totalRooms = enrichedRooms.length;
    const checkedRooms = enrichedRooms.filter(r => r.roomInspection && r.roomInspection.status !== 'pending').length;
    const normalRooms = enrichedRooms.filter(r => r.roomInspection && r.roomInspection.status === 'normal').length;
    const issueRooms = enrichedRooms.filter(
      r => (r.roomInspection && !['pending', 'normal'].includes(r.roomInspection.status)) || r.violationCount > 0
    ).length;
    const totalStudents = enrichedRooms.reduce((sum, r) => sum + (Number(r.studentCount) || 0), 0);

    res.json({
      success: true,
      date: dateStr,
      dayOfWeek,
      summary: {
        totalRooms,
        checkedRooms,
        inspectedRooms: checkedRooms,
        normalRooms,
        issueRooms,
        totalStudents,
        totalViolations: violations.length
      },
      data: enrichedRooms,
      examRooms: enrichedRooms
    });
  } catch (error) {
    console.error('[API GET /inspector/exams] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách lịch thi!'
    });
  }
});

/**
 * POST /api/inspector/exams/room-status
 * Ghi nhận trạng thái kiểm tra Phòng thi & Cán bộ coi thi + ô ghi chú
 * @access Private (inspector, admin)
 */
router.post('/exams/room-status', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const {
      roomKey: rawRoomKey,
      idDotThiPhong,
      idPhongThi,
      examDate: rawExamDate,
      date: rawDate,
      examTime,
      courseCode,
      courseName,
      room,
      proctor1: rawProctor1,
      proctor2,
      proctors,
      status,
      lateMinutes,
      substituteProctor,
      hasPermission,
      actualStudentCount,
      note
    } = req.body;

    const examDate = rawExamDate || rawDate;
    const proctor1 = rawProctor1 || proctors || '';

    if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(examDate))) {
      return res.status(400).json({
        success: false,
        message: 'Ngày thi (examDate) không hợp lệ! Sử dụng định dạng YYYY-MM-DD.'
      });
    }

    const finalStatus = VALID_ROOM_STATUSES.includes(status) ? status : 'normal';
    const roomKey = buildExamRoomKey({
      roomKey: rawRoomKey,
      idDotThiPhong,
      idPhongThi,
      courseCode,
      courseName,
      room,
      startTime: examTime
    }, examDate);

    const existing = await ExamRoomInspection.findOne({
      where: { examDate, roomKey }
    });

    const payload = {
      roomKey,
      idDotThiPhong: idDotThiPhong ? parseInt(idDotThiPhong, 10) : null,
      idPhongThi: idPhongThi ? parseInt(idPhongThi, 10) : null,
      examDate,
      examTime: String(examTime || '').trim(),
      courseCode: String(courseCode || '').trim(),
      courseName: String(courseName || '').trim(),
      room: String(room || '').trim(),
      proctor1: String(proctor1 || '').trim(),
      proctor2: String(proctor2 || '').trim(),
      status: finalStatus,
      lateMinutes: finalStatus === 'proctor_late' ? Math.max(0, parseInt(lateMinutes, 10) || 0) : 0,
      substituteProctor: finalStatus === 'proctor_changed' ? String(substituteProctor || '').trim() : '',
      hasPermission: hasPermission !== undefined ? Boolean(hasPermission) : true,
      actualStudentCount: actualStudentCount != null && actualStudentCount !== '' ? parseInt(actualStudentCount, 10) : null,
      note: String(note || '').trim(),
      inspectorId: req.user.id,
      inspectorName: req.user.fullName || req.user.username || 'Thanh tra viên'
    };

    let record;
    if (existing) {
      await existing.update(payload);
      record = existing;
    } else {
      record = await ExamRoomInspection.create(payload);
    }

    res.json({
      success: true,
      message: 'Đã lưu trạng thái kiểm tra phòng thi!',
      data: record
    });
  } catch (error) {
    console.error('[API POST /inspector/exams/room-status] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể lưu trạng thái kiểm tra phòng thi!'
    });
  }
});

/**
 * GET /api/inspector/exams/candidates
 * Lấy danh sách thí sinh của 1 phòng thi kèm thông tin biên bản vi phạm (nếu có)
 * @access Private (inspector, admin)
 */
router.get('/exams/candidates', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const idDotThiPhong = req.query.idDotThiPhong ? parseInt(req.query.idDotThiPhong, 10) : null;
    const idPhongThi = req.query.idPhongThi ? parseInt(req.query.idPhongThi, 10) : null;
    const rawQueryDate = req.query.examDate || req.query.date;
    const examDate = rawQueryDate && /^\d{4}-\d{2}-\d{2}$/.test(rawQueryDate) ? rawQueryDate : null;
    const roomKey = req.query.roomKey ? String(req.query.roomKey).trim() : null;

    if (!idDotThiPhong && !idPhongThi && !roomKey) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu tham số định danh phòng thi (idDotThiPhong, idPhongThi hoặc roomKey)!'
      });
    }

    let candidates = [];
    if (idDotThiPhong || idPhongThi) {
      try {
        const pool = await namvietConnector.getPool();
        candidates = await tuafQueries.getExamRoomCandidates(pool, idDotThiPhong, idPhongThi);
      } catch (sqlErr) {
        console.warn('⚠️ [Inspector Candidates] Lỗi truy vấn SQL Server:', sqlErr.message);
      }
    }

    // Truy vấn danh sách vi phạm của phòng thi này từ PostgreSQL
    const violationWhere = {};
    if (examDate) violationWhere.examDate = examDate;

    const orConditions = [];
    if (idDotThiPhong) orConditions.push({ idDotThiPhong });
    if (idPhongThi) orConditions.push({ idPhongThi });
    if (roomKey) orConditions.push({ roomKey });
    if (orConditions.length > 0) {
      violationWhere[Op.or] = orConditions;
    }

    const violations = await ExamViolation.findAll({
      where: violationWhere,
      order: [['createdAt', 'DESC']]
    });

    const violationMap = new Map();
    for (const v of violations) {
      const rawPlain = v.toJSON ? v.toJSON() : v;
      const actionsArr = Array.isArray(rawPlain.violationActions) ? rawPlain.violationActions : [];
      const plain = {
        ...rawPlain,
        violationType: rawPlain.violationLevel,
        violationAction: actionsArr.join('; ')
      };
      const codeKey = String(plain.studentCode || '').toUpperCase().trim();
      if (codeKey && !violationMap.has(codeKey)) {
        violationMap.set(codeKey, plain);
      }
    }

    const seenCodes = new Set();
    const enrichedCandidates = candidates.map((c, idx) => {
      const codeKey = String(c.studentCode || '').toUpperCase().trim();
      if (codeKey) seenCodes.add(codeKey);
      const violation = violationMap.get(codeKey) || null;
      const sbd = c.sbd || String(idx + 1).padStart(2, '0');
      const studentName = c.studentName || '';
      const studentClass = c.studentClass || '';
      const dob = c.dob || null;
      return {
        sbd,
        examNumber: sbd,
        studentCode: c.studentCode,
        studentName,
        fullName: studentName,
        studentClass,
        className: studentClass,
        dob,
        birthDate: dob,
        isEligible: true,
        note: c.note || null,
        violation
      };
    });

    // Bổ sung các thí sinh đã lập biên bản vi phạm nhưng danh sách phòng thi từ SQL Server chưa trả về
    for (const [codeKey, vPlain] of violationMap.entries()) {
      if (!seenCodes.has(codeKey)) {
        const sbd = vPlain.seatNumber || '--';
        enrichedCandidates.push({
          sbd,
          examNumber: sbd,
          studentCode: vPlain.studentCode,
          studentName: vPlain.studentName,
          fullName: vPlain.studentName,
          studentClass: vPlain.studentClass || '',
          className: vPlain.studentClass || '',
          dob: null,
          birthDate: null,
          isEligible: true,
          note: null,
          violation: vPlain
        });
      }
    }

    res.json({
      success: true,
      idDotThiPhong,
      idPhongThi,
      totalStudents: enrichedCandidates.length,
      violationCount: violations.length,
      data: enrichedCandidates,
      candidates: enrichedCandidates
    });
  } catch (error) {
    console.error('[API GET /inspector/exams/candidates] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách thí sinh phòng thi!'
    });
  }
});

/**
 * POST /api/inspector/exams/violation
 * Lập mới hoặc cập nhật biên bản vi phạm quy chế thi của thí sinh
 * @access Private (inspector, admin)
 */
router.post('/exams/violation', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const {
      id,
      idDotThiPhong,
      idPhongThi,
      roomKey: rawRoomKey,
      examDate: rawExamDate,
      date: rawDate,
      examTime,
      courseCode,
      courseName,
      room,
      studentCode,
      studentName,
      studentClass,
      seatNumber: rawSeatNumber,
      examNumber,
      violationLevel: rawViolationLevel,
      violationType,
      violationActions,
      violationAction,
      evidence,
      penalty,
      proctorNotified,
      note
    } = req.body;

    const examDate = rawExamDate || rawDate;
    const seatNumber = rawSeatNumber || examNumber || '';
    const violationLevel = rawViolationLevel || violationType;

    if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(examDate))) {
      return res.status(400).json({
        success: false,
        message: 'Ngày thi (examDate) không hợp lệ! Sử dụng YYYY-MM-DD.'
      });
    }

    const cleanStudentCode = String(studentCode || '').trim();
    const cleanStudentName = String(studentName || '').trim();
    if (!cleanStudentCode || !cleanStudentName) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu mã sinh viên hoặc họ tên thí sinh!'
      });
    }

    const finalLevel = VALID_VIOLATION_LEVELS.includes(violationLevel) ? violationLevel : 'reprimand';
    const actionsList = Array.isArray(violationActions)
      ? violationActions.map(a => String(a || '').trim()).filter(Boolean)
      : violationAction
      ? String(violationAction).split(';').map(a => a.trim()).filter(Boolean)
      : [];

    const roomKey = buildExamRoomKey({
      roomKey: rawRoomKey,
      idDotThiPhong,
      idPhongThi,
      courseCode,
      courseName,
      room,
      startTime: examTime
    }, examDate);

    const payload = {
      idDotThiPhong: idDotThiPhong ? parseInt(idDotThiPhong, 10) : null,
      idPhongThi: idPhongThi ? parseInt(idPhongThi, 10) : null,
      roomKey,
      examDate,
      examTime: String(examTime || '').trim(),
      courseCode: String(courseCode || '').trim(),
      courseName: String(courseName || '').trim(),
      room: String(room || '').trim(),
      studentCode: cleanStudentCode,
      studentName: cleanStudentName,
      studentClass: String(studentClass || '').trim(),
      seatNumber: String(seatNumber || '').trim(),
      violationLevel: finalLevel,
      violationActions: actionsList,
      evidence: String(evidence || '').trim(),
      penalty: String(penalty || DEFAULT_PENALTY_BY_LEVEL[finalLevel] || '').trim(),
      proctorNotified: proctorNotified !== undefined ? Boolean(proctorNotified) : true,
      note: String(note || '').trim(),
      inspectorId: req.user.id,
      inspectorName: req.user.fullName || req.user.username || 'Thanh tra viên'
    };

    let existing = null;
    if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) {
      existing = await ExamViolation.findByPk(id);
    }

    if (!existing) {
      const lookupWhere = {
        examDate,
        studentCode: cleanStudentCode
      };
      if (payload.idDotThiPhong) {
        lookupWhere.idDotThiPhong = payload.idDotThiPhong;
      } else if (roomKey) {
        lookupWhere.roomKey = roomKey;
      }
      existing = await ExamViolation.findOne({ where: lookupWhere });
    }

    let record;
    if (existing) {
      await existing.update(payload);
      record = existing;
    } else {
      record = await ExamViolation.create(payload);
    }

    res.json({
      success: true,
      message: 'Đã lưu biên bản vi phạm quy chế thi!',
      data: record
    });
  } catch (error) {
    console.error('[API POST /inspector/exams/violation] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể lưu biên bản vi phạm thi!'
    });
  }
});

/**
 * DELETE /api/inspector/exams/violation/:id
 * Xóa biên bản vi phạm thi (nếu lập nhầm)
 * @access Private (inspector, admin)
 */
router.delete('/exams/violation/:id', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({
        success: false,
        message: 'Mã biên bản vi phạm không hợp lệ!'
      });
    }

    const record = await ExamViolation.findByPk(id);
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy biên bản vi phạm cần xóa!'
      });
    }

    await record.destroy();

    res.json({
      success: true,
      message: 'Đã xóa biên bản vi phạm thi!'
    });
  } catch (error) {
    console.error('[API DELETE /inspector/exams/violation/:id] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Không thể xóa biên bản vi phạm thi!'
    });
  }
});

/**
 * GET /api/inspector/attendance/report
 * Bao cao diem danh theo khoang ngay
 * @access Private (inspector, admin)
 */
router.get('/attendance/report', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const { from, to, groupBy, lecturerId, status } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Thieu tham so from hoac to!'
      });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      return res.status(400).json({
        success: false,
        message: 'Dinh dang ngay khong hop le! Su dung YYYY-MM-DD.'
      });
    }

    const VALID_STATUSES = ['pending', 'on_time', 'late', 'early_leave', 'absent', 'exempt'];

    const where = {
      date: { [Op.between]: [from, to] }
    };

    if (lecturerId) where.lecturerId = lecturerId;
    if (status && VALID_STATUSES.includes(status)) where.status = status;

    const records = await Attendance.findAll({ where });

    const summary = calculateSummary(records);

    let grouped = [];
    if (groupBy === 'lecturer') {
      const lecturerIds = [...new Set(records.map(r => r.lecturerId))];
      const nameMap = {};
      if (lecturerIds.length > 0) {
        const users = await User.findAll({
          where: { id: { [Op.in]: lecturerIds } }
        });
        for (const u of users) {
          nameMap[u.id] = u.fullName || u.username;
        }
      }
      grouped = groupByLecturer(records, nameMap);
    }

    res.json({
      success: true,
      from,
      to,
      summary,
      grouped
    });
  } catch (error) {
    console.error('[API /inspector/attendance/report] Loi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Khong the tai bao cao diem danh!'
    });
  }
});

/**
 * GET /api/inspector/dashboard/today
 * Tong quan diem danh & lich thi hom nay
 * @access Private (inspector, admin)
 */
router.get('/dashboard/today', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const vnTime = new Date(Date.now() + 7 * 3600 * 1000);
    const year = vnTime.getUTCFullYear();
    const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(vnTime.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const jsDay = vnTime.getUTCDay();
    const dayOfWeek = jsDay === 0 ? 8 : jsDay + 1;
    const thuSql = jsDay === 0 ? 6 : jsDay - 1;

    const [schedules, examStats] = await Promise.all([
      fetchInspectorSchedulesByDate(dateStr, dayOfWeek, thuSql),
      buildExamInspectionSummary(dateStr, dateStr)
    ]);

    const scheduleIds = schedules.map(s => s.id);
    const attendance = await Attendance.findAll({
      where: {
        date: dateStr,
        scheduleId: { [Op.in]: scheduleIds }
      }
    });

    const attendanceMap = {};
    for (const a of attendance) {
      attendanceMap[a.scheduleId] = a;
    }

    const details = sortInspectorClasses(schedules.map(schedule => {
      const att = attendanceMap[schedule.id];
      const periodTimes = parsePeriodToTime(schedule.periodText);
      const { startPeriod, endPeriod } = parsePeriodNumbers(schedule.periodText);

      return {
        scheduleId: schedule.id,
        courseName: schedule.courseName,
        classCode: schedule.classCode,
        teacherName: schedule.teacherName,
        room: schedule.room,
        periodText: schedule.periodText,
        startPeriod,
        endPeriod,
        scheduledStart: periodTimes?.scheduledStart || '07:00',
        scheduledEnd: periodTimes?.scheduledEnd || '17:55',
        checkInTime: att?.checkInTime ? new Date(att.checkInTime).toTimeString().slice(0, 5) : null,
        checkOutTime: att?.checkOutTime ? new Date(att.checkOutTime).toTimeString().slice(0, 5) : null,
        status: att?.status || 'pending',
        lateMinutes: att?.lateMinutes || 0,
        earlyMinutes: att?.earlyMinutes || 0,
        hasPermission: att?.hasPermission,
        rescheduledDate: att?.rescheduledDate,
        rescheduledReason: att?.rescheduledReason,
        substituteTeacher: att?.substituteTeacher,
        note: att?.note
      };
    }));

    const totalClasses = schedules.length;
    const onTime = details.filter(d => d.status === 'on_time').length;
    const late = details.filter(d => d.status === 'late').length;
    const earlyLeave = details.filter(d => d.status === 'early_leave').length;
    const absent = details.filter(d => d.status === 'absent').length;
    const pending = details.filter(d => d.status === 'pending').length;

    res.json({
      success: true,
      date: dateStr,
      summary: {
        totalClasses,
        onTime,
        late,
        earlyLeave,
        absent,
        pending,
        rescheduledPermitted: details.filter(d => d.status === 'rescheduled' && d.hasPermission === true).length,
        rescheduledUnpermitted: details.filter(d => d.status === 'rescheduled' && d.hasPermission !== true).length,
        substitute: details.filter(d => d.status === 'substitute').length,
        checkedIn: onTime + late + earlyLeave
      },
      details,
      examSummary: examStats.examSummary,
      examViolations: examStats.examViolations,
      examRoomIssues: examStats.examRoomIssues
    });
  } catch (error) {
    console.error('[API /inspector/dashboard/today] Loi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Khong the tai dashboard hom nay!'
    });
  }
});

/**
 * GET /api/inspector/dashboard/report
 * Bao cao chi tiet theo khoang thoi gian (tích hợp cả Giảng dạy & Thi cử)
 * @access Private (inspector, admin)
 */
router.get('/dashboard/report', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const { from, to, period } = req.query;

    const vnTime = new Date(Date.now() + 7 * 3600 * 1000);
    const year = vnTime.getUTCFullYear();
    const month = vnTime.getUTCMonth();
    const day = vnTime.getUTCDate();
    const today = new Date(year, month, day);
    const fmtYmd = (dt) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

    let startDate;
    let endDate;

    if (period === 'week') {
      const startOfWeek = new Date(today);
      const diffToMonday = today.getDay() === 0 ? -6 : 1 - today.getDay();
      startOfWeek.setDate(today.getDate() + diffToMonday);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      startDate = fmtYmd(startOfWeek);
      endDate = fmtYmd(endOfWeek);
    } else if (period === 'month') {
      startDate = fmtYmd(new Date(today.getFullYear(), today.getMonth(), 1));
      endDate = fmtYmd(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    } else if (period === 'semester') {
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      if (currentMonth < 6) {
        startDate = `${currentYear - 1}-09-01`;
        endDate = `${currentYear}-01-31`;
      } else {
        startDate = `${currentYear}-02-01`;
        endDate = `${currentYear}-06-30`;
      }
    } else {
      startDate = from;
      endDate = to;
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Thieu tham so ngay (from/to hoac period)!'
      });
    }

    const [records, examStats] = await Promise.all([
      Attendance.findAll({
        where: {
          date: { [Op.between]: [startDate, endDate] }
        }
      }),
      buildExamInspectionSummary(startDate, endDate)
    ]);

    const summary = calculateSummary(records, { includeAverages: true });

    const lecturerIds = [...new Set(records.map(r => r.lecturerId))];
    const nameMap = {};
    if (lecturerIds.length > 0) {
      const users = await User.findAll({
        where: { id: { [Op.in]: lecturerIds } }
      });
      for (const u of users) {
        nameMap[u.id] = u.fullName || u.username;
      }
    }
    const byLecturerSorted = groupByLecturer(records, nameMap);

    res.json({
      success: true,
      from: startDate,
      to: endDate,
      summary,
      byLecturer: byLecturerSorted,
      examSummary: examStats.examSummary,
      examViolations: examStats.examViolations,
      examRoomIssues: examStats.examRoomIssues
    });
  } catch (error) {
    console.error('[API /inspector/dashboard/report] Loi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Khong the tai bao cao!'
    });
  }
});

/**
 * POST /api/inspector/reports/send-email
 * Kích hoạt gửi email báo cáo thanh tra theo yêu cầu
 * @access Private (inspector, admin)
 */
router.post('/reports/send-email', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const { from, to, periodType, customRecipients, force } = req.body;
    const result = await sendInspectorReportEmail({ from, to, periodType, customRecipients, force });

    if (result.success) {
      res.json({
        success: true,
        message: 'Gửi email báo cáo thành công!',
        ...result
      });
    } else if (result.skipped) {
      res.json({
        success: false,
        skipped: true,
        message: result.message,
        ...result
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message || 'Không thể gửi email báo cáo!',
        ...result
      });
    }
  } catch (error) {
    console.error('[API /inspector/reports/send-email] Lỗi:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi gửi email báo cáo!',
      error: error.message
    });
  }
});

router.sortInspectorClasses = sortInspectorClasses;
router.sortInspectorExamRooms = sortInspectorExamRooms;
router.buildExamRoomKey = buildExamRoomKey;
router.buildExamInspectionSummary = buildExamInspectionSummary;

module.exports = router;
