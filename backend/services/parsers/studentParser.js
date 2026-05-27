const cheerio = require('cheerio');

const splitCellByBr = ($, td) => {
  const html = $(td).html() || '';
  // Replace <br> tags with a unique separator
  const cleanHtml = html.replace(/<br\s*\/?>/gi, '\n');
  const tempDom = cheerio.load(`<div>${cleanHtml}</div>`);
  return tempDom('div').text().split('\n').map(item => item.trim()).filter(item => item !== '');
};

/**
 * Phân tích cú pháp HTML thời khóa biểu của Sinh viên
 * @param {string} html - HTML cào được từ /TraCuuLichHoc/ThongTinLichHoc
 * @returns {Array} Danh sách lịch học chi tiết
 */
const parseSchedule = (html) => {
  const $ = cheerio.load(html);
  const scheduleList = [];

  $('table').each((tableIdx, table) => {
    $(table).find('tr').each((rowIdx, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 8) {
        const stt = $(cells[0]).text().trim();
        // Bỏ qua dòng tiêu đề nếu STT không phải là số
        if (isNaN(stt) || !stt) return;

        const courseName = $(cells[1]).text().trim().replace(/\s+/g, ' ');
        const credits = parseInt($(cells[2]).text().trim()) || 0;
        const classCode = $(cells[3]).text().trim().replace(/\s+/g, ' ');

        // Sử dụng thuật toán phân tách dòng cào đa ca
        const studyTimes = splitCellByBr($, cells[4]);
        const days = splitCellByBr($, cells[5]);
        const periods = splitCellByBr($, cells[6]);
        const rooms = splitCellByBr($, cells[7]);
        const teachers = cells.length >= 9 ? splitCellByBr($, cells[8]) : [];

        const maxLen = Math.max(studyTimes.length, days.length, periods.length, rooms.length);

        for (let k = 0; k < maxLen; k++) {
          const studyTime = studyTimes[k] || studyTimes[0] || '';
          const dayText = days[k] || days[0] || '';
          const periodText = periods[k] || periods[0] || '';
          const room = rooms[k] || rooms[0] || '';
          const teacherName = teachers[k] || teachers[0] || '';

          // Chuẩn hóa dayOfWeek: Thứ 2 -> 2, Chủ Nhật -> 8
          let dayOfWeek = 2;
          const normalizedDay = dayText.toLowerCase();
          if (normalizedDay.includes('chủ nhật') || normalizedDay.includes('cn') || normalizedDay === '8') {
            dayOfWeek = 8;
          } else {
            const match = dayText.match(/\d+/);
            if (match) {
              dayOfWeek = parseInt(match[0]);
            }
          }

          scheduleList.push({
            courseName,
            credits,
            classCode,
            studyTime,
            dayOfWeek,
            periodText,
            room,
            teacherName
          });
        }
      }
    });
  });

  return scheduleList;
};

/**
 * Phân tích cú pháp Lịch thi từ HTML
 * @param {string} html - HTML cào được từ trang tra cứu lịch thi
 * @returns {Array} Danh sách lịch thi chi tiết
 */
const parseExams = (html) => {
  const $ = cheerio.load(html);
  const examList = [];

  // Tìm bảng chứa lịch thi (thường có tiêu đề cột chứa từ khóa 'thi', 'ngày thi', 'phòng thi')
  $('table').each((tableIdx, table) => {
    let isExamTable = false;
    $(table).find('th, td').each((_, el) => {
      const text = $(el).text().toLowerCase();
      if (text.includes('ngày thi') || text.includes('ca thi') || text.includes('phòng thi')) {
        isExamTable = true;
      }
    });

    if (!isExamTable) return;

    $(table).find('tr').each((rowIdx, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 5) {
        const stt = $(cells[0]).text().trim();
        if (isNaN(stt) || !stt) return;

        // Phân tích phỏng đoán dựa trên cấu trúc bảng lịch thi chuẩn của ASC/Nam Việt
        const courseName = $(cells[1]).text().trim().replace(/\s+/g, ' ');
        const examDate = $(cells[2]).text().trim().replace(/\s+/g, ' ');
        const examTime = $(cells[3]).text().trim().replace(/\s+/g, ' '); // Ca thi hoặc Giờ thi
        const room = $(cells[4]).text().trim().replace(/\s+/g, ' ');
        const seatNumber = cells.length >= 6 ? $(cells[5]).text().trim() : '';
        const examFormat = cells.length >= 7 ? $(cells[6]).text().trim() : 'Trắc nghiệm';

        examList.push({
          courseName,
          examDate,
          examTime,
          room,
          seatNumber,
          examFormat
        });
      }
    });
  });

  return examList;
};

