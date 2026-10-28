const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOAD_ROOT } = require('../utils/oneStopHelpers');
const { escapeHtml } = require('./emailReportService');

/**
 * Tạo tệp PDF chuẩn (PDF 1.4 tối giản) hoặc lưu văn bản chứng nhận điện tử kèm mã QR xác thực
 * để sinh viên có thể tải trực tiếp trên Mobile App & đối chiếu tại cổng /verify/:verifyQrCode
 */
function generateSimpleCertificatePdf({
  requestCode,
  verifyQrCode,
  serviceName,
  studentFullName,
  studentUsername,
  studentClass,
  department,
  issuedAt = new Date(),
  staffNote = '',
  baseUrl = 'https://scheduler.tuaf.edu.vn',
} = {}) {
  const verifyUrl = `${baseUrl.replace(/\/+$/, '')}/verify/${encodeURIComponent(
    verifyQrCode || ''
  )}`;
  const dateStr = new Date(issuedAt).toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  // Chuyển chuỗi tiếng Việt sang ASCII an toàn cho nội dung PDF cơ bản, đồng thời đính kèm link xác thực QR
  const toAscii = (str) =>
    String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[()\\]/g, '');

  const lines = [
    'TRUONG DAI HOC NONG LAM THAI NGUYEN (TUAF)',
    'HE THONG HANH CHINH MOT CUA SO - VAN BAN DIEN TU',
    '------------------------------------------------------------',
    `Ma ho so: ${toAscii(requestCode)}`,
    `Thu tuc: ${toAscii(serviceName)}`,
    `Don vi cap: ${toAscii(department)}`,
    `Ho va ten: ${toAscii(studentFullName)}`,
    `Ma sinh vien / CCCD: ${toAscii(studentUsername || 'Cuu sinh vien')}`,
    `Lop / Nganh: ${toAscii(studentClass || 'TUAF')}`,
    `Ngay cap: ${toAscii(dateStr)}`,
    staffNote ? `Ghi chu: ${toAscii(staffNote)}` : '',
    '------------------------------------------------------------',
    `Ma xac thuc QR: ${toAscii(verifyQrCode)}`,
    `Tra cuu tinh phap ly truc tuyen tai:`,
    verifyUrl,
  ].filter(Boolean);

  const textOps = lines
    .map((line, idx) => {
      const y = 760 - idx * 24;
      const font = idx < 2 ? '/F1 13 Tf' : '/F1 11 Tf';
      return `BT ${font} 50 ${y} Td (${line}) Tj ET`;
    })
    .join('\n');

  const streamContent = `${textOps}\n`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(
      streamContent,
      'utf8'
    )} >>\nstream\n${streamContent}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const resultsDir = path.resolve(UPLOAD_ROOT, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const safeName = `cert_${Date.now()}_${crypto.randomUUID()}.pdf`;
  const targetPath = path.resolve(resultsDir, path.basename(safeName));
  if (!targetPath.startsWith(resultsDir + path.sep)) {
    throw new Error('Đường dẫn tạo PDF không hợp lệ!');
  }

  fs.writeFileSync(targetPath, Buffer.from(pdf, 'utf8'), { mode: 0o644 });

  return {
    fileUrl: `/uploads/onegate/results/${safeName}`,
    verifyUrl,
  };
}

/**
 * Render trang HTML Công khai Xác thực Văn bản Điện tử & In Giấy Chứng Nhận (/verify/:verifyQrCode)
 * Mọi biến động đều được escapeHtml() để chống XSS tuyệt đối.
 */
