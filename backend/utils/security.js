const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';

// Helper to get encryption key dynamically and safely
const getKey = () => {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY is undefined. Please load environment variables first.');
  }
  return Buffer.from(keyHex, 'hex');
};

/**
 * Mã hóa chuỗi text bằng AES-256-CBC
 * @param {string} text - Chuỗi văn bản cần mã hóa (mật khẩu)
 * @returns {string} iv:encryptedText (ở định dạng hex)
 */
const encrypt = (text) => {
  try {
    const KEY = getKey();
    const iv = crypto.randomBytes(16); // IV 16 bytes ngẫu nhiên

    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Mã hóa dữ liệu thất bại');
  }
};

/**
 * Giải mã chuỗi AES-256-CBC trở về ban đầu
 * @param {string} encryptedText - Chuỗi đã mã hóa định dạng iv:encryptedText
 * @returns {string} Chuỗi văn bản ban đầu
 */
const decrypt = (encryptedText) => {
  try {
    const KEY = getKey();
    const [ivHex, encryptedHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Giải mã dữ liệu thất bại. Khóa giải mã có thể bị sai lệch.');
  }
};

module.exports = { encrypt, decrypt };
