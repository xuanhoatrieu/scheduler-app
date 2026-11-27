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
        // Chỉ tài khoản đã được quản trị viên cấp quyền thanh tra trong CSDL mới được phép đăng nhập
        return res.status(403).json({
          success: false,
          message: role === 'inspector'
            ? 'Tài khoản của bạn chưa được cấp quyền Thanh tra! Vui lòng liên hệ Quản trị viên.'
            : 'Tài khoản của bạn chưa được cấp quyền Quản trị viên!'
        });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      const userRoles = await User.findAll({
        where: { username },
        attributes: ['role']
      });

      return res.json({
        success: true,
        token,
        user: {
          username: user.username,
          role: user.role,
          fullName: user.fullName || username,
          className: '',
          department: user.department,
          lastSyncedAt: user.lastSyncedAt,
          availableRoles: userRoles.map(r => r.role)
        }
      });
    }

    // === Student & Lecturer: Đăng nhập qua portal + Data từ SQL Server/Crawler ===
    const { decrypt } = require('../utils/security');
    const previousEncryptedPassword = user ? user.encryptedPassword : null;

    const isConnectionErrorMessage = (msg = '') => {
      const m = String(msg);
      return (
        m.includes('Failed to connect') ||
        m.includes('Could not connect') ||
        m.includes('ETIMEDOUT') ||
        m.includes('ECONNREFUSED') ||
        m.includes('ENOTFOUND') ||
        m.includes('ESOCKET') ||
        m.includes('ConnectionError') ||
        m.includes('NamViet') ||
        m.includes('kết nối') ||
        m.includes('Kết nối') ||
        m.includes('CSRF Token')
      );
    };

    // ─── Bước 1: XÁC THỰC qua SQL Server / Portal (CHƯA ghi đè mật khẩu DB trước khi xác thực) ───
    const dataSource = process.env.DATA_SOURCE || 'database';
    let portalAuth = null;

    if (role === 'lecturer') {
      // Giảng viên xác thực trực tiếp qua SQL Server TUAF hoặc SSO Fallback
      const { authenticateLecturer } = require('../services/lecturerAuth');
      portalAuth = await authenticateLecturer(username, password);

      // Fallback an toàn cho Giảng viên cũ đã có trong PostgreSQL khi cả SQL Server lẫn SSO đều nghẽn mạng
      if ((!portalAuth || !portalAuth.success) && user && previousEncryptedPassword && isConnectionErrorMessage(portalAuth?.error)) {
        try {
          const storedPassword = decrypt(previousEncryptedPassword);
          if (safeCompare(storedPassword, password)) {
            console.warn(`⚠️ [Auth] SQL Server & SSO gián đoạn nhưng giảng viên ${username} khớp mật khẩu lưu đệm PostgreSQL -> Cho phép đăng nhập.`);
            portalAuth = {
              success: true,
              authMethod: 'Local_PG_Cache_Fallback',
              fullName: user.fullName || username,
              className: user.className || 'Giảng viên',
              department: user.department || 'Giảng viên TUAF',
              lecturerId: user.tuafStudentId || null
            };
          }
        } catch (_) {}
      }

      if (!portalAuth || !portalAuth.success) {
        return res.status(401).json({
          success: false,
          message: portalAuth?.error || 'Tài khoản hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!'
        });
      }
    } else if (dataSource === 'database') {
      // Sinh viên ở chế độ database: ưu tiên cổng sinh viên, fallback IdentityServer SQL hoặc mật khẩu PG khi cổng lỗi kết nối
      const { loginStudent } = require('../services/studentCrawler');
      portalAuth = await loginStudent(username, password);

      if ((!portalAuth || !portalAuth.success) && isConnectionErrorMessage(portalAuth?.error)) {
        // Thử xác thực qua IdentityServerNongLam trên SQL Server nếu cổng web sinh viên bị lỗi mạng
        try {
          const namvietConnector = require('../services/namvietConnector');
          const { verifyIdentityV3Hash } = require('../services/identityHasher');
          const pool = await namvietConnector.getPool();
          const idRes = await pool.request()
            .input('username', username)
            .query(`
              SELECT TOP 1 Id, UserName, PasswordHash
              FROM IdentityServerNongLam.dbo.AspNetUsers
              WHERE UserName = @username
            `);
          const idUser = idRes.recordset[0];
          if (idUser && idUser.PasswordHash && verifyIdentityV3Hash(idUser.PasswordHash, password)) {
            portalAuth = {
              success: true,
              authMethod: 'IdentityServer_PBKDF2_Student',
              fullName: user?.fullName || username,
              className: user?.className || '',
              department: user?.department || 'TUAF'
            };
          }
        } catch (_) {}

        // Fallback cuối: đối chiếu mật khẩu AES-256 đã lưu của sinh viên cũ trong PostgreSQL
        if ((!portalAuth || !portalAuth.success) && user && previousEncryptedPassword) {
          try {
            const storedPassword = decrypt(previousEncryptedPassword);
            if (safeCompare(storedPassword, password)) {
              console.warn(`⚠️ [Auth] Cổng sinh viên & SQL Server gián đoạn nhưng SV ${username} khớp mật khẩu lưu đệm PostgreSQL -> Cho phép đăng nhập.`);
              portalAuth = {
                success: true,
                authMethod: 'Local_PG_Cache_Fallback',
                fullName: user.fullName || username,
                className: user.className || '',
                department: user.department || 'TUAF'
              };
            }
          } catch (_) {}
        }
      }

      if (portalAuth && !portalAuth.success) {
        return res.status(401).json({
          success: false,
          message: portalAuth.error || 'Xác thực cổng trường thất bại. Vui lòng kiểm tra lại tài khoản, mật khẩu!'
        });
      }
    }

    // ─── Sau khi xác thực Bước 1 THÀNH CÔNG mới khởi tạo hoặc cập nhật mật khẩu vào PostgreSQL ───
    if (!user) {
      isNewUser = true;
      user = await User.create({
        username,
        encryptedPassword: encrypt(password),
        role,
        fullName: portalAuth?.fullName || 'Dang cap nhat...',
        className: portalAuth?.className || (role === 'lecturer' ? 'Giảng viên' : 'Chua cap nhat'),
        department: portalAuth?.department || 'TUAF',
        tuafStudentId: portalAuth?.lecturerId || null
      });
    } else {
      user.encryptedPassword = encrypt(password);
      if (portalAuth?.fullName && portalAuth.fullName !== 'Sinh viên TUAF') {
        user.fullName = portalAuth.fullName;
      }
      if (portalAuth?.className && portalAuth.className !== 'Chưa cập nhật') {
        user.className = portalAuth.className;
      }
      if (portalAuth?.department) {
        user.department = portalAuth.department;
      }
      if (portalAuth?.lecturerId) {
        user.tuafStudentId = portalAuth.lecturerId;
      }
      await user.save();
    }

    // ─── Bước 2: LẤY DATA từ SQL Server TUAF (Có fallback an toàn về PostgreSQL Cache nếu SQL Server gián đoạn) ───
    console.log(`📡 [Auth] Lấy dữ liệu trực tiếp từ Database Server cho ${user.username} (role: ${role})...`);
    const databaseStrategy = strategyManager.getDatabaseStrategy();
    let result = null;
    let syncWarning = null;

    try {
      result = await databaseStrategy.getSchedule(user, password, {
        semester: '1',
        schoolYear: '2026'
      });
    } catch (syncErr) {
      console.warn(`⚠️ [Auth] Không thể đồng bộ SQL Server lúc đăng nhập cho ${user.username}: ${syncErr.message}`);
      syncWarning = 'Máy chủ dữ liệu trường đang tạm gián đoạn kết nối. Hệ thống đang hiển thị dữ liệu đã lưu gần nhất.';
      result = {
        fullName: user.fullName || portalAuth?.fullName || user.username,
        className: user.className || portalAuth?.className || '',
        department: user.department || portalAuth?.department || 'TUAF',
        lastSyncedAt: user.lastSyncedAt
      };
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Background sync lịch sử (tất cả kỳ) — chỉ chạy 1 lần khi SQL Server đang hoạt động bình thường
    if (user.role === 'student' && !syncWarning) {
      setImmediate(async () => {
        try {
          console.log(`Background sync history bat dau cho ${user.username}...`);
          await databaseStrategy.syncHistory(user, password);
          console.log(`Background sync history hoan tat cho ${user.username}!`);
        } catch (err) {
          console.warn(`Background sync history that bai cho ${user.username}:`, err.message);
        }
      });
    }

    const userRoles = await User.findAll({
      where: { username },
      attributes: ['role']
    });

    res.json({
      success: true,
      token,
      ...(syncWarning ? { syncWarning } : {}),
      user: {
        username: user.username,
        role: user.role,
        fullName: result.fullName || user.fullName,
        className: result.className || user.className,
        department: result.department || user.department,
        lastSyncedAt: result.lastSyncedAt,
        availableRoles: userRoles.map(r => r.role)
      }
    });
  } catch (error) {
    console.error(`[Auth API] Loi dang nhap cho tai khoan ${username}:`, error.message);

    if (isNewUser && typeof User !== 'undefined') {
      await User.destroy({ where: { username, role } }).catch(() => {});
    }

    const msg = String(error.message || '');
    const isConnErr =
      msg.includes('Failed to connect') ||
      msg.includes('Could not connect') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('ESOCKET') ||
      msg.includes('ConnectionError') ||
      msg.includes('NamViet');

    // Trả lỗi thân thiện và đúng bản chất cho người dùng
    let userMessage;
    if (isConnErr) {
      userMessage = 'Máy chủ dữ liệu nhà trường đang tạm gián đoạn kết nối. Vui lòng thử lại sau ít phút!';
    } else if (msg.includes('portal') || msg.includes('chính xác') || msg.includes('mật khẩu') || msg.includes('kết nối') || msg.includes('Không tìm thấy')) {
      userMessage = msg;
    } else {
      userMessage = 'Đăng nhập không thành công. Vui lòng kiểm tra lại tài khoản và mật khẩu!';
    }

    res.status(isConnErr ? 503 : 401).json({
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
    const userRoles = await User.findAll({
      where: { username: req.user.username },
      attributes: ['role']
    });

    res.json({
      success: true,
      user: {
        username: req.user.username,
        role: req.user.role,
        fullName: req.user.fullName,
        className: req.user.className,
        department: req.user.department,
        lastSyncedAt: req.user.lastSyncedAt,
        availableRoles: userRoles.map(r => r.role)
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

/**
 * @route   POST /api/auth/switch-role
 * @desc    Chuyển đổi vai trò nhanh giữa Giảng viên và Thanh tra (Dual Role)
 * @access  Private
 */
router.post('/switch-role', authMiddleware, async (req, res) => {
  try {
    const { targetRole } = req.body;
    const username = req.user.username;

    if (!['lecturer', 'inspector', 'student'].includes(targetRole)) {
      return res.status(400).json({ success: false, message: 'Vai trò không hợp lệ' });
    }

    if (req.user.role === targetRole) {
      return res.json({
        success: true,
        message: 'Đang ở vai trò này',
        user: {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role,
          fullName: req.user.fullName,
          className: req.user.className,
          department: req.user.department,
          lastSyncedAt: req.user.lastSyncedAt
        }
      });
    }

    let targetUser = await User.findOne({ where: { username, role: targetRole } });

    if (!targetUser) {
      return res.status(403).json({
        success: false,
        message: `Tài khoản "${username}" chưa được cấp quyền vai trò "${targetRole}"!`
      });
    }

    const token = jwt.sign(
      { id: targetUser.id, username: targetUser.username, role: targetUser.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const userRoles = await User.findAll({
      where: { username },
      attributes: ['role']
    });

    return res.json({
      success: true,
      token,
      user: {
        id: targetUser.id,
        username: targetUser.username,
        role: targetUser.role,
        fullName: targetUser.fullName || username,
        className: targetUser.className || '',
        department: targetUser.department || '',
        lastSyncedAt: targetUser.lastSyncedAt,
        availableRoles: userRoles.map(r => r.role)
      }
    });
  } catch (err) {
    console.error('❌ [Auth API] switch-role error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
