const axios = require('axios');
const cheerio = require('cheerio');
const namvietConnector = require('./namvietConnector');
const { verifyIdentityV3Hash } = require('./identityHasher');

const SSO_URL = 'https://sso.tuaf.edu.vn';

/**
 * Thử xác thực qua SSO HTTP (không cần Puppeteer hay Chrome)
 */
async function authenticateViaSSO(username, password) {
  try {
    const client = axios.create({
      baseURL: SSO_URL,
      timeout: 10000,
      withCredentials: true,
      maxRedirects: 0,
      validateStatus: (status) => status < 400 || status === 302,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });

    const getRes = await client.get('/Account/Login');
    const cookies = getRes.headers['set-cookie'] || [];
    const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
    const $ = cheerio.load(getRes.data);
    const token = $('input[name="__RequestVerificationToken"]').val();

    if (!token) return { success: false, error: 'Không lấy được CSRF token từ SSO' };

    const postData = new URLSearchParams({
      Username: username,
      Password: password,
      RememberLogin: 'false',
      button: 'login',
      __RequestVerificationToken: token
    });

    const postRes = await client.post('/Account/Login', postData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr
      }
    });

    // Nếu chuyển hướng (302) và có cookie phiên -> Đăng nhập SSO thành công
    if (postRes.status === 302) {
      const respCookies = postRes.headers['set-cookie'] || [];
      const sessionCookie = respCookies.find(c => c.includes('idsrv.session') || c.includes('.AspNetCore.Cookies'));
      if (sessionCookie || postRes.headers.location) {
        return { success: true, method: 'SSO_HTTP' };
      }
    }

    const $2 = cheerio.load(postRes.data);
    const errorText = $2('.alert-danger, .text-danger, .validation-summary-errors').text().trim().replace(/\s+/g, ' ');
    return { success: false, error: errorText || 'Sai tài khoản hoặc mật khẩu SSO.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Xác thực thông tin cán bộ/giảng viên qua SQL Server TUAF
 * 1. Kiểm tra PasswordHash trong IdentityServerNongLam (PBKDF2 HMAC-SHA256)
 * 2. Kiểm tra Mat_khau trong HR_LyLich (Plaintext)
 * 3. Fallback xác thực qua SSO HTTP
 * 
 * @param {string} username - Mã cán bộ hoặc tên tài khoản
 * @param {string} password - Mật khẩu
 * @returns {Promise<Object>} { success, lecturer, method, error }
 */
async function authenticateLecturer(username, password) {
  try {
    const pool = await namvietConnector.getPool();

    // 1. Tìm thông tin trong HR_LyLich (bắt buộc phải là cán bộ/giảng viên TUAF)
    const hrRes = await pool.request()
      .input('username', username)
      .query(`
        SELECT TOP 1 ID_cb, Ma_cb, Ho_ten, Mat_khau, Email, Dien_thoai
        FROM HR_LyLich
        WHERE Ma_cb = @username OR Email = @username
      `);
    const hrUser = hrRes.recordset[0] || null;

    // 2. Tìm thông tin tài khoản trong IdentityServerNongLam
    const idRes = await pool.request()
      .input('username', username)
      .query(`
        SELECT TOP 1 Id, UserName, Email, PasswordHash
        FROM IdentityServerNongLam.dbo.AspNetUsers
        WHERE UserName = @username OR Email = @username
      `);
    const idUser = idRes.recordset[0] || null;

    let isAuthenticated = false;
    let authMethod = '';

    // Cách A: Xác thực PBKDF2 qua IdentityServer PasswordHash (nhanh nhất ~5ms)
    if (idUser && idUser.PasswordHash) {
      if (verifyIdentityV3Hash(idUser.PasswordHash, password)) {
        isAuthenticated = true;
        authMethod = 'IdentityServer_PBKDF2';
      }
    }

    // Cách B: Kiểm tra mật khẩu trong HR_LyLich
    if (!isAuthenticated && hrUser && hrUser.Mat_khau) {
      if (hrUser.Mat_khau === password) {
        isAuthenticated = true;
        authMethod = 'HR_LyLich_Plaintext';
      }
    }

    // Cách C: Thử qua SSO HTTP nếu có username trên cổng
    if (!isAuthenticated) {
      const ssoRes = await authenticateViaSSO(username, password);
      if (ssoRes.success) {
        isAuthenticated = true;
        authMethod = 'SSO_HTTP';
      }
    }

    if (!isAuthenticated) {
      return {
        success: false,
        error: 'Tài khoản hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!'
      };
    }

    // Lấy tên và thông tin từ HR_LyLich nếu có, hoặc từ IdentityUser
    const fullName = hrUser ? hrUser.Ho_ten : (idUser ? idUser.UserName : username);
    const lecturerId = hrUser ? hrUser.ID_cb : null;

    return {
      success: true,
      authMethod,
      fullName,
      className: 'Giảng viên',
      department: 'Giảng viên TUAF',
      lecturerId,
      email: hrUser?.Email || idUser?.Email || ''
    };
  } catch (err) {
    console.error('❌ [LecturerAuth] Lỗi xác thực:', err.message);
    // Fallback: Thử SSO HTTP độc lập
    const ssoFallback = await authenticateViaSSO(username, password);
    if (ssoFallback.success) {
      return {
        success: true,
        authMethod: 'SSO_HTTP_Fallback',
        fullName: username,
        className: 'Giảng viên',
        department: 'Giảng viên TUAF',
        lecturerId: null
      };
    }
    return {
      success: false,
      error: `Lỗi kết nối máy chủ xác thực: ${err.message}`
    };
  }
}

module.exports = {
  authenticateLecturer,
  authenticateViaSSO
};
