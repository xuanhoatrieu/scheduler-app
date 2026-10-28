/**
 * Bang map tietsang gio quy dinh
 * Period 1-15 theo quy dinh cua truong DHNN & PTNT (TUAF)
 */

const PERIOD_START = {
  1: '07:00', 2: '07:55', 3: '08:55', 4: '09:55', 5: '10:50',
  6: '13:15', 7: '14:10', 8: '15:10', 9: '16:10', 10: '17:05',
  11: '18:25', 12: '19:20', 13: '20:20', 14: '21:00', 15: '21:40', 16: '22:20'
};

const PERIOD_END = {
  1: '07:50', 2: '08:45', 3: '09:45', 4: '10:45', 5: '11:40',
  6: '14:05', 7: '15:00', 8: '16:00', 9: '17:00', 10: '17:55',
  11: '19:15', 12: '20:10', 13: '20:50', 14: '21:30', 15: '22:10', 16: '22:50'
};

const EXAM_PERIOD_MAP = {
  0: '07:00', 1: '07:30', 2: '08:00', 3: '08:30', 4: '09:00',
  5: '09:30', 6: '10:00', 7: '10:30', 8: '11:00', 9: '11:30',
  10: '13:00', 11: '13:30', 12: '14:00', 13: '14:30', 14: '15:00',
  15: '15:30', 16: '16:00', 17: '16:30', 18: '17:00', 19: '17:30',
  20: '18:00', 21: '18:30', 22: '19:00',
  25: '07:00', 26: '09:30', 27: '13:30',
  31: '07:30', 34: '09:05', 37: '10:40',
  40: '13:00', 41: '13:30', 43: '14:35', 44: '15:05',
  46: '16:10', 47: '16:40', 49: '17:40',
  59: '08:30', 60: '09:00', 61: '09:30', 62: '10:00',
  63: '10:30', 64: '11:00', 65: '11:30', 66: '12:00',
  68: '13:00', 69: '13:30', 70: '14:00', 71: '14:30',
  72: '15:00', 73: '15:30', 74: '16:00', 75: '16:30'
};

/**
 * Tách số tiết bắt đầu và kết thúc từ chuỗi periodText (VD: "1-4", "Tiết 6 - 9")
 * @param {string} periodText
 * @returns {{ startPeriod: number, endPeriod: number }}
 */
const parsePeriodNumbers = (periodText) => {
  if (!periodText) return { startPeriod: 1, endPeriod: 1 };
  const clean = String(periodText).replace(/[^\d-]/g, '');
  const parts = clean.split('-').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  if (parts.length === 0) return { startPeriod: 1, endPeriod: 1 };
  const startPeriod = parts[0];
  const endPeriod = parts.length > 1 ? Math.max(parts[0], parts[1]) : parts[0];
  return { startPeriod, endPeriod };
};

/**
 * Chuyen periodText (VD: "1-4", "6-8", "Tiết 1-4") thanh { scheduledStart, scheduledEnd }
 * @param {string} periodText - Chuoi tiet hoc VD: "1-4", "6-8"
 * @returns {{ scheduledStart: string, scheduledEnd: string } | null}
 */
const parsePeriodToTime = (periodText) => {
  if (!periodText) return null;

  // Lọc chỉ giữ số và dấu gạch nối, ví dụ "Tiết 1 - 4" -> "1-4"
  const clean = String(periodText).replace(/[^\d-]/g, '');
  const parts = clean.split('-').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  if (parts.length === 0) return null;

  const startPeriod = parts[0];
  const endPeriod = parts.length > 1 ? parts[1] : parts[0];

  const scheduledStart = PERIOD_START[startPeriod];
  const scheduledEnd = PERIOD_END[endPeriod];

  if (!scheduledStart || !scheduledEnd) return null;

  return { scheduledStart, scheduledEnd };
};

/**
 * Phân loại linh hoạt lớp học phần vào Buổi học (Sáng/Chiều/Tối) và Đợt/Khung tiết (Period Block)
 * Đảm bảo bao phủ toàn bộ các lớp 2, 3, 4 hoặc 5 tiết (VD: 1-3, 1-4, 1-5, 3-5, 4-5, 6-8, 6-9, 6-10, 9-10...)
 */