function renderVerificationPageHtml({ request, service, baseUrl = 'https://scheduler.tuaf.edu.vn' } = {}) {
  if (!request) {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Xác thực Văn bản Một cửa — TUAF</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f1f5f9; margin: 0; padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 90vh; }
    .card { max-width: 520px; width: 100%; background: #fff; border-radius: 16px; padding: 32px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border-top: 6px solid #dc2626; }
    h1 { color: #dc2626; font-size: 20px; margin-bottom: 12px; }
    p { color: #475569; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>❌ KHÔNG TÌM THẤY VĂN BẢN XÁC THỰC</h1>
    <p>Mã xác thực QR này không tồn tại trên Hệ thống Hành chính Một cửa Số của Trường Đại học Nông Lâm Thái Nguyên hoặc văn bản đã bị thu hồi.</p>
  </div>
</body>
</html>`;
  }

  const verifyUrl = `${baseUrl.replace(/\/+$/, '')}/verify/${encodeURIComponent(
    request.verifyQrCode || ''
  )}`;
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
    verifyUrl
  )}`;
  const issuedDate = request.completedAt
    ? new Date(request.completedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : new Date(request.updatedAt || Date.now()).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
      });

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Xác thực Văn bản #${escapeHtml(request.requestCode)} — TUAF</title>
  <style>
    body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; }
    .wrap { max-width: 720px; margin: 16px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
    .banner { background: linear-gradient(135deg, #14532d, #166534); color: #fff; padding: 24px; text-align: center; }
    .banner h1 { margin: 0; font-size: 19px; text-transform: uppercase; letter-spacing: 0.5px; }
    .banner p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .verified-badge { display: inline-flex; align-items: center; gap: 6px; background: #dcfce7; color: #166534; font-weight: 800; font-size: 13px; padding: 6px 16px; border-radius: 999px; margin-top: 14px; }
    .body { padding: 28px; }
    .grid { display: grid; grid-template-columns: 1fr 170px; gap: 20px; align-items: start; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
    .row { padding: 10px 0; border-bottom: 1px dashed #e2e8f0; display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
    .lbl { color: #64748b; font-weight: 600; }
    .val { color: #0f172a; font-weight: 700; text-align: right; }
    .qr-box { text-align: center; background: #f8fafc; padding: 14px; border-radius: 12px; border: 1px solid #e2e8f0; }
    .qr-box img { width: 140px; height: 140px; display: block; margin: 0 auto 8px; }
    .qr-code-txt { font-family: monospace; font-size: 11px; color: #334155; font-weight: 700; word-break: break-all; }
    .actions { margin-top: 24px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn { padding: 10px 18px; border-radius: 10px; font-size: 13px; font-weight: 700; text-decoration: none; cursor: pointer; border: none; }
    .btn-primary { background: #166534; color: #fff; }
    .btn-outline { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .footer { background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    @media print { .actions { display: none; } body { background: #fff; padding: 0; } .wrap { box-shadow: none; border: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="banner">
      <h1>Trường Đại học Nông Lâm Thái Nguyên</h1>
      <p>CỔNG XÁC THỰC VĂN BẢN ĐIỆN TỬ — HỆ THỐNG MỘT CỬA SỐ</p>
      <div class="verified-badge">✔ VĂN BẢN HỢP LỆ & ĐÃ ĐƯỢC XÁC THỰC BỞI NHÀ TRƯỜNG</div>
    </div>
    <div class="body">
      <div class="grid">
        <div>
          <div class="row"><span class="lbl">Mã hồ sơ:</span><span class="val">${escapeHtml(request.requestCode)}</span></div>
          <div class="row"><span class="lbl">Tên thủ tục / Văn bản:</span><span class="val">${escapeHtml(request.serviceName || service?.name || '')}</span></div>
          <div class="row"><span class="lbl">Đơn vị cấp:</span><span class="val">${escapeHtml(request.assignedDepartment || service?.department || '')}</span></div>
          <div class="row"><span class="lbl">Họ và tên:</span><span class="val">${escapeHtml(request.studentFullName)}</span></div>
          <div class="row"><span class="lbl">Mã SV / Định danh:</span><span class="val">${escapeHtml(request.studentUsername || 'Cựu sinh viên')}</span></div>
          <div class="row"><span class="lbl">Lớp / Ngành học:</span><span class="val">${escapeHtml(request.studentClass || '—')}</span></div>
          <div class="row"><span class="lbl">Ngày cấp / Phê duyệt:</span><span class="val">${escapeHtml(issuedDate)}</span></div>
          <div class="row"><span class="lbl">Cán bộ phê duyệt:</span><span class="val">${escapeHtml(request.assignedStaffName || service?.assigneeName || 'Bộ phận Một cửa TUAF')}</span></div>
          ${
            request.staffNote
              ? `<div class="row"><span class="lbl">Nội dung xác nhận:</span><span class="val">${escapeHtml(request.staffNote)}</span></div>`
              : ''
          }
        </div>
        <div class="qr-box">
          <img src="${escapeHtml(qrImgUrl)}" alt="QR Verify" />
          <div class="qr-code-txt">${escapeHtml(request.verifyQrCode)}</div>
        </div>
      </div>

      <div class="actions">
        ${
          request.resultPdfUrl
            ? `<a class="btn btn-primary" href="${escapeHtml(request.resultPdfUrl)}" download>📥 Tải Bản PDF Chính Thức</a>`
            : ''
        }
        <button class="btn btn-outline" onclick="window.print()">🖨️ In văn bản xác thực</button>
      </div>
    </div>
    <div class="footer">
      Văn bản này được xác thực điện tử trên cổng thông tin chính thức của Trường Đại học Nông Lâm Thái Nguyên.<br/>
      Mọi hành vi chỉnh sửa nội dung sau khi in đều không có giá trị pháp lý.
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  generateSimpleCertificatePdf,
  renderVerificationPageHtml,
};
