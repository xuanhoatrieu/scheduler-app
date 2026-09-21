/**
 * Middleware bảo vệ Admin Portal — Cho phép truy cập từ Mạng Nội Bộ (LAN) & Localhost
 * 
 * ✅ CHO PHÉP:
 *   - Localhost (127.0.0.1, ::1)
 *   - Dải mạng riêng Private LAN:
 *     + 10.0.0.0 – 10.255.255.255 (Mạng trường TUAF / Doanh nghiệp)
 *     + 192.168.0.0 – 192.168.255.255 (Mạng WiFi / Router gia đình)
 *     + 172.16.0.0 – 172.31.255.255 (Mạng Docker / Nội bộ)
 * 
 * 🚨 CHẶN TUYỆT ĐỐI:
 *   - Truy cập từ Internet bên ngoài qua Localtunnel, Ngrok, Public IP.
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

function isTrustedHost(host) {
  if (!host) return true;
  const h = host.split(':')[0].toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (h === 'scheduler.tuaf.edu.vn' || h.endsWith('.tuaf.edu.vn')) return true;
  return isLanOrLocalIp(h);
}

function adminLocalGuard(req, res, next) {
  // 0. Cho phép nếu có Admin Passkey hợp lệ
  const secretKey = process.env.ADMIN_SECRET_KEY || 'tuafadmin2026';
  const providedKey = req.query.key || req.headers['x-admin-key'] || req.cookies?.admin_key;
  if (providedKey && String(providedKey).trim() === secretKey) {
    return next();
  }

  // Lấy IP client
  const clientIp = req.headers['x-forwarded-for']
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.socket.remoteAddress;

  const isAllowed = isLanOrLocalIp(clientIp) || isLanOrLocalIp(req.ip);

  // Chỉ chặn các tunnel lậu bên thứ 3 thật sự (localtunnel, ngrok...)
  const forwardedHost = (req.headers['x-forwarded-host'] || '').toLowerCase();
  const isBannedTunnel = forwardedHost.includes('loca.lt') || 
                         forwardedHost.includes('ngrok') || 
                         forwardedHost.includes('trycloudflare.com');

  if (isBannedTunnel) {
    console.warn(`🚨 [Admin Security] Chặn truy cập từ xa qua Public Tunnel: ${forwardedHost} (IP: ${clientIp})`);
    return res.status(403).json({
      success: false,
      message: '❌ Bị từ chối: Giao diện quản trị Admin chỉ được phép truy cập từ Mạng nội bộ LAN hoặc Localhost.'
    });
  }

  // Cho phép nếu client IP thuộc LAN/Localhost hoặc truy cập qua domain chính thức trường TUAF
  const reqHost = req.headers.host || '';
  if (!isAllowed && !isTrustedHost(forwardedHost) && !isTrustedHost(reqHost)) {
    console.warn(`🚨 [Admin Security] Chặn truy cập trái phép từ IP Internet ngoài: ${clientIp}`);
    return res.status(403).json({
      success: false,
      message: `❌ Bị từ chối: IP "${clientIp}" không thuộc dải mạng nội bộ (LAN / Localhost).`
    });
  }

  next();
}

module.exports = { adminLocalGuard, isLanOrLocalIp };

