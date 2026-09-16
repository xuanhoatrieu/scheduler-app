/**
 * Bang map tietsang gio quy dinh
 * Period 1-10 theo quy dinh cua truong DHNN & CNV
 */

const PERIOD_START = {
  1: '07:00', 2: '07:55', 3: '08:50', 4: '09:55', 5: '10:50',
  6: '13:00', 7: '13:55', 8: '14:50', 9: '15:55', 10: '16:50',
  11: '18:00', 12: '18:50', 13: '19:40', 14: '20:30'
};

const PERIOD_END = {
  1: '07:50', 2: '08:45', 3: '09:40', 4: '10:45', 5: '11:40',
  6: '13:50', 7: '14:45', 8: '15:40', 9: '16:45', 10: '17:40',
  11: '18:45', 12: '19:35', 13: '20:25', 14: '21:15'
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

module.exports = {
  PERIOD_START,
  PERIOD_END,
  parsePeriodToTime,
  calculateLateMinutes,
  calculateEarlyMinutes,
  calculateAttendanceStatus
};
