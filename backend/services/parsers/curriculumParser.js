const cheerio = require('cheerio');

/**
 * Phân tích cú pháp HTML trang Khung Chương trình Đào tạo (CTĐT) của Sinh viên
 * Cổng SV TUAF thường có bảng liệt kê các môn học theo khối kiến thức
 * @param {string} html - HTML cào được từ trang CTĐT
 * @returns {Array} Danh sách môn học trong CTĐT: [{ courseName, courseCode, credits, courseType, knowledgeBlock }]
 */
const parseCurriculum = (html) => {
  const $ = cheerio.load(html);
  const curriculumList = [];
  let currentKnowledgeBlock = 'Chung';

  // Thử tìm bảng chứa CTĐT — thường có cột "Tên học phần", "Số tín chỉ", "Mã học phần"
  $('table').each((tableIdx, table) => {
    let isCurriculumTable = false;
    $(table).find('th, td').each((_, el) => {
      const text = $(el).text().toLowerCase();
      if (text.includes('tên học phần') || text.includes('tên môn') || text.includes('mã học phần') || text.includes('số tín chỉ')) {
        isCurriculumTable = true;
      }
    });

    if (!isCurriculumTable) return;

    $(table).find('tr').each((rowIdx, row) => {
      const cells = $(row).find('td');
      if (cells.length === 0) return;

      // Phát hiện dòng tiêu đề nhóm (khối kiến thức) — thường là dòng có colspan hoặc chỉ 1-2 cell
      if (cells.length <= 2) {
        const headerText = $(cells[0]).text().trim();
        // Kiểm tra xem có phải là tiêu đề nhóm không (VD: "Khối kiến thức đại cương", "Kiến thức cơ sở ngành")
        if (headerText && headerText.length > 5 && !/^\d+$/.test(headerText)) {
          currentKnowledgeBlock = headerText.replace(/\s+/g, ' ');
        }
        return;
      }

      // Kiểm tra dòng có rowspan hoặc colspan lớn → có thể là tiêu đề nhóm
      const firstCell = $(cells[0]);
      const colspan = parseInt(firstCell.attr('colspan')) || 1;
      if (colspan >= 3) {
        const headerText = firstCell.text().trim();
        if (headerText && headerText.length > 5) {
          currentKnowledgeBlock = headerText.replace(/\s+/g, ' ');
        }
        return;
      }

      // Parse dòng dữ liệu môn học
      // Cấu trúc phổ biến: STT (0) | Mã HP (1) | Tên HP (2) | Số TC (3) | Loại (4)
      // Hoặc: STT (0) | Tên HP (1) | Số TC (2)
      let kyThuText = '';
      let courseCode = '';
      let courseName = '';
      let credits = 0;
      let tuChonText = '';

      if (cells.length === 9) {
        // Hàng đầy đủ cột (9 cột, bao gồm Kỳ thứ ở cột 0)
        kyThuText = $(cells[0]).text().trim();
        courseCode = $(cells[1]).text().trim();
        courseName = $(cells[2]).text().trim();
        tuChonText = $(cells[4]).text().trim();
        credits = parseInt($(cells[5]).text().trim()) || 0;

        if (kyThuText !== '') {
          currentKnowledgeBlock = kyThuText === '0' ? 'Khối kiến thức chung / bổ trợ' : `Học kỳ ${kyThuText}`;
        }
      } else if (cells.length === 8) {
        // Hàng bị khuyết cột Kỳ thứ do rowspan (8 cột)
        courseCode = $(cells[0]).text().trim();
        courseName = $(cells[1]).text().trim();
        tuChonText = $(cells[3]).text().trim();
        credits = parseInt($(cells[4]).text().trim()) || 0;
      } else {
        // Fallback tối giản cho định dạng khác nếu có
        const sttText = $(cells[0]).text().trim();
        if (sttText.toLowerCase().includes('stt') || sttText.toLowerCase().includes('tt') || sttText.toLowerCase().includes('kỳ')) return;
        
        if (cells.length >= 3) {
          courseCode = '';
          courseName = $(cells[1]).text().trim();
          credits = parseInt($(cells[2]).text().trim()) || 0;
          tuChonText = '';
        } else {
          return;
        }
      }

      // Bỏ qua nếu tên môn quá ngắn hoặc trống
      if (!courseName || courseName.length < 3) return;
      
      // Bỏ qua nếu tên môn là header ẩn (chứa "tổng", "cộng", v.v.)
      const lower = courseName.toLowerCase();
      if (lower.includes('tổng cộng') || lower.includes('tổng số') || lower === 'cộng') return;

      curriculumList.push({
        courseName: courseName.replace(/\s+/g, ' '),
        courseCode: courseCode.replace(/\s+/g, ' ') || '',
        credits,
        courseType: tuChonText ? 'Tự chọn' : 'Bắt buộc',
        knowledgeBlock: currentKnowledgeBlock
      });
    });
  });

  return curriculumList;
};

module.exports = {
  parseCurriculum
};
