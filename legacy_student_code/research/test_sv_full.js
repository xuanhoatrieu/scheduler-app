const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://sinhvien.tuaf.edu.vn';

function makeAxios(cookieStr = '') {
  return axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    maxRedirects: 5,
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

async function testSV() {
  const http = makeAxios();

  console.log('1. Lấy trang DangNhap/Login...');
  const pageRes = await http.get('/DangNhap/Login');
  const $ = cheerio.load(pageRes.data);

  const token = $('input[name="__RequestVerificationToken"]').val();
  console.log('Token:', token);

  const formData = new URLSearchParams();
  formData.append('__RequestVerificationToken', token || '');
  formData.append('UserName', 'DTN245748004');
  formData.append('Password', 'DTN245748004');
  formData.append('Role', '0');

  const cookie1 = mergeCookies(pageRes.headers['set-cookie']);
  console.log('Cookie1:', cookie1);

  console.log('2. POST đăng nhập...');
  const loginRes = await makeAxios(cookie1).post('/DangNhap/SaveToken', formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${BASE_URL}/DangNhap/Login`,
    },
  });

  console.log('POST status:', loginRes.status);
  console.log('POST headers:', JSON.stringify(loginRes.headers, null, 2));
  
  const $res = cheerio.load(loginRes.data);
  console.log('Tiêu đề trang trả về từ POST:', $res('title').text().trim());
  
  // Tìm bất kỳ thông báo lỗi nào trong trang trả về
  const alertText = $res('.alert, .text-danger, #error-message, .validation-summary-errors').text().trim();
  if (alertText) {
    console.log('Thông báo lỗi tìm thấy:', alertText);
  } else {
    console.log('Không tìm thấy thông báo lỗi trực tiếp.');
  }

  // Thử in ra 1000 ký tự đầu tiên của body trả về
  console.log('Body HTML:\n', loginRes.data.slice(0, 1500));
}

testSV().catch(console.error);
