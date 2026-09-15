const crypto = require('crypto');

/**
 * Xác thực mật khẩu với chuỗi PasswordHash của ASP.NET Core Identity V3
 * Định dạng:
 * - 0x01 (1 byte: version)
 * - PRF algorithm (4 bytes big-endian: 1 = HMACSHA256)
 * - Iterations (4 bytes big-endian: 10000)
 * - Salt length (4 bytes big-endian: 16)
 * - Salt (16 bytes)
 * - Subkey (32 bytes)
 * 
 * @param {string} hashedPassword - Chuỗi base64 PasswordHash từ database
 * @param {string} providedPassword - Mật khẩu người dùng nhập vào
 * @returns {boolean}
 */
function verifyIdentityV3Hash(hashedPassword, providedPassword) {
  if (!hashedPassword || !providedPassword) return false;
  try {
    const decoded = Buffer.from(hashedPassword, 'base64');
    if (decoded.length < 17) return false;
    if (decoded[0] !== 0x01) return false;

    const prf = decoded.readUInt32BE(1);
    const iterCount = decoded.readUInt32BE(5);
    const saltLength = decoded.readUInt32BE(9);

    if (saltLength < 16 || decoded.length < 13 + saltLength) return false;

    const salt = decoded.subarray(13, 13 + saltLength);
    const expectedSubkey = decoded.subarray(13 + saltLength);

    let digest = 'sha256';
    if (prf === 0) digest = 'sha1';
    else if (prf === 2) digest = 'sha512';

    const actualSubkey = crypto.pbkdf2Sync(
      providedPassword,
      salt,
      iterCount,
      expectedSubkey.length,
      digest
    );

    return crypto.timingSafeEqual(expectedSubkey, actualSubkey);
  } catch (err) {
    console.error('Identity hash verify error:', err.message);
    return false;
  }
}

module.exports = { verifyIdentityV3Hash };
