const express = require('express');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ServiceCatalog = require('../models/ServiceCatalog');
const ServiceRequest = require('../models/ServiceRequest');
const ServiceRequestLog = require('../models/ServiceRequestLog');
const authMiddleware = require('../middleware/auth');
const { adminLocalGuard } = require('../middleware/adminAuth');
const { calculateBusinessDeadline, evaluateSlaStatus } = require('../utils/slaCalculator');
const {
  formatRequestCode,
  generateVerifyQrCode,
  generatePickupQrCode,
  buildVietQrPaymentInfo,
  saveBase64Upload,
} = require('../utils/oneStopHelpers');
const { generateSimpleCertificatePdf } = require('../services/oneStopPdfService');
const {
  notifyNewRequest,
  notifyReceiptUploaded,
  notifyStudentStatusUpdate,
  notifyOverdueExplanationSubmitted,
  sendWeeklyOneStopDigestEmail,
} = require('../services/oneStopNotificationService');
const { scanOneStopSla } = require('../jobs/oneStopSlaJob');
const tuafQueries = require('../services/tuafQueries');
const { getPool } = require('../services/namvietConnector');
const { createLecturerAccess } = require('../middleware/requireHomeroom');

const { requireHomeroomOf } = createLecturerAccess({ getPool, tuafQueries });

const router = express.Router();
const adminRouter = express.Router();

/**
 * Tách danh sách mã tài khoản cán bộ được phân công trên thủ tục (VD: "cthssv01, xuanhoatrieu")
 */
function parseAssigneeUsernames(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Kiểm tra một tài khoản User có phải là Chuyên viên được phân công phụ trách thủ tục `service` hay không
 */
function isStaffAssignedToService(user, service) {
  if (!user || !service) return false;
  if (user.role === 'admin') return true;
  if (service.assigneeUserId && String(service.assigneeUserId) === String(user.id)) {
    return true;
  }
  const assignedList = parseAssigneeUsernames(service.assigneeUsername);
  const uname = String(user.username || '').trim().toLowerCase();
  if (uname && assignedList.includes(uname)) {
    return true;
  }
  const uemail = String(user.email || '').trim().toLowerCase();
  if (uemail) {
    if (assignedList.includes(uemail)) return true;
    const assignedEmailList = parseAssigneeUsernames(service.assigneeEmail);
    if (assignedEmailList.includes(uemail)) return true;
  }
  return false;
}

/**
 * Middleware: Cho phép xác thực JWT tùy chọn (dùng cho endpoint vừa hỗ trợ SV đăng nhập vừa hỗ trợ Cựu SV)
 */
async function optionalAuth(req, _res, next) {
  try {
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      if (user) {
        req.user = user;
      }
    }
  } catch (_e) {
    // Bỏ qua nếu token không hợp lệ ở route tùy chọn
  }
  next();
}

/**
 * Middleware: Cho phép Cán bộ xử lý (Giảng viên / Chuyên viên / Thanh tra có JWT hợp lệ HOẶC Admin có x-admin-key)
 */
async function staffOrAdminGuard(req, res, next) {
  const secretKey = process.env.ADMIN_SECRET_KEY || 'tuafadmin2026';
  const providedKey = req.query.key || req.headers['x-admin-key'];
  if (providedKey && String(providedKey).trim() === secretKey) {
    req.isAdminPortal = true;
    req.staffActor = {
      id: null,
      fullName: req.headers['x-actor-name']
        ? String(req.headers['x-actor-name']).slice(0, 120)
        : 'Quản trị viên Một cửa',
      role: 'admin',
    };
    return next();
  }

  // Kiểm tra JWT
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Yêu cầu đăng nhập tài khoản Cán bộ hoặc xác thực Quản trị viên!',
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản không tồn tại hoặc phiên đăng nhập đã hết hạn!',
      });
    }

    if (!['lecturer', 'inspector', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Chỉ Cán bộ / Chuyên viên / Quản trị viên mới có quyền xử lý hồ sơ Một cửa!',
      });
    }

    req.user = user;
    req.staffActor = {
      id: user.id,
      fullName: user.fullName || user.username,
      role: user.role === 'admin' ? 'admin' : 'staff',
    };

    if (user.role === 'admin') {
      req.staffAllowedServiceIds = null; // Admin có toàn quyền trên mọi thủ tục
      return next();
    }

    // Kiểm tra danh sách thủ tục mà Cán bộ / Chuyên viên này được Admin gán phụ trách
    const allServices = await ServiceCatalog.findAll();
    const allowedServiceIds = allServices
      .filter((srv) => isStaffAssignedToService(user, srv))
      .map((srv) => srv.id);

    const directAssignedCount = await ServiceRequest.count({
      where: { assignedTo: user.id },
    });

    if (allowedServiceIds.length === 0 && directAssignedCount === 0) {
      return res.status(403).json({
        success: false,
        code: 'NOT_ASSIGNED_ONESTOP_STAFF',
        message:
          'Tài khoản của bạn chưa được phân công phụ trách thủ tục Một cửa nào. Vui lòng liên hệ Quản trị viên để được gán quyền thụ lý!',
      });
    }

    req.staffAllowedServiceIds = allowedServiceIds;
    return next();
  } catch (_err) {
    return res.status(401).json({
      success: false,
      message: 'Token xác thực không hợp lệ hoặc đã hết hạn!',
    });
  }
}

/**
 * Helper: Làm giàu thông tin SLA & VietQR cho đối tượng ServiceRequest trả về client
 */
function enrichRequestPayload(requestInstance, serviceInstance = null) {
  if (!requestInstance) return null;
  const plain =
    typeof requestInstance.toJSON === 'function' ? requestInstance.toJSON() : { ...requestInstance };
  const service =
    serviceInstance ||
    plain.service ||
    null;

  const slaStatus = evaluateSlaStatus(plain);
  let paymentInfo = null;
  if (Number(plain.feeAmount || 0) > 0 && plain.paymentStatus !== 'not_required') {
    paymentInfo = buildVietQrPaymentInfo({
      requestCode: plain.requestCode,
      studentUsername: plain.studentUsername || plain.nationalId || 'SV',
      feeAmount: plain.feeAmount,
      bankAccountInfo: service?.bankAccountInfo || null,
    });
  }

  return {
    ...plain,
    pickupLocation: plain.trayLocation || service?.pickupLocation || '',
    slaStatus,
    paymentInfo,
  };
}

/**
 * Helper: Tra cứu Số điện thoại & Email của sinh viên đang theo học từ CSDL TUAF (STU_HoSoSinhVien)
 * kèm fallback từ hồ sơ Một cửa gần nhất của sinh viên trong PostgreSQL
 */
async function resolveStudentContactFromDb(user) {
  if (!user) return { phone: '', email: '', className: '' };
  let phone = String(user.phone || '').trim();
  let email = String(user.email || '').trim();
  let className = String(user.className || '').trim();

  const username = String(user.username || '').trim();
  if ((!phone || !email) && username) {
    try {
      const pool = await getPool().catch(() => null);
      if (pool) {
        const sql = require('mssql');
        const req = pool.request();
        let row = null;
        if (user.tuafStudentId) {
          req.input('idSv', sql.UniqueIdentifier, user.tuafStudentId);
          const r = await req.query(`
            SELECT TOP 1 Dienthoai_canhan, Dienthoai_canhan2, Dien_thoai_NR, Email, EmailTruong, Ma_lop
            FROM STU_HoSoSinhVien
            WHERE ID_sv = @idSv
          `);
          row = r.recordset?.[0] || null;
        }
        if (!row) {
          const req2 = pool.request();
          req2.input('maSv', sql.NVarChar(50), username);
          const r2 = await req2.query(`
            SELECT TOP 1 Dienthoai_canhan, Dienthoai_canhan2, Dien_thoai_NR, Email, EmailTruong, Ma_lop
            FROM STU_HoSoSinhVien
            WHERE UPPER(Ma_sv) = UPPER(@maSv)
          `);
          row = r2.recordset?.[0] || null;
        }
        if (row) {
          const dbPhone = String(
            row.Dienthoai_canhan || row.Dienthoai_canhan2 || row.Dien_thoai_NR || ''
          ).trim();
          const dbEmail = String(row.Email || row.EmailTruong || '').trim();
          const dbClass = String(row.Ma_lop || '').trim();
          if (!phone && dbPhone) phone = dbPhone;
          if (!email && dbEmail) email = dbEmail;
          if ((!className || className === 'Chua cap nhat') && dbClass) className = dbClass;
        }
      }
    } catch (_err) {
      // Bỏ qua lỗi kết nối SQL Server, chuyển sang fallback PostgreSQL
    }
  }

  // Fallback từ hồ sơ Một cửa gần nhất của sinh viên trong PostgreSQL
  if ((!phone || !email) && (user.id || username)) {
    try {
      const latestReq = await ServiceRequest.findOne({
        where: {
          [Op.or]: [
            ...(user.id ? [{ studentUserId: user.id }] : []),
            ...(username ? [{ studentUsername: username }] : []),
          ],
        },
        order: [['createdAt', 'DESC']],
      });
      if (latestReq) {
        if (!phone && latestReq.studentPhone) phone = String(latestReq.studentPhone).trim();
        if (!email && latestReq.studentEmail) email = String(latestReq.studentEmail).trim();
        if (!className && latestReq.studentClass) className = String(latestReq.studentClass).trim();
      }
    } catch (_err) {
      // Ignore
    }
  }

  return { phone, email, className };
}

/**
 * Helper: Kiểm tra quyền sở hữu hồ sơ của Sinh viên hoặc Cựu sinh viên
 */
