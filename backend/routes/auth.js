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
      const { decrypt } = require('../utils/security');
      const { authenticateLecturer } = require('../services/lecturerAuth');

      let authenticated = false;
      let inspectorName = username;

      if (user) {
        // 1. Kiem tra mat khau cuc bo
        try {
          const storedPassword = decrypt(user.encryptedPassword);
          if (safeCompare(storedPassword, password)) {
            authenticated = true;
          }
        } catch (err) {
          // Loi giai ma hoac key thay doi -> se fallback xuong buoc 2
        }

        // 2. Neu mat khau cuc bo khong dung hoac loi giai ma, thu xac thuc qua tai khoan can bo TUAF
        if (!authenticated) {
          const staffAuth = await authenticateLecturer(username, password).catch(() => null);
          if (staffAuth && staffAuth.success) {
            authenticated = true;
            inspectorName = staffAuth.fullName || user.fullName || username;
            // Cap nhat lai mat khau ma hoa moi de lan sau login nhanh
            user.encryptedPassword = encrypt(password);
            user.fullName = inspectorName;
            await user.save();
          }
        }

        if (!authenticated) {
          return res.status(401).json({
            success: false,
            message: 'Sai mật khẩu tài khoản Thanh tra! Vui lòng kiểm tra lại.'
          });
        }
      } else {
        // Tai khoan chua co trong PostgreSQL:
        // Kiem tra xem co phai tai khoan can bo/giang vien TUAF khong
        const staffAuth = await authenticateLecturer(username, password).catch(() => null);
        if (staffAuth && staffAuth.success) {
          inspectorName = staffAuth.fullName || username;
        }

        isNewUser = true;
        user = await User.create({
          username,
          encryptedPassword: encrypt(password),
          role,
          fullName: inspectorName,
          className: '',
          department: 'Thanh tra'
        });
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
      // Cập nhật mật khẩu mới nhất (SV/GV có thể đổi pass portal)
      user.encryptedPassword = encrypt(password);
      await user.save();
    }

    // ─── Bước 1: XÁC THỰC qua SQL Server / Portal ───
    const dataSource = process.env.DATA_SOURCE || 'database';
    let portalAuth = null;

    if (role === 'lecturer') {
      // Giảng viên LUÔN xác thực trực tiếp qua SQL Server TUAF, không crawl web
      const { authenticateLecturer } = require('../services/lecturerAuth');
      portalAuth = await authenticateLecturer(username, password);

      if (!portalAuth || !portalAuth.success) {
        return res.status(401).json({
          success: false,
          message: portalAuth?.error || 'Tài khoản hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!'
        });
      }

      // Cập nhật thông tin giảng viên từ SQL Server
      user.fullName = portalAuth.fullName || user.fullName;
      user.className = portalAuth.className || 'Giảng viên';
      user.department = portalAuth.department || 'TUAF';
      if (portalAuth.lecturerId) {
        user.tuafStudentId = portalAuth.lecturerId;
      }
      await user.save();
    } else if (dataSource === 'database') {
      // Sinh viên ở chế độ database
      const { loginStudent } = require('../services/studentCrawler');
      portalAuth = await loginStudent(username, password);

      if (portalAuth && !portalAuth.success) {
        return res.status(401).json({
          success: false,
          message: portalAuth.error || 'Xác thực cổng trường thất bại. Vui lòng kiểm tra lại tài khoản, mật khẩu!'
        });
      }

      if (portalAuth && portalAuth.fullName) {
        user.fullName = portalAuth.fullName;
        user.className = portalAuth.className || user.className;
        user.department = portalAuth.department || 'TUAF';
        await user.save();
      }
    }

    // ─── Bước 2: LẤY DATA — Giảng viên LUÔN dùng DatabaseStrategy (SQL Server) ───
    let result;

    if (role === 'lecturer') {
      console.log(`📡 [Auth] Lấy dữ liệu giảng dạy trực tiếp từ Database Server cho GV ${user.username}...`);
      const databaseStrategy = strategyManager.getDatabaseStrategy();
      result = await databaseStrategy.getSchedule(user, password, {
        semester: '1',
        schoolYear: '2026'
      });
    } else {
      const strategy = strategyManager.getStrategy();
      try {
        result = await strategy.getSchedule(user, password, {
          semester: '1',
          schoolYear: '2026'
        });
      } catch (primaryErr) {
        // Nếu strategy chính là database và lỗi → fallback sang crawler cho sinh viên
        if (dataSource === 'database') {
          console.warn(`⚠️ [Auth] DatabaseStrategy lỗi: ${primaryErr.message}. Fallback sang Crawler...`);
          const crawlerStrategy = strategyManager.getCrawlerStrategy();
          result = await crawlerStrategy.getSchedule(user, password, {
            semester: '1',
            schoolYear: '2026'
          });
        } else {
          throw primaryErr;
        }
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

    // Trả lỗi thân thiện cho người dùng
    const userMessage = error.message.includes('portal') || error.message.includes('chính xác') || error.message.includes('mật khẩu') || error.message.includes('kết nối')
      ? error.message
      : 'Đăng nhập không thành công. Vui lòng kiểm tra lại tài khoản và mật khẩu!';

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
