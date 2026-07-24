/**
 * Middleware kiem tra vai tro (Role-Based Access Control)
 * Su dung: router.get('/...', authMiddleware, requireRole('inspector', 'admin'), handler)
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Khong co quyen truy cap! Chi danh cho: ' + roles.join(', ')
    });
  }
  next();
};

module.exports = { requireRole };