function canAccessStudentRequest(req, requestRow) {
  if (!requestRow) return false;
  if (req.user) {
    if (
      (requestRow.studentUserId && String(requestRow.studentUserId) === String(req.user.id)) ||
      (requestRow.studentUsername &&
        String(requestRow.studentUsername).toLowerCase() ===
          String(req.user.username || '').toLowerCase())
    ) {
      return true;
    }
    if (['lecturer', 'inspector', 'admin'].includes(req.user.role)) {
      return true;
    }
  }

  // Cho phép tra cứu công khai đối với Cựu SV hoặc khi cung cấp đúng mã định danh
  const identifier = String(
    req.query.identifier || req.body?.identifier || req.headers['x-student-identifier'] || ''
  ).trim();
  if (identifier) {
    const lowerId = identifier.toLowerCase();
    if (
      (requestRow.studentUsername && requestRow.studentUsername.toLowerCase() === lowerId) ||
      (requestRow.nationalId && requestRow.nationalId.toLowerCase() === lowerId) ||
      (requestRow.studentPhone && requestRow.studentPhone.toLowerCase() === lowerId)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Helper: Sinh mã hồ sơ kế tiếp trong năm hiện tại (VD: MC-2026-0001)
 */
async function generateNextRequestCode() {
  const year = new Date().getFullYear();
  const prefix = `MC-${year}-`;
  const latest = await ServiceRequest.findOne({
    where: {
      requestCode: { [Op.like]: `${prefix}%` },
    },
    order: [['id', 'DESC']],
  });

  let nextSeq = 1;
  if (latest && latest.requestCode) {
    const parts = String(latest.requestCode).split('-');
    const lastNum = parseInt(parts[2], 10);
    if (!Number.isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = formatRequestCode(year, nextSeq + attempt);
    const exists = await ServiceRequest.findOne({ where: { requestCode: candidate } });
    if (!exists) return candidate;
  }
  return `MC-${year}-${Date.now().toString().slice(-5)}`;
}

// ============================================================================
// 1. PUBLIC & STUDENT ENDPOINTS (/api/services/*)
// ============================================================================

function normalizeDeliveryKey(opt) {
  if (opt === 'digital') return 'digital_pdf';
  if (opt === 'physical_pickup') return 'office_pickup';
  return opt;
}

function isAttachmentRequired(val) {
  return val === true || val === 'true' || val === 'required';
}

function normalizeServicePayload(srvInstance) {
  if (!srvInstance) return null;
  const plain =
    typeof srvInstance.toJSON === 'function' ? srvInstance.toJSON() : { ...srvInstance };
  plain.pickupLocation = String(plain.pickupLocation || '').trim();
  if (Array.isArray(plain.deliveryOptions)) {
    plain.deliveryOptions = plain.deliveryOptions.map(normalizeDeliveryKey);
  }
  if (Array.isArray(plain.formSchema)) {
    plain.formSchema = plain.formSchema
      .filter((f) => {
        const fKey = f?.name || f?.key;
        return fKey !== 'graduationYear';
      })
      .map((f) =>
        f && typeof f === 'object'
          ? { ...f, name: f.name || f.key, key: f.key || f.name }
          : f
      );
  }
  return plain;
}

/**
 * GET /api/services
 * Lấy danh sách thủ tục đang mở (có thể lọc ?alumni=true hoặc ?department=...)
 * Nếu sinh viên đã đăng nhập, trả kèm studentContact (phone, email, className) từ CSDL TUAF
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const where = { isActive: true };
    if (req.query.alumni === 'true' || req.query.alumni === '1') {
      where.allowAlumni = true;
    }
    if (req.query.department) {
      where.department = String(req.query.department).trim();
    }

    const services = await ServiceCatalog.findAll({
      where,
      order: [
        ['displayOrder', 'ASC'],
        ['id', 'ASC'],
      ],
    });

    const studentContact = req.user ? await resolveStudentContactFromDb(req.user) : null;

    res.json({
      success: true,
      data: services.map(normalizeServicePayload),
      ...(studentContact ? { studentContact } : {}),
    });
  } catch (error) {
    console.error('❌ [OneStop] GET /api/services error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi tải danh sách thủ tục hành chính Một cửa!',
    });
  }
});

/**
 * GET /api/services/public/track
 * Cổng Cựu sinh viên / Công khai tra cứu tiến độ bằng Mã hồ sơ + Mã SV/CCCD/SĐT
 */
router.get('/public/track', async (req, res) => {
  try {
    const requestCode = String(req.query.requestCode || '')
      .trim()
      .toUpperCase();
    const identifier = String(req.query.identifier || '').trim();

    if (!requestCode || !identifier) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Mã hồ sơ (VD: MC-2026-0001) và Mã SV / CCCD / SĐT!',
      });
    }

    const requestRow = await ServiceRequest.findOne({
      where: { requestCode },
      include: [
        { model: ServiceCatalog, as: 'service' },
        {
          model: ServiceRequestLog,
          as: 'logs',
          separate: true,
          order: [['createdAt', 'ASC']],
        },
      ],
    });

    if (!requestRow) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ với mã đã nhập!',
      });
    }

    if (!canAccessStudentRequest(req, requestRow)) {
      return res.status(403).json({
        success: false,
        message: 'Thông tin Mã SV / CCCD / Số điện thoại không khớp với hồ sơ này!',
      });
    }

    return res.json({
      success: true,
      data: enrichRequestPayload(requestRow, requestRow.service),
    });
  } catch (error) {
    console.error('❌ [OneStop] GET /public/track error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tra cứu hồ sơ Một cửa!',
    });
  }
});

/**
 * GET /api/services/verify/:code
 * API JSON xác thực mã QR văn bản điện tử
 */
router.get('/verify/:code', async (req, res) => {
  try {
    const verifyQrCode = String(req.params.code || '').trim();
    if (!verifyQrCode) {
      return res.status(400).json({
        success: false,
        message: 'Mã xác thực không hợp lệ!',
      });
    }

    const requestRow = await ServiceRequest.findOne({
      where: { verifyQrCode },
      include: [{ model: ServiceCatalog, as: 'service' }],
    });

    if (!requestRow) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Không tìm thấy văn bản ứng với mã QR này!',
      });
    }

    return res.json({
      success: true,
      verified: true,
      data: {
        requestCode: requestRow.requestCode,
        verifyQrCode: requestRow.verifyQrCode,
        serviceName: requestRow.serviceName,
        department: requestRow.assignedDepartment,
        studentFullName: requestRow.studentFullName,
        studentUsername: requestRow.studentUsername,
        studentClass: requestRow.studentClass,
        status: requestRow.status,
        completedAt: requestRow.completedAt,
        resultPdfUrl: requestRow.resultPdfUrl,
      },
    });
  } catch (error) {
    console.error('❌ [OneStop] GET /verify/:code error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực văn bản điện tử!',
    });
  }
});

/**
 * POST /api/services/requests
 * Tạo yêu cầu thủ tục mới (Dành cho Sinh viên đã đăng nhập hoặc Cựu sinh viên qua cổng /onegate)
 */
