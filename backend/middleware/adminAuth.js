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

function adminLocalGuard(req, res, next) {
  // Lấy IP client
  const clientIp = req.headers['x-forwarded-for']
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.socket.remoteAddress;

  const isAllowed = isLanOrLocalIp(clientIp) || isLanOrLocalIp(req.ip);

  // Chặn nếu request được forward qua tunnel public (localtunnel, ngrok...)
  const forwardedHost = req.headers['x-forwarded-host'] || '';
  if (forwardedHost && !isLanOrLocalIp(forwardedHost.split(':')[0])) {
    console.warn(`🚨 [Admin Security] Chặn truy cập từ xa qua Public Tunnel: ${forwardedHost} (IP: ${clientIp})`);
    return res.status(403).json({
      success: false,
      message: '❌ Bị từ chối: Giao diện quản trị Admin chỉ được phép truy cập từ Mạng nội bộ LAN hoặc Localhost.'
    });
  }

  if (!isAllowed) {
    console.warn(`🚨 [Admin Security] Chặn truy cập trái phép từ IP Internet ngoài: ${clientIp}`);
    return res.status(403).json({
      success: false,
      message: `❌ Bị từ chối: IP "${clientIp}" không thuộc dải mạng nội bộ (LAN / Localhost).`
    });
  }

  next();
}

module.exports = { adminLocalGuard, isLanOrLocalIp };

