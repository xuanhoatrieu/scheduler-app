const express = require('express');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const DeviceToken = require('../models/DeviceToken');
const { isValidExpoToken, normalizePlatform } = require('../services/notificationRules');

const router = express.Router();

// Mỗi tài khoản giữ tối đa N thiết bị; quá thì bỏ thiết bị cũ nhất
const MAX_DEVICES_PER_USER = 10;

// Giới hạn riêng cho endpoint không cần đăng nhập (chống spam xóa token)
const unregisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu, thử lại sau!' }
});

/**
 * @route   POST /api/devices/register
 * @desc    Gắn Expo Push Token của máy với tài khoản đang đăng nhập.
 *          Token đã thuộc tài khoản khác (đổi tài khoản trên cùng máy) → chuyển sang tài khoản này.
 * @access  Private
 */
router.post('/register', authMiddleware, async (req, res) => {
  try {
    const { token, platform } = req.body || {};
    if (!isValidExpoToken(token)) {
      return res.status(400).json({ success: false, message: 'Token thiết bị không hợp lệ!' });
    }
    const now = new Date();
    const values = {
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      platform: normalizePlatform(platform),
      active: true,
      lastSeenAt: now
    };
    const existing = await DeviceToken.findOne({ where: { token } });
    if (existing) {
      // Đổi chủ → lịch nhắc trên máy chắc chắn chưa lập cho chủ mới
      if (existing.userId !== req.user.id) values.remindersSyncedAt = null;
      await existing.update(values);
    } else {
      await DeviceToken.create({ token, ...values });
    }

    const devices = await DeviceToken.findAll({
      where: { userId: req.user.id },
      order: [['lastSeenAt', 'DESC']],
      attributes: ['id']
    });
    if (devices.length > MAX_DEVICES_PER_USER) {
      await DeviceToken.destroy({ where: { id: devices.slice(MAX_DEVICES_PER_USER).map((d) => d.id) } });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ [Devices] register error:', err.message);
    return res.status(500).json({ success: false, message: 'Không thể đăng ký nhận thông báo!' });
  }
});

/**
 * @route   POST /api/devices/unregister
 * @desc    Gỡ token khi đăng xuất. KHÔNG yêu cầu đăng nhập vì có thể gọi lúc phiên đã hết hạn;
 *          chỉ biết token (do chính máy sinh ra) mới gỡ được, và gỡ chỉ làm máy đó ngừng nhận push.
 * @access  Public (rate limited)
 */
router.post('/unregister', unregisterLimiter, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (isValidExpoToken(token)) {
      await DeviceToken.destroy({ where: { token } });
    }
    // Luôn trả success để không lộ token có tồn tại hay không
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ [Devices] unregister error:', err.message);
    return res.status(500).json({ success: false, message: 'Không thể hủy đăng ký thông báo!' });
  }
});

/**
 * @route   POST /api/devices/synced
 * @desc    App báo đã lập lại lịch nhắc local thành công → server không cần gửi bản tin sáng dự phòng.
 * @access  Private (chỉ cập nhật token thuộc chính tài khoản đang đăng nhập)
 */
router.post('/synced', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!isValidExpoToken(token)) {
      return res.status(400).json({ success: false, message: 'Token thiết bị không hợp lệ!' });
    }
    const now = new Date();
    const [count] = await DeviceToken.update(
      { remindersSyncedAt: now, lastSeenAt: now, active: true },
      { where: { token, userId: req.user.id } }
    );
    return res.json({ success: true, updated: count > 0 });
  } catch (err) {
    console.error('❌ [Devices] synced error:', err.message);
    return res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái!' });
  }
});

module.exports = router;