router.post('/requests', optionalAuth, async (req, res) => {
  try {
    const {
      serviceId,
      serviceCode,
      formData = {},
      deliveryMethod = 'digital_pdf',
      postalAddress = '',
      studentPhone = '',
      studentEmail = '',
      attachmentsBase64 = [],
      isAlumni = false,
      studentFullName = '',
      studentUsername = '',
      studentClass = '',
      studentFaculty = '',
      nationalId = '',
      graduationYear = '',
    } = req.body || {};

    // 1. Tìm thủ tục
    const service = await ServiceCatalog.findOne({
      where: serviceId ? { id: serviceId } : { code: String(serviceCode || '').trim() },
    });

    if (!service || !service.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Thủ tục hành chính không tồn tại hoặc đang tạm ngưng tiếp nhận!',
      });
    }

    // 2. Xác định người nộp (Sinh viên đăng nhập vs Cựu sinh viên)
    const isAlumniRequest = Boolean(isAlumni) || !req.user;
    if (isAlumniRequest && !service.allowAlumni) {
      return res.status(403).json({
        success: false,
        message: 'Thủ tục này yêu cầu đăng nhập tài khoản Sinh viên chính quy trên ứng dụng!',
      });
    }

    const finalFullName = String(
      (req.user ? req.user.fullName : studentFullName) || studentFullName || ''
    ).trim();
    const finalUsername = String(
      (req.user ? req.user.username : studentUsername) || studentUsername || ''
    ).trim();
    const finalNationalId = String(nationalId || '').trim();
    let finalPhone = String(studentPhone || req.user?.phone || '').trim();
    let finalEmail = String(studentEmail || req.user?.email || '').trim();
    let resolvedClass = String(req.user?.className || studentClass || '').trim();

    if (req.user && (!finalPhone || !finalEmail || !resolvedClass || resolvedClass === 'Chua cap nhat')) {
      const dbContact = await resolveStudentContactFromDb(req.user);
      if (!finalPhone && dbContact.phone) finalPhone = dbContact.phone;
      if (!finalEmail && dbContact.email) finalEmail = dbContact.email;
      if ((!resolvedClass || resolvedClass === 'Chua cap nhat') && dbContact.className) {
        resolvedClass = dbContact.className;
      }
    }

    if (!finalFullName) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ Họ và tên người làm thủ tục!',
      });
    }

    if (isAlumniRequest && (!finalNationalId || !finalPhone || !finalEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Cựu sinh viên vui lòng nhập đầy đủ Số CCCD/CMND, Số điện thoại và Email nhận kết quả!',
      });
    }

    // 3. Kiểm tra hình thức nhận kết quả hợp lệ
    const allowedDelivery = Array.isArray(service.deliveryOptions)
      ? service.deliveryOptions.map(normalizeDeliveryKey)
      : ['digital_pdf', 'office_pickup'];
    const normalizedRequestedDelivery = normalizeDeliveryKey(deliveryMethod);
    const chosenDelivery = allowedDelivery.includes(normalizedRequestedDelivery)
      ? normalizedRequestedDelivery
      : allowedDelivery[0] || 'digital_pdf';

    if (chosenDelivery === 'postal_delivery' && !String(postalAddress || '').trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập địa chỉ nhận thư bảo đảm qua Bưu điện!',
      });
    }

    // 4. Kiểm tra các trường bắt buộc trong formSchema (bỏ qua graduationYear vì SV đang học)
    const schemaFields = Array.isArray(service.formSchema) ? service.formSchema : [];
    const sanitizedFormData = {};
    for (const field of schemaFields) {
      const fieldName = field.name || field.key;
      if (fieldName === 'graduationYear') continue;
      const val = formData ? (formData[fieldName] ?? formData[field.key]) : undefined;
      if (field.required && (val === undefined || val === null || String(val).trim() === '')) {
        return res.status(400).json({
          success: false,
          message: `Vui lòng điền thông tin bắt buộc: ${field.label || fieldName}!`,
        });
      }
      if (val !== undefined && fieldName) {
        sanitizedFormData[fieldName] = val;
      }
    }

    // Bảo toàn thêm các ghi chú bổ sung nếu có
    if (formData && formData.extraNote) {
      sanitizedFormData.extraNote = String(formData.extraNote).slice(0, 1000);
    }

    // 5. Xử lý tệp đính kèm (nếu có)
    const savedAttachments = [];
    if (Array.isArray(attachmentsBase64) && attachmentsBase64.length > 0) {
      if (attachmentsBase64.length > 5) {
        return res.status(400).json({
          success: false,
          message: 'Tối đa 5 tệp minh chứng đính kèm cho mỗi hồ sơ!',
        });
      }
      for (const item of attachmentsBase64) {
        const base64Str = typeof item === 'string' ? item : item?.base64 || item?.data;
        if (base64Str) {
          const uploaded = saveBase64Upload({
            base64Data: base64Str,
            subFolder: 'attachments',
          });
          savedAttachments.push({
            url: uploaded.fileUrl,
            name: (typeof item === 'object' && item?.name) || uploaded.fileName,
            size: uploaded.sizeBytes,
          });
        }
      }
    }

    if (
      isAttachmentRequired(service.requiresAttachment) &&
      savedAttachments.length === 0 &&
      (isAlumniRequest || req.body?.enforceAttachment)
    ) {
      return res.status(400).json({
        success: false,
        message: `Thủ tục này bắt buộc đính kèm minh chứng (${
          service.attachmentGuide || 'Ảnh chụp hoặc PDF'
        })!`,
      });
    }

    // 6. Tính lệ phí (Bao gồm số bản nếu có trường copies + phí bưu điện nếu chọn postal_delivery)
    const copies = Math.max(1, parseInt(sanitizedFormData.copies, 10) || 1);
    const baseFee = service.isPaid ? (Number(service.feeAmount) || 0) * copies : 0;
    const postalFee =
      chosenDelivery === 'postal_delivery' ? Number(service.postalFeeAmount) || 0 : 0;
    const totalFee = baseFee + postalFee;

    const initialStatus = totalFee > 0 ? 'pending_payment' : 'submitted';
    const initialPaymentStatus = totalFee > 0 ? 'unpaid' : 'not_required';

    // 7. Tính SLA Deadline (chỉ tính giờ hành chính T2-T6, trừ T7 & CN)
    const submittedAt = new Date();
    const deadlineAt = calculateBusinessDeadline(submittedAt, service.slaHours || 24);
    const requestCode = await generateNextRequestCode();

    const created = await ServiceRequest.create({
      requestCode,
      serviceId: service.id,
      serviceName: service.name,
      studentUserId: req.user ? req.user.id : null,
      studentUsername: finalUsername || null,
      studentFullName: finalFullName,
      studentEmail: finalEmail || null,
      studentPhone: finalPhone || null,
      studentClass: resolvedClass || null,
      studentFaculty: String(req.user?.department || studentFaculty || '').trim() || null,
      isAlumni: isAlumniRequest,
      nationalId: finalNationalId || null,
      graduationYear: String(graduationYear || '').trim() || null,
      formData: sanitizedFormData,
      attachments: savedAttachments,
      deliveryMethod: chosenDelivery,
      postalAddress: chosenDelivery === 'postal_delivery' ? String(postalAddress).trim() : null,
      status: initialStatus,
      assignedDepartment: service.department,
      assignedTo: service.assigneeUserId || null,
      assignedStaffName: service.assigneeName || null,
      submittedAt,
      deadlineAt,
      feeAmount: totalFee,
      paymentStatus: initialPaymentStatus,
    });

    await ServiceRequestLog.create({
      requestId: created.id,
      actorId: req.user ? req.user.id : null,
      actorName: finalFullName,
      actorRole: isAlumniRequest ? 'alumni' : 'student',
      fromStatus: null,
      toStatus: initialStatus,
      action: 'SUBMIT_REQUEST',
      note:
        totalFee > 0
          ? `Khởi tạo hồ sơ #${requestCode} (Cần nộp lệ phí ${totalFee.toLocaleString('vi-VN')}đ)`
          : `Nộp hồ sơ trực tuyến #${requestCode}`,
    });

    // 8. Thông báo cho cán bộ thụ lý nếu không vướng chờ nộp phí
    if (initialStatus === 'submitted') {
      await notifyNewRequest(created, service);
    }

    const fullRequest = await ServiceRequest.findByPk(created.id, {
      include: [
        { model: ServiceCatalog, as: 'service' },
        { model: ServiceRequestLog, as: 'logs' },
      ],
    });

    return res.status(201).json({
      success: true,
      message:
        totalFee > 0
          ? 'Đăng ký hồ sơ thành công! Vui lòng quét mã VietQR để thanh toán lệ phí và tải ảnh biên lai.'
          : 'Nộp hồ sơ thành công! Bạn có thể theo dõi tiến độ xử lý trực tuyến.',
      data: enrichRequestPayload(fullRequest, service),
    });
  } catch (error) {
    console.error('❌ [OneStop] POST /requests error:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Lỗi tạo hồ sơ Một cửa!',
    });
  }
});

/**
 * GET /api/services/my-requests
 * Lấy danh sách hồ sơ của Sinh viên đang đăng nhập
 */
router.get('/my-requests', authMiddleware, async (req, res) => {
  try {
    const whereClause = {
      [Op.or]: [
        { studentUserId: req.user.id },
        ...(req.user.username ? [{ studentUsername: req.user.username }] : []),
      ],
    };

    if (req.query.status) {
      whereClause.status = String(req.query.status).trim();
    }

    const rows = await ServiceRequest.findAll({
      where: whereClause,
      include: [
        { model: ServiceCatalog, as: 'service' },
        {
          model: ServiceRequestLog,
          as: 'logs',
          separate: true,
          order: [['createdAt', 'ASC']],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    const enriched = rows.map((r) => enrichRequestPayload(r, r.service));
    const studentContact = await resolveStudentContactFromDb(req.user);
    return res.json({
      success: true,
      data: enriched,
      studentContact,
    });
  } catch (error) {
    console.error('❌ [OneStop] GET /my-requests error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải danh sách hồ sơ của bạn!',
    });
  }
});

/**
 * GET /api/services/requests/:id
 * Xem chi tiết 1 hồ sơ kèm timeline, SLA và VietQR
 */
router.get('/requests/:id', optionalAuth, async (req, res) => {
  try {
    const requestRow = await ServiceRequest.findByPk(req.params.id, {
      include: [
        { model: ServiceCatalog, as: 'service' },
        {
          model: ServiceRequestLog,
          as: 'logs',
          separate: true,
          order: [['createdAt', 'ASC']],
        },
      ],
    });

    if (!requestRow) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ!',
      });
    }

    if (!canAccessStudentRequest(req, requestRow)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập hồ sơ này!',
      });
    }

    return res.json({
      success: true,
      data: enrichRequestPayload(requestRow, requestRow.service),
    });
  } catch (error) {
    console.error('❌ [OneStop] GET /requests/:id error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải chi tiết hồ sơ!',
    });
  }
});

/**
 * POST /api/services/requests/:id/upload-receipt
 * Sinh viên / Cựu sinh viên tải lên ảnh chụp màn hình biên lai chuyển khoản VietQR
 * hoặc nộp bổ sung minh chứng khi hồ sơ ở trạng thái need_more_info
 */
