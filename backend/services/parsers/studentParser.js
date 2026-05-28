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
 * Phân tích cú pháp Lịch thi từ HTML (Trang /TraCuuLichThi/Index)
 * @param {string} html - HTML cào được từ trang tra cứu lịch thi
 * @returns {Array} Danh sách lịch thi chi tiết
 */
const parseExams = (html) => {
  const $ = cheerio.load(html);
  const examList = [];

  $('table').each((tableIdx, table) => {
    let isExamTable = false;
    $(table).find('th, td').each((_, el) => {
      const text = $(el).text().toLowerCase();
      if (text.includes('ngày thi') || text.includes('giờ thi') || text.includes('phòng thi') || text.includes('số báo danh')) {
        isExamTable = true;
      }
    });

    if (!isExamTable) return;

    $(table).find('tr').each((rowIdx, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 8) {
        const stt = $(cells[0]).text().trim();
        if (isNaN(stt) || !stt) return;

        // Cấu trúc bảng lịch thi TUAF:
        // STT (0) | Tên học phần (1) | Ngày thi (2) | Ca thi (3) | Giờ thi (4) | Lần thi (5) | Đợt thi (6) | Số báo danh (7) | Phòng thi (8) | Hình thức (9)
        const courseName = $(cells[1]).text().trim().replace(/\s+/g, ' ');
        const examDate = $(cells[2]).text().trim().replace(/\s+/g, ' ');
        const examTime = $(cells[4]).text().trim().replace(/\s+/g, ' '); // Lấy cột giờ thi
        const seatNumber = $(cells[7]).text().trim().replace(/\s+/g, ' ');
        const room = $(cells[8]).text().trim().replace(/\s+/g, ' ');
        const examFormat = cells.length >= 10 ? $(cells[9]).text().trim().replace(/\s+/g, ' ') : 'Thi Viết';

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
 * Phân tích cú pháp Kết quả học tập (Bảng điểm /TraCuuDiemSV/Index) từ HTML
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
      if (text.includes('điểm thành phần') || text.includes('điểm thi') || text.includes('tbchp') || text.includes('điểm chữ')) {
        isGradeTable = true;
      }
    });

    if (!isGradeTable) return;

    $(table).find('tr').each((rowIdx, row) => {
      const cells = $(row).find('td');
      // Bảng điểm chuẩn TUAF:
      // STT (0) | Ký hiệu (1) | Tên học phần (2) | Số tín chỉ (3) | Điểm thành phần (4) | Điểm thi (5) | TBCHP (6) | Điểm số (7) | Điểm chữ (8) | Môn tự chọn (9)
      if (cells.length >= 9) {
        const stt = $(cells[0]).text().trim();
        if (isNaN(stt) || !stt) return;

        const courseName = $(cells[2]).text().trim().replace(/\s+/g, ' ');
        
        // Parse điểm thành phần (CC và GK) từ chuỗi ví dụ "CC : 9  - GK : 6.5"
        const processText = $(cells[4]).text().trim();
        let processGrade = null;
        let midtermGrade = null;
        if (processText) {
          const ccMatch = processText.match(/CC\s*:\s*([\d.]+)/i);
          if (ccMatch) processGrade = parseFloat(ccMatch[1]);
          const gkMatch = processText.match(/GK\s*:\s*([\d.]+)/i);
          if (gkMatch) midtermGrade = parseFloat(gkMatch[1]);
        }

        const finalGrade = parseFloat($(cells[5]).text().trim());
        const totalGrade10 = parseFloat($(cells[6]).text().trim());
        const totalGrade4 = parseFloat($(cells[7]).text().trim());
        const letterGrade = $(cells[8]).text().trim().toUpperCase();

        gradeList.push({
          courseName,
          processGrade: isNaN(processGrade) ? null : processGrade,
          midtermGrade: isNaN(midtermGrade) ? null : midtermGrade,
          finalGrade: isNaN(finalGrade) ? null : finalGrade,
          totalGrade10: isNaN(totalGrade10) ? null : totalGrade10,
          totalGrade4: isNaN(totalGrade4) ? null : totalGrade4,
          letterGrade
        });
      }
    });
  });

  return gradeList;
};

/**
 * Phân tích cú pháp Tài chính & Công nợ học phí từ HTML (Trang /TraCuuHocPhiSV/Index)
 * @param {string} html - HTML cào từ trang học phí
 * @returns {Object} { totalTuition, paidTuition, debtTuition, invoiceDetails, allFinances }
 */
