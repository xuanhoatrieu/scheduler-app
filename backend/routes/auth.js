const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { encrypt } = require('../utils/security');
const strategyManager = require('../strategies/StrategyManager');

const JWT_SECRET = process.env.JWT_SECRET || 'tuaf_schedule_secret_key_2026';

/**
 * @route   POST /api/auth/login
 * @desc    Đăng nhập bằng tài khoản cổng trường, tự động đồng bộ & tạo tài khoản mới nếu chưa có
 * @access  Public
 */
router.post('/login', async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập đầy đủ Tài khoản, Mật khẩu và Vai trò!'
    });
  }

  let isNewUser = false;
  try {
    // 1. Tìm tài khoản đã tồn tại trong PostgreSQL
    let user = await User.findOne({ where: { username, role } });
    
    if (!user) {
      isNewUser = true;
      // Tạo bản ghi người dùng tạm thời
      user = await User.create({
        username,
        encryptedPassword: encrypt(password),
        role,
        fullName: 'Đang cập nhật...',
        className: 'Chưa cập nhật',
        department: 'TUAF'
      });
    }

    // 2. Chạy Strategy (CrawlerStrategy) để vừa xác thực mật khẩu trên portal cổng trường,
    // vừa tự động cào và cập nhật Cache lịch học, lịch thi, điểm số, học phí vào PostgreSQL
    const strategy = strategyManager.getStrategy();
    const result = await strategy.getSchedule(user, password, {
      semester: '2',
      schoolYear: '2025'
    });

    // Cập nhật lại mật khẩu mã hóa mới phòng khi người dùng thay đổi mật khẩu
    user.encryptedPassword = encrypt(password);
    await user.save();

    // 3. Ký mã JWT Token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // 4. Background: Kích hoạt đồng bộ dữ liệu lịch sử TẤT CẢ các kỳ (không blocking)
    if (user.role === 'student') {
      setImmediate(async () => {
        try {
          console.log(`🔄 [Auth] Background sync history bắt đầu cho ${user.username}...`);
          await strategy.syncHistory(user, password);
          console.log(`✅ [Auth] Background sync history hoàn tất cho ${user.username}!`);
        } catch (err) {
          console.warn(`⚠️ [Auth] Background sync history thất bại cho ${user.username}:`, err.message);
        }
      });
    }

    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        role: user.role,
        fullName: result.fullName,
        className: result.className,
        department: result.department,
        lastSyncedAt: result.lastSyncedAt
      }
    });
  } catch (error) {
    console.error(`❌ [Auth API] Lỗi đăng nhập cho tài khoản ${username}:`, error.message);
    
    // Nếu là tài khoản mới khởi tạo nhưng cào portal lỗi (sai mật khẩu) -> xóa để tránh rác DB
    if (isNewUser) {
      await User.destroy({ where: { username, role } });
    }

    res.status(401).json({
      success: false,
      message: 'Đăng nhập không thành công. Vui lòng kiểm tra lại tài khoản và mật khẩu cổng trường!',
      error: error.message
    });
  }
});

module.exports = router;
