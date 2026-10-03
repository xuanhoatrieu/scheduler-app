/**
 * Hộp thư thông báo của người dùng đang đăng nhập (sinh viên / giảng viên).
 * Mọi truy vấn đều lọc theo req.user.id → không đọc được thông báo của người khác.
 */
const express = require('express');
const authMiddleware = require('../middleware/auth');
const announcementRepo = require('../services/announcementRepo');
const { isUuid } = require('../services/announcementRules');

const router = express.Router();
router.use(authMiddleware);

/** @route GET /api/announcements — 50 thông báo gần nhất + số chưa đọc */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const [items, unread] = await Promise.all([
      announcementRepo.listInbox(req.user.id, limit),
      announcementRepo.countUnread(req.user.id)
    ]);
    return res.json({ success: true, data: items, unread });
  } catch (err) {
    console.error('❌ [Announcements] inbox error:', err.message);
    return res.status(500).json({ success: false, message: 'Không tải được thông báo!' });
  }
});

/** @route POST /api/announcements/read-all */
router.post('/read-all', async (req, res) => {
  try {
    const updated = await announcementRepo.markAllRead(req.user.id);
    return res.json({ success: true, updated });
  } catch (err) {
    console.error('❌ [Announcements] read-all error:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái!' });
  }
});

/** @route POST /api/announcements/:id/read — chỉ người nhận mới đánh dấu được */
router.post('/:id/read', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ success: false, message: 'Mã thông báo không hợp lệ!' });
  try {
    const ok = await announcementRepo.markRead(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo!' });
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ [Announcements] read error:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái!' });
  }
});

module.exports = router;