const parseFinance = (html) => {
  const $ = cheerio.load(html);
  
  let totalTuition = 0;
  let paidTuition = 0;
  let debtTuition = 0;
  const invoiceDetails = [];
  const allFinances = [];

  const cleanMoneyString = (str) => {
    if (!str) return 0;
    // Cắt bỏ phần lẻ ,00 hoặc .00 ở cuối (nếu có) trước khi xóa ký tự không phải số
    let clean = str.split(',00')[0].split('.00')[0];
    return parseInt(clean.replace(/[^\d]/g, '')) || 0;
  };

  // 1. Phân tích bảng tổng hợp học phí tất cả các kỳ (#gvTaiChinh)
  // Mỗi dòng: Học kỳ (0) | Năm học (1) | Mức học phí (2) | Miễn giảm (3) | Số tiền phải nộp (4) | Số tiền đã nộp (5) | Thừa thiếu (6)
  $('#gvTaiChinh tbody tr').each((idx, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 7) {
      const semText = $(cells[0]).text().trim();
      const schoolYearText = $(cells[1]).text().trim();
      
      const tuitionVal = cleanMoneyString($(cells[2]).text());
      const discountVal = cleanMoneyString($(cells[3]).text());
      const mustPayVal = cleanMoneyString($(cells[4]).text());
      const paidVal = cleanMoneyString($(cells[5]).text());
      const debtVal = cleanMoneyString($(cells[6]).text());

      // Chuẩn hóa tên học kỳ và năm học thành HocKy1/HocKy2 và 2024-2025
      const formattedSemester = `HocKy${semText}`;
      const formattedSchoolYear = schoolYearText;

      allFinances.push({
        semester: formattedSemester,
        schoolYear: formattedSchoolYear,
        totalTuition: mustPayVal > 0 ? mustPayVal : tuitionVal,
        paidTuition: paidVal,
        debtTuition: debtVal
      });

      // Cộng dồn vào các chỉ số hiện tại nếu là kỳ học đang hiển thị hoặc tất cả
      totalTuition += mustPayVal > 0 ? mustPayVal : tuitionVal;
      paidTuition += paidVal;
    }
  });

  // 2. Phân tích chi tiết các khoản đã nộp để tạo bản đồ môn học -> { học kỳ, năm học }
  const courseMapping = {};
  let currentSchoolYear = '';
  let currentSemester = '';

  $('#ctl00_ContentCP_ctl00_grdViewLopDangKy tbody tr').each((idx, row) => {
    const cells = $(row).find('td');
    if (cells.length === 0) return; // Bỏ qua header

    let cellOffset = 0;
    
    // Kiểm tra xem td đầu tiên có phải là năm học không (ví dụ: "2024-2025")
    const firstCellText = $(cells[0]).text().trim();
    const isSchoolYear = /\d{4}-\d{4}/.test(firstCellText);
    
    if (isSchoolYear) {
      currentSchoolYear = firstCellText;
      
      // Tiếp theo sẽ là học kỳ
      const secondCellText = $(cells[1]).text().trim();
      currentSemester = `HocKy${secondCellText}`;
      cellOffset = 3; // Bỏ qua cột năm học, học kỳ, ngày nộp gộp
    } else {
      // Nếu không có năm học, kiểm tra xem ô đầu tiên có phải là học kỳ không
      const isSem = /^[123]$/.test(firstCellText);
      if (isSem) {
        currentSemester = `HocKy${firstCellText}`;
        cellOffset = 2; // Bỏ qua cột học kỳ, ngày nộp gộp
      }
    }
    
    // Ô chứa khoản thu học phí
    const feeCell = $(cells[cellOffset]);
    const feeText = feeCell.text().trim();
    
    if (feeText && feeText.includes('Học phí :')) {
      const courseName = feeText.replace('Học phí :', '').trim().replace(/\s+/g, ' ');
      if (courseName && currentSemester && currentSchoolYear) {
        courseMapping[courseName.toLowerCase()] = {
          semester: currentSemester,
          schoolYear: currentSchoolYear
        };
      }
    }
  });

  debtTuition = Math.max(0, totalTuition - paidTuition);

  return {
    totalTuition,
    paidTuition,
    debtTuition,
    invoiceDetails,
    allFinances,
    courseMapping
  };
};

module.exports = {
  parseSchedule,
  parseExams,
  parseGrades,
  parseFinance
};
