const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { encrypt } = require('../utils/security');
const strategyManager = require('../strategies/StrategyManager');
const authMiddleware = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is required!');
  process.exit(1);
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
const safeCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};

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
    // 1. Tim tai khoan da ton tai trong PostgreSQL
    let user = await User.findOne({ where: { username, role } });

    // === Inspector & Admin: Dang nhap truc tiep, khong crawl portal ===
    if (role === 'inspector' || role === 'admin') {
      if (!user) {
        // Tao tai khoan moi cho inspector/admin
        isNewUser = true;
        user = await User.create({
          username,
          encryptedPassword: encrypt(password),
          role,
          fullName: username,
          className: '',
          department: 'Thanh tra'
        });
      } else {
        // Kiem tra mat khau: decrypt stored password, so sanh voi input
        const { decrypt } = require('../utils/security');
        try {
          const storedPassword = decrypt(user.encryptedPassword);
          if (!safeCompare(storedPassword, password)) {
            return res.status(401).json({
              success: false,
              message: 'Sai mat khau! Vui long kiem tra lai.'
            });
          }
        } catch (err) {
          return res.status(401).json({
            success: false,
            message: 'Loi xac thuc mat khau!'
          });
        }
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.json({
        success: true,
        token,
        user: {
          username: user.username,
          role: user.role,
          fullName: user.fullName || username,
          className: '',
          department: user.department,
          lastSyncedAt: user.lastSyncedAt
        }
      });
    }

    // === Student & Lecturer: Đăng nhập qua portal + Data từ SQL Server/Crawler ===
    if (!user) {
      isNewUser = true;
      user = await User.create({
        username,
        encryptedPassword: encrypt(password),
        role,
        fullName: 'Dang cap nhat...',
        className: 'Chua cap nhat',
        department: 'TUAF'
      });
    } else {
      // Cập nhật mật khẩu mới nhất (SV có thể đổi pass portal)
      user.encryptedPassword = encrypt(password);
      await user.save();
    }

    // ─── Bước 1: XÁC THỰC qua portal crawler ───
    // (chỉ khi DATA_SOURCE=database, vì CrawlerStrategy tự auth bên trong)
    const dataSource = process.env.DATA_SOURCE || 'database';
    let portalAuth = null;

    if (dataSource === 'database') {
      if (role === 'student') {
        const { loginStudent } = require('../services/studentCrawler');
        portalAuth = await loginStudent(username, password);
      } else if (role === 'lecturer') {
        const { loginLecturer } = require('../services/lecturerCrawler');
        portalAuth = await loginLecturer(username, password);
        // Đóng browser sau khi auth xong (lecturerCrawler dùng Puppeteer)
        if (portalAuth.browser) {
          await portalAuth.browser.close().catch(() => {});
        }
      }

      if (portalAuth && !portalAuth.success) {
        throw new Error(portalAuth.error || 'Xac thuc portal that bai');
      }

      // Cập nhật thông tin từ portal auth
      if (portalAuth && portalAuth.fullName) {
        user.fullName = portalAuth.fullName;
        user.className = portalAuth.className || user.className;
        user.department = portalAuth.department || 'TUAF';
      }
    }

    // ─── Bước 2: LẤY DATA — ưu tiên strategy chính, fallback crawler ───
    const strategy = strategyManager.getStrategy();
    let result;

    try {
      result = await strategy.getSchedule(user, password, {
        semester: '2',
        schoolYear: '2025'
      });
    } catch (primaryErr) {
      // Nếu strategy chính là database và lỗi → fallback sang crawler
      if (dataSource === 'database') {
        console.warn(`⚠️ [Auth] DatabaseStrategy lỗi: ${primaryErr.message}. Fallback sang Crawler...`);
        const crawlerStrategy = strategyManager.getCrawlerStrategy();
        result = await crawlerStrategy.getSchedule(user, password, {
          semester: '2',
          schoolYear: '2025'
        });
      } else {
        throw primaryErr;
      }
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Background sync lịch sử (tất cả kỳ) — chỉ chạy 1 lần
    if (user.role === 'student') {
      setImmediate(async () => {
        try {
          console.log(`Background sync history bat dau cho ${user.username}...`);
          await strategy.syncHistory(user, password);
          console.log(`Background sync history hoan tat cho ${user.username}!`);
        } catch (err) {
          console.warn(`Background sync history that bai cho ${user.username}:`, err.message);
        }
      });
    }

    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        role: user.role,
        fullName: result.fullName || user.fullName,
        className: result.className || user.className,
        department: result.department || user.department,
        lastSyncedAt: result.lastSyncedAt
      }
    });
  } catch (error) {
    console.error(`[Auth API] Loi dang nhap cho tai khoan ${username}:`, error.message);

    if (isNewUser) {
      await User.destroy({ where: { username, role } });
    }

    // Trả lỗi chung — KHÔNG lộ chi tiết DB/SQL Server
    const userMessage = error.message.includes('portal') || error.message.includes('không chính xác')
      ? error.message
      : 'Dang nhap khong thanh cong. Vui long kiem tra lai tai khoan va mat khau!';

    res.status(401).json({
      success: false,
      message: userMessage
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Lấy thông tin người dùng hiện tại từ token JWT (xác thực token)
 * @access  Private
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        username: req.user.username,
        role: req.user.role,
        fullName: req.user.fullName,
        className: req.user.className,
        department: req.user.department,
        lastSyncedAt: req.user.lastSyncedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thông tin người dùng!',
      error: error.message
    });
  }
});

module.exports = router;
