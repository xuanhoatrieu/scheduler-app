/**
 * Middleware bảo vệ Admin Portal — Yêu cầu xác thực Mật khẩu Quản trị viên (Admin Secret Key)
 * 
 * ✅ NGUYÊN TẮC BẢO VỆ:
 *   1. Mọi API Quản trị (/api/admin/*, /api/documents/admin/*) BẮT BUỘC phải có header x-admin-key hợp lệ.
 *   2. Ngoại lệ duy nhất: Endpoint /api/admin/login để gửi mật khẩu xác thực.
 *   3. Giao diện Web /admin: Cho phép tải giao diện để hiển thị màn hình Đăng Nhập Quản Trị Viên (Admin Gate),
 *      nhưng toàn bộ API nạp dữ liệu bên dưới đều bị khóa chặt nếu chưa đăng nhập.
 */

function cleanIp(ip) {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip.trim();
}

function isLanOrLocalIp(rawIp) {
  const ip = cleanIp(rawIp);
  if (!ip) return false;

  // 1. Localhost
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return true;
  }

  // 2. Class A Private: 10.0.0.0 - 10.255.255.255
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return true;
  }

  // 3. Class C Private: 192.168.0.0 - 192.168.255.255
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return true;
  }

  // 4. Class B Private: 172.16.0.0 - 172.31.255.255
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  return false;
}

function adminLocalGuard(req, res, next) {
  // Cho phép endpoint xác thực login đi qua
  if (req.path === '/login' || req.originalUrl === '/api/admin/login') {
    return next();
  }

  const secretKey = process.env.ADMIN_SECRET_KEY || 'tuafadmin2026';
  const providedKey = req.query.key || req.headers['x-admin-key'] || req.cookies?.admin_key;

  // 1. Xác thực mật khẩu quản trị viên hợp lệ -> Cho phép
  if (providedKey && String(providedKey).trim() === secretKey) {
    return next();
  }

  // 2. Chặn các tunnel lậu bên thứ 3 thật sự
  const forwardedHost = (req.headers['x-forwarded-host'] || '').toLowerCase();
  const isBannedTunnel = forwardedHost.includes('loca.lt') || 
                         forwardedHost.includes('ngrok') || 
                         forwardedHost.includes('trycloudflare.com');
  if (isBannedTunnel) {
    return res.status(403).json({
      success: false,
      message: '❌ Bị từ chối: Không được phép truy cập qua Public Tunnel.'
    });
  }

  // 3. Mọi API Quản trị (/api/admin/*, /api/documents/admin/*): BẮT BUỘC phải có mật khẩu hợp lệ
  const isApiRequest = req.originalUrl.startsWith('/api/admin') || 
                       req.originalUrl.startsWith('/api/documents/admin');
  if (isApiRequest) {
    return res.status(401).json({
      success: false,
      message: '❌ Bị từ chối: Yêu cầu xác thực Mật khẩu Quản trị viên (x-admin-key).'
    });
  }

  // 4. Trang Web /admin: Cho phép tải giao diện để hiển thị Form Đăng Nhập Quản Trị Viên (Admin Gate)
  next();
}

module.exports = { adminLocalGuard, isLanOrLocalIp };

