/**
 * API Admin: đẩy thông báo tới sinh viên / lớp / khóa / toàn trường / giảng viên.
 * Mount tại /api/admin/announcements SAU adminLocalGuard; thêm requireConfiguredAdminKey (fail-closed) + rate limit.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireConfiguredAdminKey } = require('../middleware/adminAuth');
const namvietConnector = require('../services/namvietConnector');
const tuafQueries = require('../services/tuafQueries');
const announcementRepo = require('../services/announcementRepo');
const { createAnnouncementService } = require('../services/announcementService');
const { validateAnnouncementInput, isValidClassKeyword } = require('../services/announcementRules');
const { isPushEnabled } = require('../jobs/pushJobs');

const router = express.Router();

/** Danh bạ trường (SQL Server, chỉ đọc) */
const directory = {
  activeStudentCodes: async (filter) => tuafQueries.getActiveStudentCodes(await namvietConnector.getPool(), filter),
  classLabels: async (classIds) => tuafQueries.getAdminClassesByIds(await namvietConnector.getPool(), classIds)
};

const service = createAnnouncementService({ repo: announcementRepo, directory });

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu, thử lại sau ít phút!' }
});

// Gửi hàng loạt: giới hạn chặt để chống lạm dụng nếu lộ mật khẩu quản trị
const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Đã gửi quá nhiều thông báo trong 15 phút. Vui lòng thử lại sau!' }
});

router.use(requireConfiguredAdminKey);

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

/** Danh sách Khóa đang có sinh viên đang học */
router.get('/cohorts', readLimiter, async (req, res) => {
  try {
    const cohorts = await tuafQueries.getActiveCohorts(await namvietConnector.getPool());
    return res.json({ success: true, data: cohorts.filter((c) => c.cohort >= 1 && c.cohort <= 200) });
  } catch (err) {
    console.error('❌ [Announcements] cohorts error:', err.message);
    return fail(res, 502, 'Không đọc được danh sách Khóa từ CSDL trường.');
  }
});

/** Tìm lớp hành chính theo mã/tên */
router.get('/classes', readLimiter, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!isValidClassKeyword(q)) return fail(res, 400, 'Từ khóa lớp 2–30 ký tự (chữ, số, khoảng trắng, . _ -).');
  try {
    const classes = await tuafQueries.searchAdminClasses(await namvietConnector.getPool(), q);
    return res.json({ success: true, data: classes });
  } catch (err) {
    console.error('❌ [Announcements] class search error:', err.message);
    return fail(res, 502, 'Không tìm được lớp từ CSDL trường.');
  }
});

/** Đếm trước số người nhận */
router.post('/preview', readLimiter, async (req, res) => {
  const v = validateAnnouncementInput(req.body);
  if (!v.ok) return fail(res, 400, v.errors.join(' '), { errors: v.errors });
  try {
    const summary = await service.preview(v.value);
    return res.json({ success: true, data: summary, pushEnabled: isPushEnabled() });
  } catch (err) {
    console.error('❌ [Announcements] preview error:', err.message);
    return fail(res, 502, 'Không xác định được danh sách người nhận. Kiểm tra kết nối CSDL trường.');
  }
});

/** Gửi thông báo (bắt buộc confirm=true từ giao diện sau khi xem số người nhận) */
router.post('/', sendLimiter, async (req, res) => {
  const v = validateAnnouncementInput(req.body);
  if (!v.ok) return fail(res, 400, v.errors.join(' '), { errors: v.errors });
  if (req.body.confirm !== true) return fail(res, 400, 'Thiếu xác nhận gửi.');
  try {
    const result = await service.send(v.value, { ip: req.ip });
    if (!result.ok) return fail(res, 422, result.error, { data: result.summary });
    console.log(`📢 [Announcements] ${result.id} → ${result.summary.label}: ${result.summary.recipients} người nhận, ${result.summary.withDevice} có push (ip ${req.ip})`);
    return res.status(201).json({
      success: true,
      data: { id: result.id, ...result.summary, scheduledFor: result.scheduledFor },
      pushEnabled: isPushEnabled()
    });
  } catch (err) {
    console.error('❌ [Announcements] send error:', err.message);
    return fail(res, 500, 'Gửi thông báo thất bại, chưa có ai nhận. Vui lòng thử lại.');
  }
});

/** Lịch sử đã gửi */
router.get('/', readLimiter, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const data = await announcementRepo.listAnnouncements(limit);
    return res.json({ success: true, data, pushEnabled: isPushEnabled() });
  } catch (err) {
    console.error('❌ [Announcements] history error:', err.message);
    return fail(res, 500, 'Không tải được lịch sử thông báo.');
  }
});

module.exports = router;
