const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const User = require('../models/User');
const { parsePeriodToTime, calculateAttendanceStatus } = require('../utils/periodMapping');
const { calculateSummary, groupByLecturer } = require('../utils/attendanceStats');
const { sendInspectorReportEmail } = require('../services/emailReportService');

/**
 * GET /api/inspector/attendance/today hoặc /api/inspector/attendance/classes?date=YYYY-MM-DD
 * Lay danh sach cac lop hoc theo ngay + trang thai diem danh
 * @access Private (inspector, admin)
 */
const getClassesHandler = async (req, res) => {
  try {
    const VN_TZ = 'Asia/Ho_Chi_Minh';
    let targetDate;
    if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      targetDate = new Date(req.query.date + 'T00:00:00+07:00');
    } else {
      const now = new Date();
      targetDate = new Date(now.toLocaleString('en-US', { timeZone: VN_TZ }));
    }
    const dayOfWeek = targetDate.getDay() + 1; // JS: 0=Sun -> 1-based
    const dateStr = targetDate.toISOString().split('T')[0];

    const schedules = await Schedule.findAll({
      where: {
        dayOfWeek,
        [Op.and]: [
          { studyTime: { [Op.like]: `%${dateStr.substring(0, 7)}%` } }
        ]
      },
      order: [['studyTime', 'ASC'], ['classCode', 'ASC']]
    });

    const attendance = await Attendance.findAll({
      where: { date: dateStr }
    });

    const attendanceMap = {};
    for (const a of attendance) {
      attendanceMap[a.scheduleId] = a;
    }

    const result = schedules.map(schedule => {
      const att = attendanceMap[schedule.id];
      const periodTimes = parsePeriodToTime(schedule.periodText);

      return {
        scheduleId: schedule.id,
        courseName: schedule.courseName,
        classCode: schedule.classCode,
        teacherName: schedule.teacherName,
        room: schedule.room,
        periodText: schedule.periodText,
        scheduledStart: periodTimes?.scheduledStart || '07:00',
        scheduledEnd: periodTimes?.scheduledEnd || '17:40',
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
    const scheduledEnd = periodTimes?.scheduledEnd || '17:40';

    let finalStatus = explicitStatus;
    let finalLate = explicitLate != null ? explicitLate : 0;
    let finalEarly = explicitEarly != null ? explicitEarly : 0;

    if (!finalStatus && (checkInTime || checkOutTime)) {
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
      existing.checkInTime = checkInTime !== undefined ? checkInTime : existing.checkInTime;
      existing.checkOutTime = checkOutTime !== undefined ? checkOutTime : existing.checkOutTime;
      existing.status = finalStatus;
      existing.lateMinutes = finalLate;
      existing.earlyMinutes = finalEarly;
      existing.hasPermission = hasPermission !== undefined ? hasPermission : existing.hasPermission;
      existing.rescheduledDate = rescheduledDate !== undefined ? rescheduledDate : existing.rescheduledDate;
      existing.rescheduledReason = rescheduledReason !== undefined ? rescheduledReason : existing.rescheduledReason;
      existing.substituteTeacher = substituteTeacher !== undefined ? substituteTeacher : existing.substituteTeacher;
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
        checkInTime: checkInTime || null,
        checkOutTime: checkOutTime || null,
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
      // Build name map for lecturers in result set
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
 * Tong quan diem danh hom nay
 * @access Private (inspector, admin)
 */
router.get('/dashboard/today', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const VN_TZ = 'Asia/Ho_Chi_Minh';
    const now = new Date();
    const today = new Date(now.toLocaleString('en-US', { timeZone: VN_TZ }));
    const dayOfWeek = today.getDay() + 1;
    const dateStr = today.toISOString().split('T')[0];

    const schedules = await Schedule.findAll({
      where: {
        dayOfWeek,
        [Op.and]: [
          { studyTime: { [Op.like]: `%${dateStr.substring(0, 7)}%` } }
        ]
      }
    });

    const attendance = await Attendance.findAll({
      where: { date: dateStr }
    });

    const attendanceMap = {};
    for (const a of attendance) {
      attendanceMap[a.scheduleId] = a;
    }

    const details = schedules.map(schedule => {
      const att = attendanceMap[schedule.id];
      const periodTimes = parsePeriodToTime(schedule.periodText);

      return {
        courseName: schedule.courseName,
        classCode: schedule.classCode,
        teacherName: schedule.teacherName,
        room: schedule.room,
        periodText: schedule.periodText,
        scheduledStart: periodTimes?.scheduledStart || '07:00',
        scheduledEnd: periodTimes?.scheduledEnd || '17:40',
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
    });

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
      details
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
 * Bao cao chi tiet theo khoang thoi gian
 * @access Private (inspector, admin)
 */
router.get('/dashboard/report', authMiddleware, requireRole('inspector', 'admin'), async (req, res) => {
  try {
    const { from, to, groupBy, period } = req.query;

    let startDate, endDate;
    const VN_TZ = 'Asia/Ho_Chi_Minh';
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: VN_TZ }));

    if (period === 'week') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      startDate = startOfWeek.toISOString().split('T')[0];
      endDate = endOfWeek.toISOString().split('T')[0];
    } else if (period === 'month') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
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

    const records = await Attendance.findAll({
      where: {
        date: { [Op.between]: [startDate, endDate] }
      }
    });

    const summary = calculateSummary(records, { includeAverages: true });

    // Build name map for lecturers in result set
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
      byLecturer: byLecturerSorted
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
    const { from, to, periodType, customRecipients } = req.body;
    const result = await sendInspectorReportEmail({ from, to, periodType, customRecipients });

    if (result.success) {
      res.json({
        success: true,
        message: 'Gửi email báo cáo thành công!',
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

module.exports = router;

