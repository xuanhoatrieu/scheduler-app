const axios = require('axios');
const cheerio = require('cheerio');

const SSO_URL = 'https://sso.tuaf.edu.vn';
const GV_URL = 'https://giangvien.tuaf.edu.vn';

function makeAxios(cookieStr = '', base = SSO_URL) {
  return axios.create({
    baseURL: base,
    withCredentials: true,
    maxRedirects: 0, // Tắt tự động redirect để ta bắt được mã code/token chuyển tiếp
    validateStatus: s => s < 500,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'vi-VN,vi;q=0.9',
      ...(cookieStr ? { Cookie: cookieStr } : {}),
    },
  });
}

function mergeCookies(...headerSets) {
  const map = {};
  for (const headers of headerSets) {
    for (const raw of (headers || [])) {
      const [pair] = raw.split(';');
      const [k, v] = pair.split('=');
      if (k) map[k.trim()] = v?.trim() ?? '';
    }
  }
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function testGV() {
  // Bắt đầu luồng đăng nhập SSO của giảng viên
  const ssoHttp = makeAxios();

  console.log('1. Tải trang đăng nhập SSO để lấy token...');
  const pageRes = await ssoHttp.get('/Account/Login?ReturnUrl=%2F');
  const $ = cheerio.load(pageRes.data);

  const token = $('input[name="__RequestVerificationToken"]').val();
  console.log('Verification Token trên SSO:', token);

  const formData = new URLSearchParams();
  formData.append('ReturnUrl', '/');
  formData.append('Username', 'xuanhoatrieu');
  formData.append('Password', 'xuanhoatrieu');
  formData.append('RememberLogin', 'true');
  formData.append('button', 'login');
  formData.append('__RequestVerificationToken', token || '');

  const cookie1 = mergeCookies(pageRes.headers['set-cookie']);
  console.log('SSO Cookie ban đầu:', cookie1);

  console.log('2. Đang gửi POST đăng nhập lên SSO...');
  const loginRes = await makeAxios(cookie1, SSO_URL).post('/Account/Login?ReturnUrl=%2F', formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${SSO_URL}/Account/Login?ReturnUrl=%2F`,
    },
  });

  console.log('Status POST SSO:', loginRes.status);
  console.log('Headers POST SSO:', JSON.stringify(loginRes.headers, null, 2));

  const cookie2 = mergeCookies(pageRes.headers['set-cookie'], loginRes.headers['set-cookie']);
  console.log('SSO Cookie sau đăng nhập:', cookie2);

  // Nếu đăng nhập thành công trên SSO, nó sẽ trả về mã redirect (thường là 302) hoặc trả về HTML chứa thông tin đăng nhập
  if (loginRes.status === 302) {
    const redirectUrl = loginRes.headers['location'];
    console.log('--> Đăng nhập thành công! Chuyển hướng tới:', redirectUrl);
  } else {
    // Nếu status là 200, có thể có lỗi đăng nhập. Thử parse lỗi
    const $res = cheerio.load(loginRes.data);
    const errMsg = $res('.alert-danger, .text-danger, .validation-summary-errors').text().trim();
    console.log('Nội dung trang đăng nhập SSO (nếu lỗi):', errMsg || 'Đăng nhập không chuyển hướng 302 nhưng không rõ lỗi.');
    console.log(loginRes.data.slice(0, 1000));
  }
}

testGV().catch(console.error);
