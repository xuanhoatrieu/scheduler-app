const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

/**
 * 1. Giải nén file ZIP (.xlsx) sử dụng thư viện chuẩn zlib của Node.js
 */
function readZip(buffer) {
  const files = {};
  let offset = 0;
  while (offset < buffer.length - 4) {
    const sig = buffer.readUInt32LE(offset);
    if (sig === 0x04034b50) { // Local file header
      const compMethod = buffer.readUInt16LE(offset + 8);
      const compSize = buffer.readUInt32LE(offset + 18);
      const nameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);
      const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLen);
      const dataStart = offset + 30 + nameLen + extraLen;
      const dataEnd = dataStart + compSize;

      if (dataEnd <= buffer.length) {
        const rawData = buffer.slice(dataStart, dataEnd);
        try {
          if (compMethod === 0) {
            files[name] = rawData;
          } else if (compMethod === 8) {
            files[name] = zlib.inflateRawSync(rawData);
          }
        } catch (e) {
          // Bỏ qua file lỗi trong zip nếu không cần thiết
        }
      }
      offset = dataEnd;
    } else {
      offset++;
    }
  }
  return files;
}

/**
 * 2. Đọc bảng sharedStrings.xml
 */
function parseSharedStrings(xml) {
  if (!xml) return [];
  const strings = [];
  let pos = 0;
  while (true) {
    const siStart = xml.indexOf('<si', pos);
    if (siStart === -1) break;
    const siEnd = xml.indexOf('</si>', siStart);
    if (siEnd === -1) break;

    const siContent = xml.substring(siStart, siEnd);
    let text = '';
    let tPos = 0;
    while (true) {
      const tStart = siContent.indexOf('<t', tPos);
      if (tStart === -1) break;
      const tTagEnd = siContent.indexOf('>', tStart);
      if (tTagEnd === -1) break;
      const tEnd = siContent.indexOf('</t>', tTagEnd);
      if (tEnd === -1) break;
      text += siContent.substring(tTagEnd + 1, tEnd);
      tPos = tEnd + 4;
    }

    // Unescape XML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

    strings.push(text);
    pos = siEnd + 5;
  }
  return strings;
}

/**
 * 3. Đọc dữ liệu các ô từ sheet1.xml (trả về { [rowNum]: { [colNum]: value } })
 */
function parseWorksheet(xml, sharedStrings) {
  const rows = {};
  let rowPos = 0;

  while (true) {
    const rowStart = xml.indexOf('<row ', rowPos);
    if (rowStart === -1) break;
    const rowEnd = xml.indexOf('</row>', rowStart);
    if (rowEnd === -1) break;

    const rowTagEnd = xml.indexOf('>', rowStart);
    const rowOpenTag = xml.substring(rowStart, rowTagEnd);
    const rMatch = rowOpenTag.match(/\br="(\d+)"/);
    if (!rMatch) {
      rowPos = rowEnd + 6;
      continue;
    }
    const rowNum = parseInt(rMatch[1], 10);
    const rowContent = xml.substring(rowTagEnd + 1, rowEnd);
    const rowData = {};

    let cellPos = 0;
    while (true) {
      const cStart = rowContent.indexOf('<c ', cellPos);
      if (cStart === -1) break;
      const cTagEnd = rowContent.indexOf('>', cStart);
      if (cTagEnd === -1) break;

      const isSelfClosing = rowContent[cTagEnd - 1] === '/';
      const cOpenTag = rowContent.substring(cStart, cTagEnd + (isSelfClosing ? 0 : 1));

      const refMatch = cOpenTag.match(/\br="([A-Z]+)(\d+)"/);
      if (!refMatch) {
        cellPos = cTagEnd + 1;
        continue;
      }
      const colStr = refMatch[1];
      let colNum = 0;
      for (let i = 0; i < colStr.length; i++) {
        colNum = colNum * 26 + (colStr.charCodeAt(i) - 64);
      }

      if (isSelfClosing) {
        cellPos = cTagEnd + 1;
        continue;
      }

      const cClose = rowContent.indexOf('</c>', cTagEnd);
      if (cClose === -1) {
        cellPos = cTagEnd + 1;
        continue;
      }

      const cellBody = rowContent.substring(cTagEnd + 1, cClose);
      cellPos = cClose + 4;

      const tMatch = cOpenTag.match(/\bt\s*=\s*"([^"]+)"/);
      const cellType = tMatch ? tMatch[1].trim() : '';

      let val = null;
      if (cellType === 's') {
        const vStart = cellBody.indexOf('<v>');
        const vEnd = cellBody.indexOf('</v>', vStart);
        if (vStart !== -1 && vEnd !== -1) {
          const sIdx = parseInt(cellBody.substring(vStart + 3, vEnd).trim(), 10);
          val = sharedStrings[sIdx] ?? '';
        }
      } else if (cellType === 'inlineStr') {
        const tStart = cellBody.indexOf('<t');
        if (tStart !== -1) {
          const tOpenEnd = cellBody.indexOf('>', tStart);
          const tEnd = cellBody.indexOf('</t>', tOpenEnd);
          if (tOpenEnd !== -1 && tEnd !== -1) {
            val = cellBody.substring(tOpenEnd + 1, tEnd);
          }
        }
      } else {
        const vStart = cellBody.indexOf('<v>');
        const vEnd = cellBody.indexOf('</v>', vStart);
        if (vStart !== -1 && vEnd !== -1) {
          val = cellBody.substring(vStart + 3, vEnd).trim();
        }
      }

      if (val !== null && val !== undefined) {
        rowData[colNum] = String(val).trim();
      }
    }

    rows[rowNum] = rowData;
    rowPos = rowEnd + 6;
  }

  return rows;
}

