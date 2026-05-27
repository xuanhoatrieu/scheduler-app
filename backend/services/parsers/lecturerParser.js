const cheerio = require('cheerio');

const splitCellByBr = ($, td) => {
  const html = $(td).html() || '';
  const cleanHtml = html.replace(/<br\s*\/?>/gi, '\n');
  const tempDom = cheerio.load(`<div>${cleanHtml}</div>`);
  return tempDom('div').text().split('\n').map(item => item.trim()).filter(item => item !== '');
};

/**
 * Phân tích cú pháp HTML lịch giảng dạy của Giảng viên
 * @param {string} html - HTML cào được từ trang lịch giảng dạy của giảng viên
 * @returns {Array} Danh sách lịch giảng dạy chi tiết
 */
const parseLecturerSchedule = (html) => {
  const $ = cheerio.load(html);
  const scheduleList = [];

  $('table').each((tableIdx, table) => {
    $(table).find('tr').each((rowIdx, row) => {
      const cells = $(row).find('td');
      // Thường bảng lịch dạy có cấu trúc cột: STT, Tên học phần, Số tín chỉ, Tên lớp, Thời gian, Thứ, Tiết, Phòng...
      if (cells.length >= 8) {
        const stt = $(cells[0]).text().trim();
        if (isNaN(stt) || !stt) return;

        const courseName = $(cells[1]).text().trim().replace(/\s+/g, ' ');
        const credits = parseInt($(cells[2]).text().trim()) || 0;
        const classCode = $(cells[3]).text().trim().replace(/\s+/g, ' ');

        // Sử dụng thuật toán phân tách dòng cào đa ca cho Giảng viên
        const studyTimes = splitCellByBr($, cells[4]);
        const days = splitCellByBr($, cells[5]);
        const periods = splitCellByBr($, cells[6]);
        const rooms = splitCellByBr($, cells[7]);

        const maxLen = Math.max(studyTimes.length, days.length, periods.length, rooms.length);

        for (let k = 0; k < maxLen; k++) {
          const studyTime = studyTimes[k] || studyTimes[0] || '';
          const dayText = days[k] || days[0] || '';
          const periodText = periods[k] || periods[0] || '';
          const room = rooms[k] || rooms[0] || '';

          // Chuẩn hóa dayOfWeek
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
            teacherName: '' // Sẽ được tự động điền họ tên Giảng viên ở crawler
          });
        }
      }
    });
  });

  return scheduleList;
};

module.exports = {
  parseLecturerSchedule
};
