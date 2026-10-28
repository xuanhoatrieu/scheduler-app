const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.resolve(__dirname, '..', 'public', 'uploads', 'onegate');
const ALLOWED_SUBFOLDERS = ['attachments', 'receipts', 'results'];

const ALLOWED_MIMES = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

// Đảm bảo các thư mục con lưu trữ tồn tại
for (const sub of ALLOWED_SUBFOLDERS) {
  const dir = path.join(UPLOAD_ROOT, sub);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Sinh mã hồ sơ định dạng chuẩn: MC-2026-0042
 */
function formatRequestCode(year, sequenceNum) {
  const y = year || new Date().getFullYear();
  const seq = String(Math.max(1, parseInt(sequenceNum, 10) || 1)).padStart(4, '0');
  return `MC-${y}-${seq}`;
}

/**
 * Sinh mã xác thực văn bản QR duy nhất (chống đoán mò)
 */
function generateVerifyQrCode() {
  return `TUAF-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
}

/**
 * Sinh mã QR nhận bản giấy tại quầy Một cửa
 */
function generatePickupQrCode(requestCode) {
  const cleanCode = String(requestCode || 'MC').replace(/[^A-Z0-9-]/gi, '');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `PICKUP-${cleanCode}-${suffix}`;
}

/**
 * Tạo thông tin chuyển khoản và link ảnh mã VietQR chuẩn Napas247
 */
function buildVietQrPaymentInfo({
  requestCode,
  studentUsername,
  feeAmount,
  bankAccountInfo,
} = {}) {
  const defaultBank = {
    bankId: '970405',
    bankName: 'Agribank CN Thái Nguyên',
    accountNo: '888866669999',
    accountName: 'TRUONG DAI HOC NONG LAM TN',
  };

  const bank = {
    ...defaultBank,
    ...(bankAccountInfo && typeof bankAccountInfo === 'object' ? bankAccountInfo : {}),
  };

  const amount = Math.max(0, parseInt(feeAmount, 10) || 0);
  const compactCode = String(requestCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const compactStudent = String(studentUsername || 'SV').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const transferSyntax = `${compactCode} ${compactStudent}`.trim();

  const qrImageUrl = `https://img.vietqr.io/image/${encodeURIComponent(
    bank.bankId
  )}-${encodeURIComponent(bank.accountNo)}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(
    transferSyntax
  )}&accountName=${encodeURIComponent(bank.accountName)}`;

  return {
    bankId: bank.bankId,
    bankName: bank.bankName,
    accountNo: bank.accountNo,
    accountName: bank.accountName,
    amount,
    transferSyntax,
    qrImageUrl,
  };
}

/**
 * Kiểm tra magic bytes cơ bản của Buffer để chống giả mạo phần mở rộng file
 */
function detectFileExtensionFromBuffer(buffer, declaredMime = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  // PDF: %PDF (25 50 44 46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return '.pdf';
  }

  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return '.png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }

  const normalizedMime = String(declaredMime || '').toLowerCase().trim();
  if (ALLOWED_MIMES[normalizedMime]) {
    return ALLOWED_MIMES[normalizedMime];
  }

  return null;
}

/**
 * Lưu tệp tải lên dạng Base64 một cách an toàn (chống Path Traversal, giới hạn kích thước & kiểm tra định dạng)
 * TODO(security): Tích hợp quét Antivirus / CDR cho tệp tải lên trong môi trường production.
 */
function saveBase64Upload({
  base64Data,
  subFolder = 'attachments',
  maxBytes = 10 * 1024 * 1024,
} = {}) {
  if (!ALLOWED_SUBFOLDERS.includes(subFolder)) {
    throw new Error('Thư mục lưu trữ không hợp lệ!');
  }

  if (!base64Data || typeof base64Data !== 'string') {
    throw new Error('Không có dữ liệu tệp tải lên!');
  }

  let declaredMime = '';
  let rawBase64 = base64Data.trim();
  const dataUriMatch = rawBase64.match(/^data:([A-Za-z0-9-+/]+);base64,(.+)$/);
  if (dataUriMatch && dataUriMatch.length === 3) {
    declaredMime = dataUriMatch[1].toLowerCase();
    rawBase64 = dataUriMatch[2];
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  if (!buffer || buffer.length === 0) {
    throw new Error('Tệp tải lên rỗng hoặc không hợp lệ!');
  }

  if (buffer.length > maxBytes) {
    throw new Error('Kích thước tệp vượt quá giới hạn cho phép (tối đa 10MB)!');
  }

  const ext = detectFileExtensionFromBuffer(buffer, declaredMime);
  if (!ext) {
    throw new Error('Định dạng tệp không được phép! Chỉ chấp nhận ảnh JPG, PNG hoặc tài liệu PDF.');
  }

  const safeFileName = `${Date.now()}_${crypto.randomUUID()}${ext}`;
  const targetDir = path.resolve(UPLOAD_ROOT, subFolder);
  const targetPath = path.resolve(targetDir, path.basename(safeFileName));

  // Kiểm tra nghiêm ngặt boundary chống Path Traversal
  if (!targetPath.startsWith(targetDir + path.sep)) {
    throw new Error('Đường dẫn lưu trữ tệp không an toàn!');
  }

  fs.writeFileSync(targetPath, buffer, { mode: 0o644 });

  return {
    fileUrl: `/uploads/onegate/${subFolder}/${safeFileName}`,
    fileName: safeFileName,
    sizeBytes: buffer.length,
    extension: ext,
  };
}

module.exports = {
  UPLOAD_ROOT,
  formatRequestCode,
  generateVerifyQrCode,
  generatePickupQrCode,
  buildVietQrPaymentInfo,
  detectFileExtensionFromBuffer,
  saveBase64Upload,
};