router.post('/requests/:id/upload-receipt', optionalAuth, async (req, res) => {
  try {
    const requestRow = await ServiceRequest.findByPk(req.params.id, {
      include: [{ model: ServiceCatalog, as: 'service' }],
    });

    if (!requestRow) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ!',
      });
    }

    if (!canAccessStudentRequest(req, requestRow)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền cập nhật hồ sơ này!',
      });
    }

    const { receiptBase64, supplementaryBase64, note = '' } = req.body || {};

    // Trường hợp 1: Bổ sung hồ sơ khi trạng thái là need_more_info
    if (supplementaryBase64 || requestRow.status === 'need_more_info') {
      const prevStatus = requestRow.status;
      const currentAttachments = Array.isArray(requestRow.attachments)
        ? [...requestRow.attachments]
        : [];

      if (supplementaryBase64) {
        const uploaded = saveBase64Upload({
          base64Data: supplementaryBase64,
          subFolder: 'attachments',
        });
        currentAttachments.push({
          url: uploaded.fileUrl,
          name: uploaded.fileName,
          size: uploaded.sizeBytes,
        });
      }

      const nextStatus =
        Number(requestRow.feeAmount || 0) > 0 && requestRow.paymentStatus !== 'confirmed'
          ? 'payment_review'
          : 'submitted';

      requestRow.attachments = currentAttachments;
      requestRow.status = nextStatus;
      if (note) {
        requestRow.formData = {
          ...(requestRow.formData || {}),
          studentSupplementNote: String(note).slice(0, 1000),
        };
      }
      await requestRow.save();

      await ServiceRequestLog.create({
        requestId: requestRow.id,
        actorId: req.user ? req.user.id : null,
        actorName: requestRow.studentFullName,
        actorRole: requestRow.isAlumni ? 'alumni' : 'student',
        fromStatus: prevStatus,
        toStatus: nextStatus,
        action: 'SUPPLEMENT_INFO',
        note: note || 'Sinh viên đã bổ sung minh chứng / thông tin theo yêu cầu.',
      });

      await notifyNewRequest(requestRow, requestRow.service);

      return res.json({
        success: true,
        message: 'Đã gửi bổ sung thông tin hồ sơ thành công!',
        data: enrichRequestPayload(requestRow, requestRow.service),
      });
    }

    // Trường hợp 2: Tải ảnh biên lai thanh toán VietQR
    if (!receiptBase64) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ảnh chụp màn hình biên lai chuyển khoản để tải lên!',
      });
    }

    const uploadedReceipt = saveBase64Upload({
      base64Data: receiptBase64,
      subFolder: 'receipts',
    });

    const prevStatus = requestRow.status;
    requestRow.paymentProofUrl = uploadedReceipt.fileUrl;
    requestRow.paymentStatus = 'pending_review';
    requestRow.status = 'payment_review';
    await requestRow.save();

    await ServiceRequestLog.create({
      requestId: requestRow.id,
      actorId: req.user ? req.user.id : null,
      actorName: requestRow.studentFullName,
      actorRole: requestRow.isAlumni ? 'alumni' : 'student',
      fromStatus: prevStatus,
      toStatus: 'payment_review',
      action: 'UPLOAD_RECEIPT',
      note: note
        ? `Tải lên biên lai chuyển khoản: ${String(note).slice(0, 300)}`
        : 'Đã tải lên ảnh biên lai chuyển khoản lệ phí.',
      attachments: [uploadedReceipt.fileUrl],
    });

    await notifyReceiptUploaded(requestRow, requestRow.service);

    return res.json({
      success: true,
      message: 'Đã tải lên biên lai lệ phí! Cán bộ phụ trách sẽ đối soát và xử lý hồ sơ của bạn.',
      data: enrichRequestPayload(requestRow, requestRow.service),
    });
  } catch (error) {
    console.error('❌ [OneStop] POST /requests/:id/upload-receipt error:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Lỗi tải lên tệp minh chứng / biên lai!',
    });
  }
});

/**
 * POST /api/services/requests/:id/cancel
 * Sinh viên hủy yêu cầu khi cán bộ chưa xử lý
 */
router.post('/requests/:id/cancel', optionalAuth, async (req, res) => {
  try {
    const requestRow = await ServiceRequest.findByPk(req.params.id, {
      include: [{ model: ServiceCatalog, as: 'service' }],
    });

    if (!requestRow) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ!',
      });
    }

    if (!canAccessStudentRequest(req, requestRow)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền hủy hồ sơ này!',
      });
    }

    if (!['pending_payment', 'payment_review', 'submitted', 'need_more_info'].includes(requestRow.status)) {
      return res.status(400).json({
        success: false,
        message: 'Hồ sơ đang được xử lý hoặc đã hoàn tất nên không thể hủy!',
      });
    }

    const prevStatus = requestRow.status;
    requestRow.status = 'cancelled';
    await requestRow.save();

    await ServiceRequestLog.create({
      requestId: requestRow.id,
      actorId: req.user ? req.user.id : null,
      actorName: requestRow.studentFullName,
      actorRole: requestRow.isAlumni ? 'alumni' : 'student',
      fromStatus: prevStatus,
      toStatus: 'cancelled',
      action: 'CANCEL_REQUEST',
      note: req.body?.reason
        ? `Người nộp hủy yêu cầu: ${String(req.body.reason).slice(0, 300)}`
        : 'Người nộp chủ động hủy yêu cầu.',
    });

    return res.json({
      success: true,
      message: 'Đã hủy yêu cầu thủ tục thành công!',
      data: enrichRequestPayload(requestRow, requestRow.service),
    });
  } catch (error) {
    console.error('❌ [OneStop] POST /requests/:id/cancel error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi hủy hồ sơ!',
    });
  }
});

/**
 * POST /api/services/requests/:id/rate
 * Sinh viên đánh giá chất lượng phục vụ (1-5 sao + 3 tiêu chí)
 */
router.post('/requests/:id/rate', optionalAuth, async (req, res) => {
  try {
    const requestRow = await ServiceRequest.findByPk(req.params.id);
    if (!requestRow) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ!',
      });
    }

    if (!canAccessStudentRequest(req, requestRow)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền đánh giá hồ sơ này!',
      });
    }

    if (!['ready_for_pickup', 'completed'].includes(requestRow.status)) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể đánh giá sau khi hồ sơ đã có kết quả hoặc hoàn tất!',
      });
    }

    const ratingNum = parseInt(req.body?.rating, 10);
    if (Number.isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({
        success: false,
        message: 'Điểm đánh giá phải từ 1 đến 5 sao!',
      });
    }

    requestRow.rating = ratingNum;
    requestRow.ratingCriteria =
      req.body?.ratingCriteria && typeof req.body.ratingCriteria === 'object'
        ? req.body.ratingCriteria
        : {
            speed: ratingNum,
            attitude: ratingNum,
            clarity: ratingNum,
          };
    requestRow.ratingComment = req.body?.ratingComment
      ? String(req.body.ratingComment).slice(0, 1000)
      : null;
    await requestRow.save();

    await ServiceRequestLog.create({
      requestId: requestRow.id,
      actorId: req.user ? req.user.id : null,
      actorName: requestRow.studentFullName,
      actorRole: requestRow.isAlumni ? 'alumni' : 'student',
      fromStatus: requestRow.status,
      toStatus: requestRow.status,
      action: 'RATE_SERVICE',
      note: `Đánh giá ${ratingNum}/5 sao${
        requestRow.ratingComment ? `: "${requestRow.ratingComment}"` : ''
      }`,
    });

    return res.json({
      success: true,
      message: 'Cảm ơn bạn đã đánh giá chất lượng phục vụ Một cửa TUAF!',
      data: enrichRequestPayload(requestRow),
    });
  } catch (error) {
    console.error('❌ [OneStop] POST /requests/:id/rate error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi gửi đánh giá dịch vụ!',
    });
  }
});

// ============================================================================
// 2. STAFF WORKBENCH & HOMEROOM ENDPOINTS (/api/services/staff/* & /api/services/homeroom/*)
// ============================================================================

/**
 * GET /api/services/staff/my-role
 * Kiểm tra xem tài khoản Giảng viên / Cán bộ đang đăng nhập có được Admin gán làm
 * Chuyên viên thụ lý Một cửa hay không (để ẩn/hiện mục "Xử Lý Một Cửa" trên App Giảng viên)
 */
router.get('/staff/my-role', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!['lecturer', 'inspector', 'admin'].includes(user.role)) {
      return res.json({
        success: true,
        isAssignedStaff: false,
        assignedServices: [],
        pendingCount: 0,
      });
    }

    const allServices = await ServiceCatalog.findAll({
      order: [
        ['displayOrder', 'ASC'],
        ['id', 'ASC'],
      ],
    });

    const assignedServices =
      user.role === 'admin'
        ? allServices
        : allServices.filter((srv) => isStaffAssignedToService(user, srv));

    const assignedServiceIds = assignedServices.map((s) => s.id);
    let pendingCount = 0;

    if (user.role === 'admin' || assignedServiceIds.length > 0) {
      const wherePending = {
        status: { [Op.in]: ['payment_review', 'submitted', 'processing'] },
      };
      if (user.role !== 'admin') {
        wherePending[Op.or] = [
          { serviceId: { [Op.in]: assignedServiceIds } },
          { assignedTo: user.id },
        ];
      }
      pendingCount = await ServiceRequest.count({ where: wherePending });
    } else {
      const directCount = await ServiceRequest.count({
        where: {
          assignedTo: user.id,
          status: { [Op.in]: ['payment_review', 'submitted', 'processing'] },
        },
      });
      pendingCount = directCount;
    }

    const isAssignedStaff =
      user.role === 'admin' || assignedServices.length > 0 || pendingCount > 0;

    return res.json({
      success: true,
      isAssignedStaff,
      assignedServices: assignedServices.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        department: s.department,
      })),
      pendingCount,
    });
  } catch (error) {
    console.error('❌ [OneStop] GET /staff/my-role error:', error.message);
    return res.status(500).json({
      success: false,
      isAssignedStaff: false,
      assignedServices: [],
      pendingCount: 0,
    });
  }
});

/**
 * GET /api/services/homeroom/:idLop/requests
 * Giáo viên chủ nhiệm (GVCN) xem danh sách hồ sơ Một cửa của sinh viên thuộc lớp mình chủ nhiệm
 */
