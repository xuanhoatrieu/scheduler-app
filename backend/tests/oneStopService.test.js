process.env.DB_URI = process.env.DB_URI || 'postgres://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-unit-tests';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  isWeekendVN,
  calculateBusinessDeadline,
  evaluateSlaStatus,
} = require('../utils/slaCalculator');

const {
  formatRequestCode,
  generateVerifyQrCode,
  generatePickupQrCode,
  buildVietQrPaymentInfo,
  detectFileExtensionFromBuffer,
  saveBase64Upload,
} = require('../utils/oneStopHelpers');

const {
  generateSimpleCertificatePdf,
  renderVerificationPageHtml,
} = require('../services/oneStopPdfService');

const { INITIAL_SERVICES } = require('../services/oneStopSeeder');
const {
  parseAssigneeUsernames,
  isStaffAssignedToService,
} = require('../routes/oneStopRoutes');

test('SLA Calculator: isWeekendVN nhận diện đúng Thứ 7, Chủ Nhật và Ngày thường theo giờ VN', () => {
  // 2026-10-16 là Thứ Sáu
  const friday = new Date('2026-10-16T09:00:00+07:00');
  // 2026-10-17 là Thứ Bảy
  const saturday = new Date('2026-10-17T09:00:00+07:00');
  // 2026-10-18 là Chủ Nhật
  const sunday = new Date('2026-10-18T09:00:00+07:00');

  assert.equal(isWeekendVN(friday), false);
  assert.equal(isWeekendVN(saturday), true);
  assert.equal(isWeekendVN(sunday), true);
});

test('SLA Calculator: calculateBusinessDeadline tự động bỏ qua Thứ Bảy và Chủ Nhật', () => {
  // Nộp lúc 10:00 sáng Thứ Sáu (2026-10-16) với SLA 24h -> Phải rơi vào 10:00 sáng Thứ Hai (2026-10-19)
  const fridayMorning = new Date('2026-10-16T10:00:00+07:00');
  const deadline = calculateBusinessDeadline(fridayMorning, 24);
  const expectedMonday = new Date('2026-10-19T10:00:00+07:00');

  assert.equal(deadline.getTime(), expectedMonday.getTime());
});

test('SLA Calculator: evaluateSlaStatus nhận diện đúng trạng thái Sắp hết hạn (<=4h) và Quá hạn', () => {
  const now = new Date('2026-10-16T10:00:00+07:00');
  const nearDueDeadline = new Date('2026-10-16T12:30:00+07:00'); // Còn 2.5h
  const overdueDeadline = new Date('2026-10-16T08:00:00+07:00'); // Đã trễ 2h

  const nearStatus = evaluateSlaStatus(
    { status: 'processing', deadlineAt: nearDueDeadline },
    now
  );
  assert.equal(nearStatus.isNearDue, true);
  assert.equal(nearStatus.isOverdue, false);

  const overdueStatus = evaluateSlaStatus(
    { status: 'processing', deadlineAt: overdueDeadline },
    now
  );
  assert.equal(overdueStatus.isOverdue, true);
  assert.equal(overdueStatus.overdueHours, 2);

  // Khi đang chờ sinh viên nộp lệ phí (pending_payment), không tính là lỗi quá hạn của cán bộ
  const pausedStatus = evaluateSlaStatus(
    { status: 'pending_payment', deadlineAt: overdueDeadline },
    now
  );
  assert.equal(pausedStatus.isOverdue, false);
});

test('OneStop Helpers: formatRequestCode, QR codes và VietQR URL đúng chuẩn', () => {
  assert.equal(formatRequestCode(2026, 42), 'MC-2026-0042');

  const verifyCode = generateVerifyQrCode();
  assert.match(verifyCode, /^TUAF-[A-F0-9]{20}$/);

  const pickupCode = generatePickupQrCode('MC-2026-0042');
  assert.match(pickupCode, /^PICKUP-MC-2026-0042-[A-F0-9]{6}$/);

  const vietQr = buildVietQrPaymentInfo({
    requestCode: 'MC-2026-0042',
    studentUsername: 'DTN215',
    feeAmount: 20000,
  });
  assert.equal(vietQr.amount, 20000);
  assert.equal(vietQr.transferSyntax, 'MC20260042 DTN215');
  assert.ok(vietQr.qrImageUrl.includes('https://img.vietqr.io/image/'));
});

