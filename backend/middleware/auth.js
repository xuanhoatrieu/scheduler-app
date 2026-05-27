const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'tuaf_schedule_secret_key_2026';

/**
 * Middleware xác thực token JWT và gán user vào req.user
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy Token xác thực. Truy cập bị từ chối!'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Tài khoản không tồn tại hoặc phiên đăng nhập đã hết hạn!'
      });
    }

    // Gán đối tượng user vào request
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Token không hợp lệ hoặc đã hết hạn!',
      error: error.message
    });
  }
};

module.exports = authMiddleware;