router.get('/homeroom/:idLop/requests', authMiddleware, requireHomeroomOf, async (req, res) => {
  try {
    const { pool, idLop } = req.homeroom;
    const regResult = await tuafQueries.getHomeroomStudentsRegistration(
      pool,
      idLop,
      1,
      '2026-2027'
    );
    const students = regResult?.students || [];
    const studentCodes = students
      .map((s) => String(s.studentCode || '').trim())
      .filter(Boolean);
    const className = String(regResult?.className || '').trim();
    const classCode = String(regResult?.classCode || '').trim();

    const orConditions = [];
    if (studentCodes.length > 0) {
      orConditions.push({ studentUsername: { [Op.in]: studentCodes } });
    }
    if (className) {
      orConditions.push({ studentClass: { [Op.iLike]: `%${className}%` } });
    }
    if (classCode && classCode !== className) {
      orConditions.push({ studentClass: { [Op.iLike]: `%${classCode}%` } });
    }

    if (orConditions.length === 0) {
      return res.json({
        success: true,
        className,
        classCode,
        data: [],
      });
    }

    const rows = await ServiceRequest.findAll({
      where: { [Op.or]: orConditions },
      include: [
        { model: ServiceCatalog, as: 'service' },
        {
          model: ServiceRequestLog,
          as: 'logs',
          separate: true,
          order: [['createdAt', 'ASC']],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    return res.json({
      success: true,
      className,
      classCode,
      data: rows.map((r) => enrichRequestPayload(r, r.service)),
    });
  } catch (error) {
    console.error('❌ [OneStop] GET /homeroom/:idLop/requests error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách hồ sơ Một cửa của lớp chủ nhiệm!',
    });
  }
});

/**
 * POST /api/services/homeroom/:idLop/requests/:requestId/note
 * Giáo viên chủ nhiệm (GVCN) ghi ý kiến xác nhận / nhận xét vào hồ sơ Một cửa của sinh viên lớp mình
 */
router.post(
  '/homeroom/:idLop/requests/:requestId/note',
  authMiddleware,
  requireHomeroomOf,
  async (req, res) => {
    try {
      const { pool, idLop } = req.homeroom;
      const homeroomNote = String(req.body?.homeroomNote || '').trim();
      if (!homeroomNote) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập ý kiến xác nhận / nhận xét của Giáo viên chủ nhiệm!',
        });
      }

      const requestRow = await ServiceRequest.findByPk(req.params.requestId, {
        include: [{ model: ServiceCatalog, as: 'service' }],
      });
      if (!requestRow) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy hồ sơ Một cửa!',
        });
      }

      // Kiểm tra sinh viên có thực sự thuộc lớp chủ nhiệm idLop không
      if (requestRow.studentUsername) {
        const studentInClass = await tuafQueries.findStudentInClass(
          pool,
          idLop,
          requestRow.studentUsername
        );
        if (!studentInClass) {
          return res.status(403).json({
            success: false,
            message: 'Sinh viên của hồ sơ này không thuộc lớp bạn đang chủ nhiệm!',
          });
        }
      }

      const teacherName = req.user.fullName || req.user.username;
      requestRow.homeroomNote = homeroomNote.slice(0, 1000);
      requestRow.homeroomNotedBy = teacherName;
      requestRow.homeroomNotedAt = new Date();
      await requestRow.save();

      await ServiceRequestLog.create({
        requestId: requestRow.id,
        actorId: req.user.id,
        actorName: `GVCN ${teacherName}`,
        actorRole: 'staff',
        fromStatus: requestRow.status,
        toStatus: requestRow.status,
        action: 'HOMEROOM_NOTE',
        note: `[Ý kiến GVCN - ${teacherName}]: ${requestRow.homeroomNote}`,
      });

      return res.json({
        success: true,
        message: 'Đã lưu ý kiến xác nhận của Giáo viên chủ nhiệm vào hồ sơ!',
        data: enrichRequestPayload(requestRow, requestRow.service),
      });
    } catch (error) {
      console.error('❌ [OneStop] POST /homeroom/:idLop/requests/:requestId/note error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Lỗi lưu ý kiến Giáo viên chủ nhiệm!',
      });
    }
  }
);

/**
 * GET /api/services/staff/requests
 * Danh sách hồ sơ cần xử lý dành cho Cán bộ chuyên viên / Quản trị viên
 */
router.get('/staff/requests', staffOrAdminGuard, async (req, res) => {
  try {
    // Quét nhanh trạng thái SLA để đảm bảo cờ isOverdue chính xác theo thời gian thực
    await scanOneStopSla();

    const andConditions = [];
    // Nếu là Chuyên viên phòng ban (không phải Admin toàn trường), chỉ lọc đúng các thủ tục được giao phụ trách
    if (Array.isArray(req.staffAllowedServiceIds)) {
      const staffOr = [];
      if (req.staffAllowedServiceIds.length > 0) {
        staffOr.push({ serviceId: { [Op.in]: req.staffAllowedServiceIds } });
      }
      if (req.user?.id) {
        staffOr.push({ assignedTo: req.user.id });
      }
      andConditions.push({ [Op.or]: staffOr });
    }

    if (req.query.status) {
      andConditions.push({ status: String(req.query.status).trim() });
    }
    if (req.query.department) {
      andConditions.push({ assignedDepartment: String(req.query.department).trim() });
    }
    if (req.query.overdue === 'true' || req.query.overdue === '1') {
      andConditions.push({ isOverdue: true });
    }
    if (req.query.paymentStatus) {
      andConditions.push({ paymentStatus: String(req.query.paymentStatus).trim() });
    }
    if (req.query.search) {
      const q = `%${String(req.query.search).trim()}%`;
      andConditions.push({
        [Op.or]: [
          { requestCode: { [Op.iLike]: q } },
          { studentFullName: { [Op.iLike]: q } },
          { studentUsername: { [Op.iLike]: q } },
          { serviceName: { [Op.iLike]: q } },
        ],
      });
    }

    const where = andConditions.length > 0 ? { [Op.and]: andConditions } : {};

    const rows = await ServiceRequest.findAll({
      where,
      include: [
        { model: ServiceCatalog, as: 'service' },
        {
          model: ServiceRequestLog,
          as: 'logs',
          separate: true,
          order: [['createdAt', 'ASC']],
        },
      ],
      order: [
        ['isOverdue', 'DESC'],
        ['deadlineAt', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      limit: Math.min(200, Math.max(10, parseInt(req.query.limit, 10) || 100)),
    });

    const data = rows.map((r) => enrichRequestPayload(r, r.service));

    const stats = {
      total: data.length,
      pendingPayment: data.filter((r) => r.status === 'pending_payment').length,
      paymentReview: data.filter((r) => r.status === 'payment_review').length,
      submitted: data.filter((r) => r.status === 'submitted').length,
      processing: data.filter((r) => r.status === 'processing').length,
      readyForPickup: data.filter((r) => r.status === 'ready_for_pickup').length,
      completed: data.filter((r) => r.status === 'completed').length,
      overdue: data.filter((r) => r.isOverdue || r.slaStatus?.isOverdue).length,
      unexplainedOverdue: data.filter(
        (r) => (r.isOverdue || r.slaStatus?.isOverdue) && !r.overdueReason
      ).length,
    };

    return res.json({
      success: true,
      stats,
      data,
    });
  } catch (error) {
    console.error('❌ [OneStop] GET /staff/requests error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải danh sách hồ sơ cho cán bộ!',
    });
  }
});

/**
 * POST /api/services/staff/requests/:id/confirm-payment
 * Cán bộ xác nhận biên lai nộp lệ phí hợp lệ -> Chuyển sang submitted / processing & tính lại SLA từ thời điểm duyệt phí
 */
router.post('/staff/requests/:id/confirm-payment', staffOrAdminGuard, async (req, res) => {
  try {
    const requestRow = await ServiceRequest.findByPk(req.params.id, {
      include: [{ model: ServiceCatalog, as: 'service' }],
    });

    if (!requestRow) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ!',
      });
    }

    const prevStatus = requestRow.status;
    const now = new Date();
    const slaHours = requestRow.service?.slaHours || 24;

    requestRow.paymentStatus = 'confirmed';
    requestRow.paymentConfirmedAt = now;
    requestRow.paymentConfirmedBy = req.staffActor.id;
    requestRow.status = 'processing';
    // Tính lại SLA kể từ lúc xác nhận biên lai hợp lệ
    requestRow.deadlineAt = calculateBusinessDeadline(now, slaHours);
    requestRow.isOverdue = false;
    await requestRow.save();

    await ServiceRequestLog.create({
      requestId: requestRow.id,
      actorId: req.staffActor.id,
      actorName: req.staffActor.fullName,
      actorRole: req.staffActor.role,
      fromStatus: prevStatus,
      toStatus: 'processing',
      action: 'CONFIRM_PAYMENT',
      note: req.body?.note || 'Đã đối soát biên lai hợp lệ. Chuyển hồ sơ sang Đang xử lý.',
    });

    await notifyStudentStatusUpdate(requestRow, {
      title: `✅ Đã xác nhận lệ phí hồ sơ #${requestRow.requestCode}`,
      body: `Biên lai nộp lệ phí thủ tục "${requestRow.serviceName}" đã được xác nhận hợp lệ. Hồ sơ của bạn đang được xử lý.`,
    });

    return res.json({
      success: true,
      message: 'Đã xác nhận lệ phí hợp lệ và chuyển hồ sơ sang Đang xử lý!',
      data: enrichRequestPayload(requestRow, requestRow.service),
    });
  } catch (error) {
    console.error('❌ [OneStop] POST /confirm-payment error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác nhận lệ phí!',
    });
  }
});

/**
 * POST /api/services/staff/requests/:id/reject-payment
 * Từ chối biên lai chuyển khoản (ảnh mờ, sai số tiền...) -> Yêu cầu SV tải lại
 */