const classifySchedulePeriodBlock = (periodText) => {
  const { startPeriod, endPeriod } = parsePeriodNumbers(periodText);
  const times = parsePeriodToTime(`${startPeriod}-${endPeriod}`) || {
    scheduledStart: PERIOD_START[startPeriod] || '07:00',
    scheduledEnd: PERIOD_END[endPeriod] || '17:55'
  };

  let shiftKey = 'morning';
  let shiftLabel = 'Buổi Sáng';
  if (startPeriod >= 11) {
    shiftKey = 'evening';
    shiftLabel = 'Buổi Tối';
  } else if (startPeriod >= 6) {
    shiftKey = 'afternoon';
    shiftLabel = 'Buổi Chiều';
  }

  // Gom nhóm linh hoạt theo đợt tiết bắt đầu trong buổi để thanh tra đi kiểm tra theo đợt giờ vào lớp:
  // - Đợt 1 Sáng: Bắt đầu từ Tiết 1 hoặc 2 (VD: Tiết 1-3, 1-4, 1-5, 2-5)
  // - Đợt 2 Sáng: Bắt đầu từ Tiết 3, 4, 5 (VD: Tiết 3-5, 4-5)
  // - Đợt 1 Chiều: Bắt đầu từ Tiết 6 hoặc 7 (VD: Tiết 6-8, 6-9, 6-10, 7-10)
  // - Đợt 2 Chiều: Bắt đầu từ Tiết 8, 9, 10 (VD: Tiết 8-10, 9-10)
  // - Đợt Tối: Bắt đầu từ Tiết 11 trở đi (VD: Tiết 11-13, 11-14)
  let blockKey;
  let blockTitle;
  let blockTimeRange;
  let blockOrder;

  if (startPeriod <= 2) {
    if (endPeriod <= 3) {
      blockKey = 'morning_1_3';
      blockTitle = 'Ca đầu Sáng • Tiết 1 - 3';
      blockTimeRange = '07:00 - 09:45';
      blockOrder = 10;
    } else {
      blockKey = `morning_${startPeriod}_${endPeriod}`;
      blockTitle = `Ca Sáng mở rộng • Tiết ${startPeriod} - ${endPeriod}`;
      blockTimeRange = `${times.scheduledStart} - ${times.scheduledEnd}`;
      blockOrder = 10 + endPeriod;
    }
  } else if (startPeriod <= 5) {
    if (startPeriod === 4 && endPeriod === 5) {
      blockKey = 'morning_4_5';
      blockTitle = 'Ca sau Sáng • Tiết 4 - 5';
      blockTimeRange = '09:55 - 11:40';
      blockOrder = 30;
    } else {
      blockKey = `morning_${startPeriod}_${endPeriod}`;
      blockTitle = `Ca sau Sáng • Tiết ${startPeriod} - ${endPeriod}`;
      blockTimeRange = `${times.scheduledStart} - ${times.scheduledEnd}`;
      blockOrder = 20 + startPeriod;
    }
  } else if (startPeriod <= 7) {
    if (startPeriod === 6 && endPeriod === 8) {
      blockKey = 'afternoon_6_8';
      blockTitle = 'Ca đầu Chiều • Tiết 6 - 8';
      blockTimeRange = '13:15 - 16:00';
      blockOrder = 50;
    } else {
      blockKey = `afternoon_${startPeriod}_${endPeriod}`;
      blockTitle = `Ca Chiều mở rộng • Tiết ${startPeriod} - ${endPeriod}`;
      blockTimeRange = `${times.scheduledStart} - ${times.scheduledEnd}`;
      blockOrder = 50 + endPeriod;
    }
  } else if (startPeriod <= 10) {
    if (startPeriod === 9 && endPeriod === 10) {
      blockKey = 'afternoon_9_10';
      blockTitle = 'Ca sau Chiều • Tiết 9 - 10';
      blockTimeRange = '16:10 - 17:55';
      blockOrder = 80;
    } else {
      blockKey = `afternoon_${startPeriod}_${endPeriod}`;
      blockTitle = `Ca sau Chiều • Tiết ${startPeriod} - ${endPeriod}`;
      blockTimeRange = `${times.scheduledStart} - ${times.scheduledEnd}`;
      blockOrder = 70 + startPeriod;
    }
  } else {
    blockKey = `evening_${startPeriod}_${endPeriod}`;
    blockTitle = `Ca Tối • Tiết ${startPeriod} - ${endPeriod}`;
    blockTimeRange = `${times.scheduledStart} - ${times.scheduledEnd}`;
    blockOrder = 100 + startPeriod;
  }

  return {
    startPeriod,
    endPeriod,
    scheduledStart: times.scheduledStart,
    scheduledEnd: times.scheduledEnd,
    shiftKey,
    shiftLabel,
    blockKey,
    blockTitle,
    blockTimeRange,
    blockOrder
  };
};