/**
 * Phân tích cú pháp Kết quả học tập (Bảng điểm) từ HTML
 * @param {string} html - HTML cào được từ trang bảng điểm
 * @returns {Array} Danh sách điểm các môn học
 */
const parseGrades = (html) => {
  const $ = cheerio.load(html);
  const gradeList = [];

  $('table').each((tableIdx, table) => {
    let isGradeTable = false;
    $(table).find('th, td').each((_, el) => {
      const text = $(el).text().toLowerCase();
      if (text.includes('điểm thi') || text.includes('chuyên cần') || text.includes('điểm chữ') || text.includes('học phần')) {
        isGradeTable = true;
      }
    });

    if (!isGradeTable) return;

    $(table).find('tr').each((rowIdx, row) => {
      const cells = $(row).find('td');
      // Bảng điểm chuẩn: Tên môn, Số tín chỉ, Điểm chuyên cần, Điểm thi, Điểm tổng kết hệ 10, Điểm chữ...
      if (cells.length >= 6) {
        const stt = $(cells[0]).text().trim();
        if (isNaN(stt) || !stt) return;

        const courseName = $(cells[1]).text().trim().replace(/\s+/g, ' ');
        const processGrade = parseFloat($(cells[2]).text().trim()) || null;
        const midtermGrade = parseFloat($(cells[3]).text().trim()) || null;
        const finalGrade = parseFloat($(cells[4]).text().trim()) || null;
        const totalGrade10 = parseFloat($(cells[5]).text().trim()) || null;
        const letterGrade = cells.length >= 7 ? $(cells[6]).text().trim() : '';

        // Tính phỏng đoán điểm hệ 4 từ điểm chữ
        let totalGrade4 = null;
        if (letterGrade) {
          const mapping = { 'A': 4.0, 'B+': 3.5, 'B': 3.0, 'C+': 2.5, 'C': 2.0, 'D+': 1.5, 'D': 1.0, 'F': 0 };
          totalGrade4 = mapping[letterGrade.toUpperCase()] !== undefined ? mapping[letterGrade.toUpperCase()] : null;
        }

        gradeList.push({
          courseName,
          processGrade,
          midtermGrade,
          finalGrade,
          totalGrade10,
          totalGrade4,
          letterGrade
        });
      }
    });
  });

  return gradeList;
};

/**
 * Phân tích cú pháp Tài chính & Công nợ học phí từ HTML
 * @param {string} html - HTML cào từ trang học phí
 * @returns {Object} { totalTuition, paidTuition, debtTuition, invoiceDetails }
 */
const parseFinance = (html) => {
  const $ = cheerio.load(html);
  
  let totalTuition = 0;
  let paidTuition = 0;
  let debtTuition = 0;
  const invoiceDetails = [];

  // Tìm các bảng công nợ hoặc phiếu thu
  $('table').each((tableIdx, table) => {
    $(table).find('tr').each((rowIdx, row) => {
      const text = $(row).text().toLowerCase();
      // Phân tích phỏng đoán các dòng tổng cộng công nợ học phí
      if (text.includes('phải nộp') || text.includes('tổng học phí') || text.includes('công nợ')) {
        const numbers = text.match(/\d+[\d.,]*/g);
        if (numbers && numbers.length >= 1) {
          // Lọc bỏ dấu phẩy/chấm để parse số
          totalTuition = parseInt(numbers[0].replace(/[.,]/g, '')) || 0;
        }
      }
      if (text.includes('đã nộp') || text.includes('số tiền nộp')) {
        const numbers = text.match(/\d+[\d.,]*/g);
        if (numbers && numbers.length >= 1) {
          paidTuition = parseInt(numbers[0].replace(/[.,]/g, '')) || 0;
        }
      }
    });
  });

  debtTuition = Math.max(0, totalTuition - paidTuition);

  return {
    totalTuition,
    paidTuition,
    debtTuition,
    invoiceDetails
  };
};

module.exports = {
  parseSchedule,
  parseExams,
  parseGrades,
  parseFinance
};