router.post('/staff/requests/:id/reject-payment', staffOrAdminGuard, async (req, res) => {
  try {
    const requestRow = await ServiceRequest.findByPk(req.params.id, {
      include: [{ model: ServiceCatalog, as: 'service' }],
    });

    if (!requestRow) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ!',
      });
    }

    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập lý do từ chối biên lai để sinh viên biết và tải lại!',
      });
    }

    const prevStatus = requestRow.status;
    requestRow.paymentStatus = 'rejected';
    requestRow.status = 'pending_payment';
    requestRow.staffNote = reason;
    await requestRow.save();

    await ServiceRequestLog.create({
      requestId: requestRow.id,
      actorId: req.staffActor.id,
      actorName: req.staffActor.fullName,
      actorRole: req.staffActor.role,
      fromStatus: prevStatus,
      toStatus: 'pending_payment',
      action: 'REJECT_PAYMENT',
      note: `Từ chối biên lai: ${reason}`,
    });

    await notifyStudentStatusUpdate(requestRow, {
      title: `⚠️ Yêu cầu tải lại biên lai #${requestRow.requestCode}`,
      body: `Biên lai lệ phí hồ sơ "${requestRow.serviceName}" chưa hợp lệ: ${reason}. Vui lòng kiểm tra và tải lại biên lai trên ứng dụng.`,
    });

    return res.json({
      success: true,
      message: 'Đã yêu cầu sinh viên tải lại biên lai thanh toán!',
      data: enrichRequestPayload(requestRow, requestRow.service),
    });
  } catch (error) {
    console.error('❌ [OneStop] POST /reject-payment error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi từ chối biên lai!',
    });
  }
});

/**
 * POST /api/services/staff/requests/:id/explain-overdue
 * Cán bộ nhập Giải trình nguyên nhân quá hạn SLA (Bắt buộc đối với hồ sơ quá hạn trước khi đóng/duyệt)
 */
router.post('/staff/requests/:id/explain-overdue', staffOrAdminGuard, async (req, res) => {
  try {
    const requestRow = await ServiceRequest.findByPk(req.params.id, {
      include: [{ model: ServiceCatalog, as: 'service' }],
    });

    if (!requestRow) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ!',
      });
    }

    const { overdueReasonCategory = 'other', overdueReason = '' } = req.body || {};
    if (!String(overdueReason).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập nội dung giải trình chi tiết nguyên nhân quá hạn SLA!',
      });
    }

    requestRow.isOverdue = true;
    requestRow.overdueReasonCategory = String(overdueReasonCategory).trim();
    requestRow.overdueReason = String(overdueReason).trim();
    requestRow.overdueExplainedAt = new Date();
    requestRow.overdueExplainedBy = req.staffActor.id;
    await requestRow.save();

    await ServiceRequestLog.create({
      requestId: requestRow.id,
      actorId: req.staffActor.id,
      actorName: req.staffActor.fullName,
      actorRole: req.staffActor.role,
      fromStatus: requestRow.status,
      toStatus: requestRow.status,
      action: 'EXPLAIN_OVERDUE',
      note: `[Giải trình quá hạn - ${requestRow.overdueReasonCategory}]: ${requestRow.overdueReason}`,
    });

    await notifyOverdueExplanationSubmitted(
      requestRow,
      requestRow.service,
      req.staffActor.fullName
    );

    return res.json({
      success: true,
      message: 'Đã lưu nội dung giải trình quá hạn SLA và báo cáo Lãnh đạo phụ trách!',
      data: enrichRequestPayload(requestRow, requestRow.service),
    });
  } catch (error) {
    console.error('❌ [OneStop] POST /explain-overdue error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi lưu giải trình quá hạn!',
    });
  }
});

/**
 * PATCH /api/services/staff/requests/:id/process
 * Cán bộ xử lý hồ sơ:
 *  - Chuyển sang processing / need_more_info / ready_for_pickup / completed / rejected
 *  - RÀNG BUỘC QUAN TRỌNG: Nếu hồ sơ đã quá hạn SLA (isOverdue) mà chưa có overdueReason -> Chặn hoàn tất/trả kết quả cho tới khi giải trình!
 */
router.patch('/staff/requests/:id/process', staffOrAdminGuard, async (req, res) => {
  try {
    const requestRow = await ServiceRequest.findByPk(req.params.id, {
      include: [{ model: ServiceCatalog, as: 'service' }],
    });

    if (!requestRow) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ!',
      });
    }

    const {
      status: targetStatus,
      staffNote = '',
      trayLocation = '',
      postalTrackingNumber = '',
      resultPdfBase64 = '',
      overdueReasonCategory = '',
      overdueReason = '',
    } = req.body || {};

    const validStatuses = [
      'submitted',
      'processing',
      'need_more_info',
      'ready_for_pickup',
      'completed',
      'rejected',
    ];
    if (!validStatuses.includes(targetStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái chuyển tiếp không hợp lệ!',
      });
    }

    // Cập nhật đánh giá SLA tức thời
    const liveSla = evaluateSlaStatus(requestRow);
    const isCurrentlyOverdue = Boolean(requestRow.isOverdue || liveSla.isOverdue);
    if (isCurrentlyOverdue && !requestRow.isOverdue) {
      requestRow.isOverdue = true;
    }

    // Cho phép gửi kèm giải trình ngay trong payload nếu đang quá hạn
    if (overdueReason && String(overdueReason).trim()) {
      requestRow.overdueReasonCategory = String(overdueReasonCategory || 'other').trim();
      requestRow.overdueReason = String(overdueReason).trim();
      requestRow.overdueExplainedAt = new Date();
      requestRow.overdueExplainedBy = req.staffActor.id;
    }

    // RÀNG BUỘC KỶ LUẬT SLA: Hồ sơ đã quá hạn bắt buộc phải có giải trình trước khi duyệt trả kết quả / hoàn tất
    if (
      isCurrentlyOverdue &&
      ['ready_for_pickup', 'completed'].includes(targetStatus) &&
      !String(requestRow.overdueReason || '').trim()
    ) {
      return res.status(422).json({
        success: false,
        code: 'OVERDUE_EXPLANATION_REQUIRED',
        message:
          'Hồ sơ này đã quá hạn cam kết SLA! Cán bộ bắt buộc phải nhập "Giải trình nguyên nhân quá hạn" trước khi phê duyệt hoặc trả kết quả.',
      });
    }

    if (['need_more_info', 'rejected'].includes(targetStatus) && !String(staffNote).trim()) {
      return res.status(400).json({
        success: false,
        message:
          targetStatus === 'need_more_info'
            ? 'Vui lòng ghi rõ nội dung yêu cầu sinh viên bổ sung hồ sơ!'
            : 'Vui lòng ghi rõ lý do từ chối hồ sơ!',
      });
    }

    const prevStatus = requestRow.status;
    requestRow.status = targetStatus;
    if (staffNote !== undefined) {
      requestRow.staffNote = String(staffNote).trim();
    }
    if (trayLocation) {
      requestRow.trayLocation = String(trayLocation).trim();
    } else if (
      requestRow.deliveryMethod === 'office_pickup' &&
      ['ready_for_pickup', 'completed'].includes(targetStatus) &&
      !requestRow.trayLocation &&
      requestRow.service?.pickupLocation
    ) {
      requestRow.trayLocation = String(requestRow.service.pickupLocation).trim();
    }
    if (postalTrackingNumber) {
      requestRow.postalTrackingNumber = String(postalTrackingNumber).trim();
    }

    // Nếu trả kết quả hoặc hoàn tất -> Sinh mã QR xác thực văn bản, mã QR nhận giấy và file PDF điện tử
    if (['ready_for_pickup', 'completed'].includes(targetStatus)) {
      if (!requestRow.verifyQrCode) {
        requestRow.verifyQrCode = generateVerifyQrCode();
      }
      if (
        requestRow.deliveryMethod === 'office_pickup' &&
        !requestRow.pickupQrCode
      ) {
        requestRow.pickupQrCode = generatePickupQrCode(requestRow.requestCode);
      }

      if (resultPdfBase64) {
        const uploadedPdf = saveBase64Upload({
          base64Data: resultPdfBase64,
          subFolder: 'results',
        });
        requestRow.resultPdfUrl = uploadedPdf.fileUrl;
      } else if (!requestRow.resultPdfUrl) {
        const baseUrl =
          process.env.PUBLIC_BASE_URL ||
          `${req.protocol}://${req.get('host') || 'scheduler.tuaf.edu.vn'}`;
        const generated = generateSimpleCertificatePdf({
          requestCode: requestRow.requestCode,
          verifyQrCode: requestRow.verifyQrCode,
          serviceName: requestRow.serviceName,
          studentFullName: requestRow.studentFullName,
          studentUsername: requestRow.studentUsername || requestRow.nationalId,
          studentClass: requestRow.studentClass,
          department: requestRow.assignedDepartment,
          issuedAt: new Date(),
          staffNote: requestRow.staffNote,
          baseUrl,
        });
        requestRow.resultPdfUrl = generated.fileUrl;
      }
    }

    if (targetStatus === 'completed') {
      requestRow.completedAt = new Date();
    }

    await requestRow.save();

    await ServiceRequestLog.create({
      requestId: requestRow.id,
      actorId: req.staffActor.id,
      actorName: req.staffActor.fullName,
      actorRole: req.staffActor.role,
      fromStatus: prevStatus,
      toStatus: targetStatus,
      action: `PROCESS_${targetStatus.toUpperCase()}`,
      note:
        requestRow.staffNote ||
        `Cập nhật trạng thái hồ sơ sang "${targetStatus}"`,
    });

    // Gửi thông báo Push + Email cho Sinh viên / Cựu sinh viên
    const statusNotifications = {
      processing: {
        title: `⏳ Hồ sơ #${requestRow.requestCode} đang được xử lý`,
        body: `Bộ phận ${requestRow.assignedDepartment} đã tiếp nhận và đang xử lý thủ tục "${requestRow.serviceName}" của bạn.`,
      },
      need_more_info: {
        title: `📝 Cần bổ sung hồ sơ #${requestRow.requestCode}`,
        body: `Cán bộ thụ lý yêu cầu bổ sung thông tin cho thủ tục "${requestRow.serviceName}": ${requestRow.staffNote}`,
      },
      ready_for_pickup: {
        title: `🎉 Hồ sơ #${requestRow.requestCode} đã sẵn sàng nhận kết quả!`,
        body:
          requestRow.deliveryMethod === 'office_pickup'
            ? `Giấy tờ "${requestRow.serviceName}" đã hoàn tất${
                requestRow.trayLocation || requestRow.service?.pickupLocation
                  ? ` (Nơi nhận: ${requestRow.trayLocation || requestRow.service?.pickupLocation})`
                  : ''
              }. Vui lòng mang mã QR trên App tới nhận kết quả.`
            : `Kết quả thủ tục "${requestRow.serviceName}" đã sẵn sàng!`,
      },
      completed: {
        title: `✅ Hoàn tất thủ tục #${requestRow.requestCode}`,
        body:
          requestRow.deliveryMethod === 'postal_delivery' && requestRow.postalTrackingNumber
            ? `Thủ tục "${requestRow.serviceName}" đã hoàn tất và gửi chuyển phát qua Bưu điện (Mã vận đơn: ${requestRow.postalTrackingNumber}).`
            : `Thủ tục "${requestRow.serviceName}" đã hoàn tất! Bạn có thể tải bản PDF điện tử kèm mã QR xác thực ngay trên ứng dụng.`,
      },
      rejected: {
        title: `❌ Hồ sơ #${requestRow.requestCode} bị từ chối`,
        body: `Yêu cầu "${requestRow.serviceName}" không được phê duyệt. Lý do: ${requestRow.staffNote}`,
      },
    };

    if (statusNotifications[targetStatus]) {
      await notifyStudentStatusUpdate(requestRow, statusNotifications[targetStatus]);
    }

    return res.json({
      success: true,
      message: 'Đã cập nhật tiến độ xử lý hồ sơ thành công!',
      data: enrichRequestPayload(requestRow, requestRow.service),
    });
  } catch (error) {
    console.error('❌ [OneStop] PATCH /process error:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Lỗi xử lý hồ sơ Một cửa!',
    });
  }
});