/**
 * 4. Parse file Excel Khung CTĐT thành cấu trúc JSON chuẩn (tương đương logic parse_excel_curriculum.py)
 */
function parseCurriculumExcel(filePath) {
  const buf = fs.readFileSync(filePath);
  const files = readZip(buf);

  // Tìm sheet1 (hoặc sheet chính của workbook)
  let sheetKey = 'xl/worksheets/sheet1.xml';
  if (!files[sheetKey]) {
    sheetKey = Object.keys(files).find(k => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'));
  }
  if (!files[sheetKey]) {
    throw new Error('Không tìm thấy dữ liệu Sheet trong tệp Excel (.xlsx)!');
  }

  const sharedStringsXml = files['xl/sharedStrings.xml'] ? files['xl/sharedStrings.xml'].toString('utf8') : '';
  const sheetXml = files[sheetKey].toString('utf8');

  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const rows = parseWorksheet(sheetXml, sharedStrings);

  const courses = [];
  let currentMajorCode = 'I';
  let currentMajorName = 'I. Khối kiến thức giáo dục đại cương';
  let currentSubCode = 'I.1';
  let currentSubName = 'I.1. Khối kiến thức đại cương bắt buộc';
  let currentIsElectiveBlock = false;
  let currentIsConditionBlock = false;

  const maxRow = Math.max(...Object.keys(rows).map(n => parseInt(n, 10)), 0);

  // 1. Part 1: Cấu trúc theo Khối kiến thức (Dòng 7 đến 95)
  for (let r = 7; r <= 95; r++) {
    const row = rows[r] || {};
    const stt = row[1] || '';
    const ky = row[2] || '';
    const ma = row[3] || '';
    const ten = row[4] || '';
    const tenEn = row[5] || '';
    const tc = row[6] || '';
    const lt = row[7] || '';
    const th = row[8] || '';

    // Nhận diện dòng tiêu đề khối lớn / khối con
    const knownBlockCodes = ['I', 'II', 'I.1', 'I.2', 'I.3', 'I.4', 'II.1', 'II.1.1', 'II.1.2', 'II.2', 'II.2.1', 'II.2.2', 'II.3', 'II.4', 'II.5', 'II.6'];
    const isBlockHeader = knownBlockCodes.includes(ma) || (!stt && (ten.includes('Khối') || ten.toLowerCase().includes('bắt buộc') || ten.toLowerCase().includes('tự chọn')));

    if (isBlockHeader) {
      if (ma === 'I' || (ten.toLowerCase().includes('đại cương') && !ten.toLowerCase().includes('chuyên nghiệp'))) {
        currentMajorCode = 'I';
        currentMajorName = 'I. Khối kiến thức giáo dục đại cương';
      } else if (ma === 'II' || ten.toLowerCase().includes('chuyên nghiệp')) {
        currentMajorCode = 'II';
        currentMajorName = 'II. Khối kiến thức giáo dục chuyên nghiệp';
      }

      if (['I.1', 'I.2', 'I.3', 'I.4', 'II.1.1', 'II.1.2', 'II.2.1', 'II.2.2', 'II.3', 'II.4', 'II.5', 'II.6'].includes(ma)) {
        currentSubCode = ma;
        currentSubName = `${ma}. ${ten}`;
      } else if (ten) {
        currentSubName = ten;
      }

      currentIsElectiveBlock = ['I.2', 'II.1.2', 'II.2.2'].includes(ma) || ten.toLowerCase().includes('tự chọn');
      currentIsConditionBlock = ['I.3', 'I.4'].includes(ma) || ten.toLowerCase().includes('thể chất') || ten.toLowerCase().includes('quốc phòng');
      continue;
    }

    if (!ma || !ten || ma === 'None' || ten === 'None' || ma.startsWith('III') || ten.toLowerCase().includes('tổng số tín chỉ')) {
      continue;
    }

    const tenLower = ten.toLowerCase();
    const isCondition = currentIsConditionBlock ||
      tenLower.includes('thể chất') ||
      tenLower.includes('quốc phòng') ||
      ma.includes('GDQP') ||
      ma.includes('CB701') ||
      tenLower.startsWith('giáo dục thể chất') ||
      tenLower.startsWith('giáo dục quốc phòng');

    const isElective = currentIsElectiveBlock || tenLower.includes('tự chọn');

    const creditsVal = tc ? parseInt(tc, 10) || 0 : 0;
    const theoryVal = lt ? parseInt(lt, 10) || 0 : 0;
    const practiceVal = th ? parseInt(th, 10) || 0 : 0;
    const semVal = (ky && /^\d+$/.test(ky)) ? parseInt(ky, 10) : null;

    let electiveGroup = '';
    if (isElective) {
      if (currentSubCode.includes('I.2')) {
        electiveGroup = 'Tự chọn đại cương (Yêu cầu 8 TC)';
      } else if (currentSubCode.includes('II.1.2')) {
        electiveGroup = 'Tự chọn cơ sở ngành (Yêu cầu 12 TC)';
      } else if (currentSubCode.includes('II.2.2')) {
        electiveGroup = 'Tự chọn chuyên ngành (Yêu cầu 15 TC)';
      }
    }

    const courseType = isCondition ? 'Điều kiện' : (isElective ? 'Tự chọn' : 'Bắt buộc');

    courses.push({
      stt: /^\d+$/.test(stt) ? parseInt(stt, 10) : courses.length + 1,
      excelSemester: semVal,
      courseCode: ma,
      courseName: ten,
      courseNameEn: tenEn,
      credits: creditsVal,
      theoryHours: theoryVal,
      practiceHours: practiceVal,
      majorBlockCode: currentMajorCode,
      majorBlockName: currentMajorName,
      subBlockCode: currentSubCode,
      subBlockName: currentSubName,
      blockCode: currentSubCode,
      blockName: currentMajorName,
      courseType,
      isElective,
      electiveGroup,
      isCondition,
      isOrganized: false,
      semester: semVal
    });
  }

  // 2. Part 2: Phân kỳ khuyến nghị và xác định môn được tổ chức giảng dạy (Dòng 96 trở đi)
  const part2SemMap = {};
  let currentKy = 0;
  for (let r = 96; r <= maxRow; r++) {
    const row = rows[r] || {};
    const stt = row[1] || '';
    const ky = row[2] || '';
    const ma = row[3] || '';
    const ten = row[4] || '';

    const checkStr = `${stt} ${ky} ${ma} ${ten}`.toUpperCase();
    if (checkStr.includes('HỌC KỲ')) {
      const match = checkStr.match(/HỌC KỲ\s*(\d+)/i) || checkStr.match(/(\d+)/);
      if (match) {
        currentKy = parseInt(match[1], 10);
      }
      continue;
    }

    if (/^\d+$/.test(ky)) {
      currentKy = parseInt(ky, 10);
    }

    if (ma && ma !== 'None' && !ma.startsWith('I') && !ma.startsWith('II') && !stt.includes('STT') && !ma.includes('Mã HP')) {
      if (currentKy > 0) {
        part2SemMap[ma] = currentKy;
      }
    }
  }

  // 3. Cập nhật `isOrganized` và `semester` cho từng môn
  for (const c of courses) {
    const code = c.courseCode;
    const isInColB = c.excelSemester !== null && c.excelSemester > 0;
    const isInPart2 = !!part2SemMap[code];

    if (isInPart2 || isInColB) {
      c.isOrganized = true;
      c.semester = part2SemMap[code] || c.excelSemester || 1;
    } else {
      c.isOrganized = false;
      c.semester = null;
    }
  }

  // 4. Tính toán tổng số tín chỉ tích lũy tốt nghiệp chuẩn
  const seenCodes = new Set();
  const organizedNonCondition = [];
  for (const c of courses) {
    if (c.isOrganized && !c.isCondition && !seenCodes.has(c.courseCode)) {
      seenCodes.add(c.courseCode);
      organizedNonCondition.push(c);
    }
  }

  const totalGraduationCredits = organizedNonCondition.reduce((sum, c) => sum + (c.credits || 0), 0);
  const conditionCredits = courses
    .filter(c => c.isOrganized && c.isCondition)
    .reduce((sum, c) => sum + (c.credits || 0), 0);

  return {
    totalCourses: courses.length,
    totalOrganizedCourses: courses.filter(c => c.isOrganized).length,
    totalUnorganizedCourses: courses.filter(c => !c.isOrganized).length,
    totalGraduationCredits: totalGraduationCredits > 0 ? totalGraduationCredits : 153,
    conditionCredits,
    courses
  };
}

module.exports = {
  readZip,
  parseSharedStrings,
  parseWorksheet,
  parseCurriculumExcel
};
