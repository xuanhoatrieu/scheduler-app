/**
 * Bộ đọc ngày / tiết học DÙNG CHUNG cho toàn app (màn Lịch, tab Thông báo, lịch nhắc).
 * File này là JS thuần (không import React Native) để có thể unit test bằng Node.
 */

/** Giờ bắt đầu từng tiết tại TUAF (tiết 1 → 15) */
export const PERIOD_START = {
  1: '07:00', 2: '07:55', 3: '08:50', 4: '09:55', 5: '10:50',
  6: '13:15', 7: '14:10', 8: '15:15', 9: '16:10', 10: '17:05',
  11: '18:00', 12: '18:50', 13: '19:40', 14: '20:30', 15: '21:15',
};
const PERIOD_MINUTES = 50;

/**
 * Phân tích chuỗi giai đoạn học (studyTime) → { start: Date, end: Date } | null
 * Hỗ trợ: "dd/MM - dd/MM", "dd/MM/yyyy - dd/MM/yyyy", "dd/MM -> dd/MM", "yyyy-MM-dd", "dd/MM/yyyy".
 * Ngày thiếu năm được suy theo năm học: tháng >= 8 thuộc năm đầu, tháng < 8 thuộc năm sau.
 */
export const parseStudyTime = (studyTime, schoolYear) => {
  if (!studyTime || typeof studyTime !== 'string') return null;
  const trimmed = studyTime.trim();
  if (!trimmed) return null;

  let baseYear = 2026;
  if (schoolYear) {
    const rawY = String(schoolYear).replace('_', '-');
    baseYear = parseInt(rawY.split('-')[0]) || new Date().getFullYear();
  } else {
    baseYear = new Date().getFullYear();
  }

  const parseSingleDate = (str, isEnd = false, startParsed = null) => {
    if (!str) return null;
    const s = str.trim();

    // 1. ISO format: YYYY-MM-DD
    const mIso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (mIso) {
      return new Date(parseInt(mIso[1]), parseInt(mIso[2]) - 1, parseInt(mIso[3]));
    }

    // 2. dd/MM/yyyy
    const mFull = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mFull) {
      return new Date(parseInt(mFull[3]), parseInt(mFull[2]) - 1, parseInt(mFull[1]));
    }

    // 3. dd/MM (tự suy ra năm học dựa vào học kỳ TUAF: tháng >= 8 thuộc baseYear, tháng < 8 thuộc baseYear + 1)
    const mShort = s.match(/(\d{1,2})\/(\d{1,2})/);
    if (mShort) {
      const day = parseInt(mShort[1]);
      const month = parseInt(mShort[2]);
      let year = baseYear;
      if (!isEnd) {
        year = month >= 8 ? baseYear : baseYear + 1;
      } else {
        if (startParsed) {
          const startMonth = startParsed.getMonth() + 1;
          const startYear = startParsed.getFullYear();
          year = month < startMonth ? startYear + 1 : startYear;
        } else {
          year = month >= 8 ? baseYear : baseYear + 1;
        }
      }
      return new Date(year, month - 1, day);
    }

    return null;
  };

  let rawParts = [];
  if (trimmed.includes('->')) {
    rawParts = trimmed.split('->');
  } else if (trimmed.includes('đến')) {
    rawParts = trimmed.split('đến');
  } else if (trimmed.includes(' to ')) {
    rawParts = trimmed.split(' to ');
  } else if (trimmed.includes(' - ')) {
    rawParts = trimmed.split(' - ');
  } else if (/^\d{1,2}\/\d{1,2}\s*-\s*\d{1,2}\/\d{1,2}/.test(trimmed)) {
    rawParts = trimmed.split('-');
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}/.test(trimmed)) {
    rawParts = trimmed.split('-');
  }

  if (rawParts.length >= 2) {
    const start = parseSingleDate(rawParts[0], false, null);
    const end = parseSingleDate(rawParts[1], true, start);
    if (start && end) return { start, end };
  }

  const single = parseSingleDate(trimmed, false, null);
  if (single) {
    return { start: single, end: single };
  }

  return null;
};

/**
 * Phân tích tiết học "1-3", "Tiết 6-10" → { start: 1, end: 3 } | null
 * Chỉ chấp nhận tiết hợp lệ 1..15 (fail-closed: "10 tiết", "0-4", "" → null).
 */
export const parsePeriodRange = (periodText) => {
  if (periodText === null || periodText === undefined) return null;
  const m = String(periodText).match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  if (!PERIOD_START[start] || !PERIOD_START[end] || end < start) return null;
  return { start, end };
};

const hmToMinutes = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

const minutesToHm = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** Giờ bắt đầu / kết thúc của một khoảng tiết → { startTime: 'HH:mm', endTime: 'HH:mm' } */
export const getPeriodTimes = (range) => {
  if (!range) return null;
  const startTime = PERIOD_START[range.start];
  const endTime = minutesToHm(hmToMinutes(PERIOD_START[range.end]) + PERIOD_MINUTES);
  return { startTime, endTime };
};

/** Thứ theo chuẩn TUAF (2 = Thứ Hai ... 8 = Chủ Nhật) */
export const getTuafDayOfWeek = (date = new Date()) => {
  const jsDay = date.getDay();
  return jsDay === 0 ? 8 : jsDay + 1;
};

/** Ngày bắt đầu (00:00) của một Date */
export const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Ghép ngày + 'HH:mm' → Date */
export const atTime = (date, hm) => {
  const [h, m] = hm.split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0);
};

/** Đọc ngày thi "dd/MM/yyyy" hoặc "yyyy-MM-dd" → Date | null (bắt buộc có năm) */
export const parseFullDate = (str) => {
  if (!str) return null;
  const s = String(str);
  const dmy = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
  const ymd = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
  return null;
};

/** Khóa ngày yyyy-MM-dd theo giờ máy */
export const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