/**
 * POST /api/services/staff/requests/:id/handover
 * Quét mã QR của sinh viên tại quầy để bàn giao bản giấy -> Chuyển sang completed
 * Cũng hỗ trợ bàn giao nhanh bằng pickupQrCode mà không cần biết trước :id (nếu :id === 'scan')
 */
router.post('/staff/requests/:id/handover', staffOrAdminGuard, async (req, res) => {
  try {
    const { pickupQrCode = '', note = '' } = req.body || {};
    let requestRow = null;

    if (req.params.id === 'scan' || req.params.id === 'by-qr') {
      const code = String(pickupQrCode).trim();
      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng cung cấp mã QR nhận kết quả hoặc Mã hồ sơ!',
        });
      }
      requestRow = await ServiceRequest.findOne({
        where: {
          [Op.or]: [{ pickupQrCode: code }, { requestCode: code.toUpperCase() }],
        },
        include: [{ model: ServiceCatalog, as: 'service' }],
      });
    } else {
      requestRow = await ServiceRequest.findByPk(req.params.id, {
        include: [{ model: ServiceCatalog, as: 'service' }],
      });
    }

    if (!requestRow) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ khớp với mã QR bàn giao!',
      });
    }

    // Kiểm tra kỷ luật giải trình nếu quá hạn
    const liveSla = evaluateSlaStatus(requestRow);
    if ((requestRow.isOverdue || liveSla.isOverdue) && !String(requestRow.overdueReason || '').trim()) {
      return res.status(422).json({
        success: false,
        code: 'OVERDUE_EXPLANATION_REQUIRED',
        message: 'Hồ sơ quá hạn SLA chưa có giải trình. Vui lòng nhập giải trình trước khi bàn giao!',
      });
    }

    const prevStatus = requestRow.status;
    requestRow.status = 'completed';
    requestRow.completedAt = new Date();
    await requestRow.save();

    await ServiceRequestLog.create({
      requestId: requestRow.id,
      actorId: req.staffActor.id,
      actorName: req.staffActor.fullName,
      actorRole: req.staffActor.role,
      fromStatus: prevStatus,
      toStatus: 'completed',
      action: 'HANDOVER_PAPER',
      note: note || `Đã quét QR và bàn giao bản giấy trực tiếp cho sinh viên (${requestRow.studentFullName}).`,
    });

    await notifyStudentStatusUpdate(requestRow, {
      title: `🤝 Đã bàn giao bản giấy hồ sơ #${requestRow.requestCode}`,
      body: `Bạn đã nhận bản giấy thủ tục "${requestRow.serviceName}"${
        requestRow.trayLocation || requestRow.service?.pickupLocation
          ? ` tại ${requestRow.trayLocation || requestRow.service?.pickupLocation}`
          : ''
      }. Hãy dành 10 giây đánh giá chất lượng phục vụ nhé!`,
    });

    return res.json({
      success: true,
      message: `Đã xác nhận bàn giao bản giấy hồ sơ #${requestRow.requestCode} thành công!`,
      data: enrichRequestPayload(requestRow, requestRow.service),
    });
  } catch (error) {
    console.error('❌ [OneStop] POST /handover error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác nhận bàn giao bản giấy!',
    });
  }
});

// ============================================================================
// 3. ADMIN PORTAL ENDPOINTS (/api/admin/services/*)
// ============================================================================
adminRouter.use(adminLocalGuard);

/**
 * GET /api/admin/services
 * Lấy toàn bộ danh mục thủ tục (cả đang bật và đang tắt)
 */