/**
 * Tinh so phut muon so voi gio quy dinh
 * @param {Date|string} actualTime - Gio den thuc te
 * @param {string} scheduledTime - Gio quy dinh (VD: "07:00")
 * @returns {number} So phut muon (0 = dung gio, >0 = muon, <0 = som hon)
 */
const calculateLateMinutes = (actualTime, scheduledTime) => {
  if (!actualTime || !scheduledTime) return 0;

  const actual = new Date(actualTime);
  const [hours, minutes] = scheduledTime.split(':').map(Number);

  const scheduled = new Date(actual);
  scheduled.setHours(hours, minutes, 0, 0);

  const diffMs = actual - scheduled;
  return Math.round(diffMs / 60000);
};

/**
 * Tinh so phut ve som so voi gio ket thuc quy dinh
 * @param {Date|string} actualTime - Gio ve thuc te
 * @param {string} scheduledTime - Gio ket thuc quy dinh (VD: "10:45")
 * @returns {number} So phut ve som (0 = dung gio, <0 = muon hon, >0 = som hon)
 */
const calculateEarlyMinutes = (actualTime, scheduledTime) => {
  if (!actualTime || !scheduledTime) return 0;

  const actual = new Date(actualTime);
  const [hours, minutes] = scheduledTime.split(':').map(Number);

  const scheduled = new Date(actual);
  scheduled.setHours(hours, minutes, 0, 0);

  const diffMs = scheduled - actual;
  return Math.round(diffMs / 60000);
};

/**
 * Xac dinh trang thai diem danh dua tren gio den/ve va gio quy dinh
 * @param {Date|null} checkInTime
 * @param {Date|null} checkOutTime
 * @param {string} scheduledStart
 * @param {string} scheduledEnd
 * @returns {{ status: string, lateMinutes: number, earlyMinutes: number }}
 */
const calculateAttendanceStatus = (checkInTime, checkOutTime, scheduledStart, scheduledEnd) => {
  if (!checkInTime) {
    return { status: 'pending', lateMinutes: 0, earlyMinutes: 0 };
  }

  const lateMins = Math.max(0, calculateLateMinutes(checkInTime, scheduledStart));
  let earlyMins = 0;

  if (checkOutTime) {
    earlyMins = Math.max(0, calculateEarlyMinutes(checkOutTime, scheduledEnd));
  }

  let status = 'on_time';
  if (lateMins > 0 && earlyMins > 0) {
    status = 'late'; // Both late and early → prioritize 'late'
  } else if (lateMins > 0) {
    status = 'late';
  } else if (earlyMins > 0) {
    status = 'early_leave';
  }

  return { status, lateMinutes: lateMins, earlyMinutes: earlyMins };
};

/**
 * Quy đổi giờ bắt đầu thi từ Gio_thi hoặc Tu_tiet
 */
const getExamStartTime = (gioThi, tuTiet) => {
  if (gioThi) {
    const m = String(gioThi).match(/(\d{1,2})\s*giờ\s*(\d{0,2})/i);
    if (m) {
      const h = String(m[1]).padStart(2, '0');
      const min = String(m[2] || '00').padStart(2, '0');
      return `${h}:${min}`;
    }
    const timeMatch = String(gioThi).match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      return `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}`;
    }
  }
  const t = tuTiet != null && !isNaN(parseInt(tuTiet, 10)) ? parseInt(tuTiet, 10) : null;
  if (t !== null && EXAM_PERIOD_MAP[t]) {
    return EXAM_PERIOD_MAP[t];
  }
  if (t !== null && PERIOD_START[t]) {
    return PERIOD_START[t];
  }
  return '07:30';
};

/**
 * Tính giờ kết thúc thi dựa trên giờ bắt đầu và số phút làm bài
 */
const calculateExamEndTime = (startTime, durationMinutes = 60) => {
  if (!startTime || typeof startTime !== 'string') return '';
  const parts = startTime.split(':');
  if (parts.length !== 2) return '';
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return '';
  const totalMinutes = h * 60 + m + (parseInt(durationMinutes, 10) || 60);
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
};

/**
 * Lấy thời lượng làm bài (phút)
 */