test('OneStop Helpers: saveBase64Upload chấp nhận PNG hợp lệ và từ chối định dạng nguy hiểm', () => {
  const validPngB64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const saved = saveBase64Upload({
    base64Data: validPngB64,
    subFolder: 'receipts',
  });
  assert.ok(saved.fileUrl.startsWith('/uploads/onegate/receipts/'));
  assert.equal(saved.extension, '.png');

  // Dọn dẹp file test
  const diskPath = path.resolve(__dirname, '..', 'public', saved.fileUrl.replace(/^\/+/, ''));
  if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);

  // Từ chối thư mục không thuộc whitelist
  assert.throws(() => {
    saveBase64Upload({ base64Data: validPngB64, subFolder: '../etc' });
  }, /Thư mục lưu trữ không hợp lệ/);

  // Từ chối nội dung giả mạo không phải ảnh/PDF
  const fakeScriptB64 = Buffer.from('<script>alert(1)</script>', 'utf8').toString('base64');
  assert.throws(() => {
    saveBase64Upload({ base64Data: fakeScriptB64, subFolder: 'attachments' });
  }, /Định dạng tệp không được phép/);
});

test('OneStop PDF & Verification: Tạo PDF hợp lệ và chống XSS trên trang xác thực công khai', () => {
  const cert = generateSimpleCertificatePdf({
    requestCode: 'MC-2026-0099',
    verifyQrCode: 'TUAF-TESTVERIFY123456',
    serviceName: 'Cấp Giấy xác nhận sinh viên',
    studentFullName: 'Nguyễn Văn Sinh Viên',
    studentUsername: 'DTN001',
    studentClass: 'K55-CNTT',
    department: 'Phòng Công tác HSSV',
  });

  assert.ok(cert.fileUrl.endsWith('.pdf'));
  const diskPath = path.resolve(__dirname, '..', 'public', cert.fileUrl.replace(/^\/+/, ''));
  assert.ok(fs.existsSync(diskPath));
  const content = fs.readFileSync(diskPath, 'utf8');
  assert.ok(content.startsWith('%PDF-1.4'));
  fs.unlinkSync(diskPath);

  // Kiểm tra chống XSS trong renderVerificationPageHtml
  const html = renderVerificationPageHtml({
    request: {
      requestCode: 'MC-2026-0099',
      verifyQrCode: 'TUAF-TESTVERIFY123456',
      serviceName: 'Cấp Giấy <script>alert("xss")</script>',
      studentFullName: '<img src=x onerror=alert(1)>',
      assignedDepartment: 'Phòng Công tác HSSV',
    },
  });
  assert.ok(!html.includes('<script>alert("xss")</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
});

test('OneStop Seeder: Chứa đủ 10 thủ tục hành chính (4 mở sẵn Giai đoạn 1 và 6 sẵn sàng cho Giai đoạn 2)', () => {
  assert.equal(INITIAL_SERVICES.length, 10);
  const activePhase1 = INITIAL_SERVICES.filter((s) => s.isActive);
  const inactivePhase2 = INITIAL_SERVICES.filter((s) => !s.isActive);
  assert.equal(activePhase1.length, 4);
  assert.equal(inactivePhase2.length, 6);
});

test('OneStop RBAC: Phân quyền chính xác Giảng viên thường vs Chuyên viên phòng ban phụ trách thủ tục', () => {
  assert.deepEqual(parseAssigneeUsernames(' NTL158 , dtn002; cthssv@tuaf.edu.vn '), [
    'ntl158',
    'dtn002',
    'cthssv@tuaf.edu.vn',
  ]);

  const serviceCthssv = {
    id: 1,
    code: 'GXN_SV',
    assigneeUserId: 12,
    assigneeUsername: 'NTL158, cthssv@tuaf.edu.vn',
  };

  // 1. Giảng viên thông thường không nằm trong danh sách phụ trách -> bị từ chối (false)
  const regularLecturer = {
    id: 99,
    username: 'GV_THUONG_01',
    email: 'gv01@tuaf.edu.vn',
    role: 'lecturer',
  };
  assert.equal(isStaffAssignedToService(regularLecturer, serviceCthssv), false);

  // 2. Chuyên viên phòng ban được gán theo username (không phân biệt hoa thường) -> được phép (true)
  const assignedStaffByUsername = {
    id: 50,
    username: 'ntl158',
    email: 'other@tuaf.edu.vn',
    role: 'lecturer',
  };
  assert.equal(isStaffAssignedToService(assignedStaffByUsername, serviceCthssv), true);

  // 3. Chuyên viên phòng ban được gán theo email hoặc assigneeUserId -> được phép (true)
  const assignedStaffByEmail = {
    id: 77,
    username: 'CB_CTHSSV',
    email: 'CTHSSV@tuaf.edu.vn',
    role: 'lecturer',
  };
  assert.equal(isStaffAssignedToService(assignedStaffByEmail, serviceCthssv), true);

  const assignedStaffById = {
    id: 12,
    username: 'ANOTHER_USER',
    role: 'staff',
  };
  assert.equal(isStaffAssignedToService(assignedStaffById, serviceCthssv), true);
});