adminRouter.get('/', async (_req, res) => {
  try {
    const services = await ServiceCatalog.findAll({
      order: [
        ['displayOrder', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return res.json({
      success: true,
      data: services.map(normalizeServicePayload),
    });
  } catch (error) {
    console.error('❌ [OneStopAdmin] GET / error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải danh mục thủ tục Một cửa!',
    });
  }
});

/**
 * GET /api/admin/services/overview
 * Dashboard Giám sát SLA, thống kê theo phòng ban, hồ sơ quá hạn & đánh giá sao
 */
adminRouter.get('/overview', async (_req, res) => {
  try {
    await scanOneStopSla();

    const allRequests = await ServiceRequest.findAll({
      include: [{ model: ServiceCatalog, as: 'service' }],
      order: [['createdAt', 'DESC']],
    });

    const totalRequests = allRequests.length;
    const completedRequests = allRequests.filter((r) => r.status === 'completed');
    const overdueRequests = allRequests.filter((r) => r.isOverdue);
    const unexplainedOverdue = overdueRequests.filter((r) => !r.overdueReason);
    const pendingPaymentReview = allRequests.filter((r) => r.status === 'payment_review');

    const ratedRequests = allRequests.filter((r) => Number(r.rating) > 0);
    const avgRating =
      ratedRequests.length > 0
        ? Number(
            (
              ratedRequests.reduce((sum, r) => sum + Number(r.rating || 0), 0) /
              ratedRequests.length
            ).toFixed(2)
          )
        : 0;

    const onTimeCompleted = completedRequests.filter((r) => !r.isOverdue).length;
    const onTimeRate =
      completedRequests.length > 0
        ? Math.round((onTimeCompleted / completedRequests.length) * 100)
        : 100;

    // Thống kê theo Phòng ban
    const byDepartmentMap = {};
    for (const reqItem of allRequests) {
      const dept = reqItem.assignedDepartment || 'Khác';
      if (!byDepartmentMap[dept]) {
        byDepartmentMap[dept] = {
          department: dept,
          total: 0,
          completed: 0,
          processing: 0,
          overdue: 0,
          unexplainedOverdue: 0,
        };
      }
      byDepartmentMap[dept].total += 1;
      if (reqItem.status === 'completed') byDepartmentMap[dept].completed += 1;
      if (['submitted', 'processing', 'payment_review', 'ready_for_pickup'].includes(reqItem.status)) {
        byDepartmentMap[dept].processing += 1;
      }
      if (reqItem.isOverdue) {
        byDepartmentMap[dept].overdue += 1;
        if (!reqItem.overdueReason) {
          byDepartmentMap[dept].unexplainedOverdue += 1;
        }
      }
    }

    return res.json({
      success: true,
      summary: {
        totalRequests,
        completedCount: completedRequests.length,
        overdueCount: overdueRequests.length,
        unexplainedOverdueCount: unexplainedOverdue.length,
        pendingPaymentReviewCount: pendingPaymentReview.length,
        onTimeRate,
        avgRating,
        ratedCount: ratedRequests.length,
      },
      byDepartment: Object.values(byDepartmentMap),
      overdueList: overdueRequests.slice(0, 50).map((r) => enrichRequestPayload(r, r.service)),
    });
  } catch (error) {
    console.error('❌ [OneStopAdmin] GET /overview error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tải dữ liệu tổng quan Một cửa!',
    });
  }
});

/**
 * POST /api/admin/services
 * Thêm mới một thủ tục hành chính động
 */
adminRouter.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const code = String(payload.code || '')
      .trim()
      .toUpperCase();
    const name = String(payload.name || '').trim();
    const department = String(payload.department || '').trim();

    if (!code || !name || !department) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ Mã thủ tục (code), Tên thủ tục và Phòng ban phụ trách!',
      });
    }

    const existing = await ServiceCatalog.findOne({ where: { code } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Mã thủ tục "${code}" đã tồn tại!`,
      });
    }

    // Tự động liên kết assigneeUserId nếu Admin truyền vào assigneeUsername đã có trong bảng Users
    let resolvedAssigneeUserId = payload.assigneeUserId || null;
    const rawAssigneeUsername = String(payload.assigneeUsername || '').trim();
    if (!resolvedAssigneeUserId && rawAssigneeUsername) {
      const firstUname = parseAssigneeUsernames(rawAssigneeUsername)[0];
      if (firstUname) {
        const matchedUser = await User.findOne({
          where: { username: { [Op.iLike]: firstUname } },
        });
        if (matchedUser) resolvedAssigneeUserId = matchedUser.id;
      }
    }

    const created = await ServiceCatalog.create({
      code,
      name,
      department,
      description: payload.description || '',
      icon: payload.icon || 'file-document-outline',
      displayOrder: parseInt(payload.displayOrder, 10) || 10,
      slaHours: Math.max(1, parseInt(payload.slaHours, 10) || 24),
      assigneeUsername: rawAssigneeUsername || '',
      assigneeName: payload.assigneeName || null,
      assigneeEmail: payload.assigneeEmail || null,
      assigneePhone: payload.assigneePhone || null,
      assigneeUserId: resolvedAssigneeUserId,
      leaderName: payload.leaderName || null,
      leaderEmail: payload.leaderEmail || null,
      isPaid: Boolean(payload.isPaid),
      feeAmount: Math.max(0, parseInt(payload.feeAmount, 10) || 0),
      postalFeeAmount: Math.max(0, parseInt(payload.postalFeeAmount, 10) || 0),
      bankAccountInfo: payload.bankAccountInfo || null,
      deliveryOptions: Array.isArray(payload.deliveryOptions)
        ? payload.deliveryOptions.map(normalizeDeliveryKey)
        : ['digital_pdf', 'office_pickup'],
      pickupLocation: String(payload.pickupLocation || '').trim(),
      formSchema: Array.isArray(payload.formSchema)
        ? payload.formSchema.map((f) =>
            f && typeof f === 'object'
              ? { ...f, name: f.name || f.key, key: f.key || f.name }
              : f
          )
        : [],
      requiresAttachment: isAttachmentRequired(payload.requiresAttachment)
        ? 'required'
        : payload.requiresAttachment === 'optional'
        ? 'optional'
        : 'none',
      attachmentGuide: payload.attachmentGuide || null,
      allowAlumni: Boolean(payload.allowAlumni),
      isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
    });

    return res.status(201).json({
      success: true,
      message: `Đã tạo thủ tục "${created.name}" thành công!`,
      data: created,
    });
  } catch (error) {
    console.error('❌ [OneStopAdmin] POST / error:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Lỗi tạo mới thủ tục!',
    });
  }
});

/**
 * PUT /api/admin/services/:id
 * Cập nhật cấu hình thủ tục (SLA, cán bộ phụ trách, lệ phí, formSchema...)
 */
adminRouter.put('/:id', async (req, res) => {
  try {
    const service = await ServiceCatalog.findByPk(req.params.id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thủ tục cần cập nhật!',
      });
    }

    const up = req.body || {};
    const editableFields = [
      'name',
      'department',
      'description',
      'icon',
      'displayOrder',
      'slaHours',
      'assigneeUsername',
      'assigneeName',
      'assigneeEmail',
      'assigneePhone',
      'assigneeUserId',
      'leaderName',
      'leaderEmail',
      'isPaid',
      'feeAmount',
      'postalFeeAmount',
      'bankAccountInfo',
      'deliveryOptions',
      'pickupLocation',
      'formSchema',
      'requiresAttachment',
      'attachmentGuide',
      'allowAlumni',
      'isActive',
    ];

    for (const key of editableFields) {
      if (up[key] !== undefined) {
        if (key === 'requiresAttachment') {
          service[key] = isAttachmentRequired(up[key])
            ? 'required'
            : up[key] === 'optional'
            ? 'optional'
            : 'none';
        } else if (key === 'deliveryOptions' && Array.isArray(up[key])) {
          service[key] = up[key].map(normalizeDeliveryKey);
        } else if (key === 'formSchema' && Array.isArray(up[key])) {
          service[key] = up[key].map((f) =>
            f && typeof f === 'object'
              ? { ...f, name: f.name || f.key, key: f.key || f.name }
              : f
          );
        } else {
          service[key] = up[key];
        }
      }
    }

    // Tự động đồng bộ assigneeUserId từ assigneeUsername nếu có trong bảng Users
    if (up.assigneeUsername !== undefined) {
      const firstUname = parseAssigneeUsernames(up.assigneeUsername)[0];
      if (firstUname) {
        const matchedUser = await User.findOne({
          where: { username: { [Op.iLike]: firstUname } },
        });
        service.assigneeUserId = matchedUser ? matchedUser.id : null;
      } else {
        service.assigneeUserId = null;
      }
    }

    await service.save();
    return res.json({
      success: true,
      message: `Đã cập nhật cấu hình thủ tục "${service.name}"!`,
      data: service,
    });
  } catch (error) {
    console.error('❌ [OneStopAdmin] PUT /:id error:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Lỗi cập nhật cấu hình thủ tục!',
    });
  }
});

/**
 * PATCH /api/admin/services/:id/toggle
 * Bật / Tắt nhanh một thủ tục trên App Sinh viên
 */
adminRouter.patch('/:id/toggle', async (req, res) => {
  try {
    const service = await ServiceCatalog.findByPk(req.params.id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thủ tục!',
      });
    }

    service.isActive =
      req.body?.isActive !== undefined ? Boolean(req.body.isActive) : !service.isActive;
    await service.save();

    return res.json({
      success: true,
      message: service.isActive
        ? `Đã MỞ tiếp nhận thủ tục "${service.name}" trên App!`
        : `Đã TẠM ĐÓNG thủ tục "${service.name}"!`,
      data: service,
    });
  } catch (error) {
    console.error('❌ [OneStopAdmin] PATCH /:id/toggle error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi bật/tắt trạng thái thủ tục!',
    });
  }
});

/**
 * DELETE /api/admin/services/:id
 * Xóa thủ tục (Nếu đã có hồ sơ phát sinh thì chuyển sang tạm ngưng để bảo toàn lịch sử)
 */
adminRouter.delete('/:id', async (req, res) => {
  try {
    const service = await ServiceCatalog.findByPk(req.params.id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thủ tục!',
      });
    }

    const count = await ServiceRequest.count({ where: { serviceId: service.id } });
    if (count > 0) {
      service.isActive = false;
      await service.save();
      return res.json({
        success: true,
        softDeleted: true,
        message: `Thủ tục "${service.name}" đã có ${count} hồ sơ lịch sử nên được chuyển sang trạng thái Tạm đóng để bảo toàn dữ liệu!`,
        data: service,
      });
    }

    await service.destroy();
    return res.json({
      success: true,
      message: 'Đã xóa thủ tục khỏi danh mục!',
    });
  } catch (error) {
    console.error('❌ [OneStopAdmin] DELETE /:id error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi xóa thủ tục!',
    });
  }
});

/**
 * POST /api/admin/services/requests/:id/directive
 * Lãnh đạo phê duyệt giải trình quá hạn / ghi ý kiến chỉ đạo đôn đốc
 */
adminRouter.post('/requests/:id/directive', async (req, res) => {
  try {
    const requestRow = await ServiceRequest.findByPk(req.params.id, {
      include: [{ model: ServiceCatalog, as: 'service' }],
    });

    if (!requestRow) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hồ sơ!',
      });
    }

    const directive = String(req.body?.leaderDirective || '').trim();
    if (!directive) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập nội dung chỉ đạo của Lãnh đạo!',
      });
    }

    requestRow.leaderDirective = directive;
    await requestRow.save();

    await ServiceRequestLog.create({
      requestId: requestRow.id,
      actorId: null,
      actorName: req.body?.leaderName || 'Lãnh đạo / Ban Giám hiệu',
      actorRole: 'admin',
      fromStatus: requestRow.status,
      toStatus: requestRow.status,
      action: 'LEADER_DIRECTIVE',
      note: `Ý kiến chỉ đạo Lãnh đạo: ${directive}`,
    });

    return res.json({
      success: true,
      message: 'Đã ghi nhận ý kiến chỉ đạo của Lãnh đạo vào hồ sơ!',
      data: enrichRequestPayload(requestRow, requestRow.service),
    });
  } catch (error) {
    console.error('❌ [OneStopAdmin] POST /requests/:id/directive error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi lưu ý kiến chỉ đạo!',
    });
  }
});

/**
 * POST /api/admin/services/send-digest
 * Kích hoạt gửi Email Báo cáo tổng hợp SLA Một cửa ngay lập tức
 */
adminRouter.post('/send-digest', async (_req, res) => {
  try {
    const result = await sendWeeklyOneStopDigestEmail();
    return res.json({
      success: true,
      message: result.sent
        ? 'Đã gửi Email báo cáo tổng hợp SLA Một cửa thành công!'
        : `Không gửi email (${result.reason || 'Chưa cấu hình SMTP hoặc không có người nhận'})`,
      data: result,
    });
  } catch (error) {
    console.error('❌ [OneStopAdmin] POST /send-digest error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Lỗi gửi báo cáo tổng hợp SLA!',
    });
  }
});

module.exports = {
  oneStopRouter: router,
  oneStopAdminRouter: adminRouter,
  parseAssigneeUsernames,
  isStaffAssignedToService,
};