const getExamDurationMinutes = (soPhutThi, examFormatName) => {
  if (soPhutThi && !isNaN(parseInt(soPhutThi, 10)) && parseInt(soPhutThi, 10) > 0) {
    return parseInt(soPhutThi, 10);
  }
  if (examFormatName) {
    const match = String(examFormatName).match(/(\d+)\s*p/i);
    if (match) return parseInt(match[1], 10);
  }
  return 60;
};

/**
 * Định dạng hình thức thi
 */
const formatExamFormat = (format, tenHinhThuc = '') => {
  if (tenHinhThuc && String(tenHinhThuc).trim()) {
    return String(tenHinhThuc).trim();
  }
  const map = {
    1: 'Thi viết 60p',
    2: 'Thi viết 90p',
    3: 'Trắc nghiệm máy',
    4: 'Trắc nghiệm viết',
    5: 'Bài tiểu luận',
    6: 'Vấn đáp',
    7: 'Bài tập lớn',
    8: 'Vấn đáp máy',
    9: 'Video clip',
    10: 'Báo cáo',
    11: 'Thuyết trình',
    12: 'Thực hành máy',
    13: 'Trắc nghiệm + Viết',
    14: 'Lý thuyết + Thực hành',
    15: 'Thi viết 120p'
  };
  return map[format] || map[String(format)] || String(format || 'Thi viết');
};

/**
 * Định dạng chuỗi hiển thị giờ thi (VD: "07:30 - 09:00 (90p)")
 */
const formatExamTime = (startTime, durationMinutes = 60, caThi = null) => {
  if (startTime) {
    const endTime = calculateExamEndTime(startTime, durationMinutes);
    return endTime ? `${startTime} - ${endTime} (${durationMinutes}p)` : startTime;
  }
  if (caThi) return `Ca ${caThi}`;
  return 'Chưa xếp giờ';
};

/**
 * Phân loại Ca thi linh hoạt (Ca 1, Ca 2, Ca 3, Ca 4, Ca Tối) dựa trên giờ bắt đầu
 */
const classifyExamShift = (startTime, caThi = null) => {
  if (!startTime || typeof startTime !== 'string' || !startTime.includes(':')) {
    return {
      shiftKey: 'ca1',
      shiftLabel: caThi ? `Ca ${caThi}` : 'Ca 1 (Sáng)',
      sessionKey: 'morning',
      sessionLabel: 'Buổi Sáng'
    };
  }
  const [h, m] = startTime.split(':').map(Number);
  const mins = (h || 0) * 60 + (m || 0);

  if (mins < 8 * 60 + 45) {
    // 07:00 - 08:40 -> Ca 1
    return {
      shiftKey: 'ca1',
      shiftLabel: `Ca 1 (${startTime})`,
      sessionKey: 'morning',
      sessionLabel: 'Buổi Sáng'
    };
  }
  if (mins < 12 * 60) {
    // 08:45 - 11:59 -> Ca 2
    return {
      shiftKey: 'ca2',
      shiftLabel: `Ca 2 (${startTime})`,
      sessionKey: 'morning',
      sessionLabel: 'Buổi Sáng'
    };
  }
  if (mins < 15 * 60) {
    // 12:00 - 14:59 -> Ca 3
    return {
      shiftKey: 'ca3',
      shiftLabel: `Ca 3 (${startTime})`,
      sessionKey: 'afternoon',
      sessionLabel: 'Buổi Chiều'
    };
  }
  if (mins < 17 * 60 + 30) {
    // 15:00 - 17:29 -> Ca 4
    return {
      shiftKey: 'ca4',
      shiftLabel: `Ca 4 (${startTime})`,
      sessionKey: 'afternoon',
      sessionLabel: 'Buổi Chiều'
    };
  }
  return {
    shiftKey: 'evening',
    shiftLabel: `Ca Tối (${startTime})`,
    sessionKey: 'evening',
    sessionLabel: 'Buổi Tối'
  };
};

module.exports = {
  PERIOD_START,
  PERIOD_END,
  EXAM_PERIOD_MAP,
  parsePeriodNumbers,
  parsePeriodToTime,
  classifySchedulePeriodBlock,
  calculateLateMinutes,
  calculateEarlyMinutes,
  calculateAttendanceStatus,
  getExamStartTime,
  calculateExamEndTime,
  getExamDurationMinutes,
  formatExamFormat,
  formatExamTime,
  classifyExamShift
};
