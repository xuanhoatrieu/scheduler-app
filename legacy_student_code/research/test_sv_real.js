const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://sinhvien.tuaf.edu.vn';

function makeAxios(cookieStr = '') {
  return axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    maxRedirects: 10,
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

  console.log('1. Lấy trang DangNhap/Login để lấy Token...');
  const pageRes = await http.get('/DangNhap/Login');
  const $ = cheerio.load(pageRes.data);

  const token = $('input[name="__RequestVerificationToken"]').val();
  console.log('Token tìm thấy:', token);

  const formData = new URLSearchParams();
  formData.append('__RequestVerificationToken', token || '');
  formData.append('UserName', 'DTN245748004');
  formData.append('Password', 'DTN245748004');
  formData.append('Role', '0'); // Sinh viên

  const cookie1 = mergeCookies(pageRes.headers['set-cookie']);

  console.log('2. Đang POST đăng nhập lên /DangNhap/SaveToken...');
  const loginRes = await makeAxios(cookie1).post('/DangNhap/SaveToken', formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${BASE_URL}/DangNhap/Login`,
    },
  });

  console.log('Status POST:', loginRes.status);
  console.log('Response body:', typeof loginRes.data === 'object' ? JSON.stringify(loginRes.data) : loginRes.data.slice(0, 500));

  const cookie2 = mergeCookies(pageRes.headers['set-cookie'], loginRes.headers['set-cookie']);
  console.log('Cookie tích lũy:', cookie2);

  // Sau khi POST /DangNhap/SaveToken, trang web có thể trả về JSON chứa { success: true, redirect: '/SinhVien/Home' ... }
  // Hãy thử get SinhVien/Home bằng cookie mới
  console.log('3. GET trang SinhVien/Home...');
  const homeRes = await makeAxios(cookie2).get('/SinhVien/Home');
  console.log('Status SinhVien/Home:', homeRes.status);
  
  const $home = cheerio.load(homeRes.data);
  console.log('Tiêu đề trang SinhVien/Home:', $home('title').text().trim());

  // In ra một ít text chứa tên sinh viên để xem đăng nhập thành công chưa
  const bodyText = $home('body').text().replace(/\s+/g, ' ');
  console.log('Có chứa mã SV không?', bodyText.includes('DTN245748004'));
  console.log('Tên sinh viên hiển thị (nếu có):', $home('.student-name, .hoten, td:contains("Họ tên") + td').first().text().trim());

  // Thử tìm lịch học
  console.log('4. Thăm dò Lịch học...');
  const schedulePaths = [
    '/SinhVien/LichHoc',
    '/SinhVien/LichTheoTuan',
    '/SinhVien/ThoiKhoaBieu',
    '/LichHoc/Index'
  ];
  for (const path of schedulePaths) {
    const res = await makeAxios(cookie2).get(path);
    console.log(`GET ${path} => Status: ${res.status}, Length: ${res.data.length}`);
    if (res.status === 200 && res.data.length > 500) {
      const $sch = cheerio.load(res.data);
      console.log(`   Tiêu đề trang ${path}:`, $sch('title').text().trim());
      console.log(`   Số lượng table:`, $sch('table').length);
      // In thử 10 dòng đầu của bảng
      $sch('table').first().find('tr').slice(0, 5).each((i, tr) => {
        console.log(`     Tr #${i}:`, $sch(tr).text().trim().replace(/\s+/g, ' '));
      });
    }
  }
}

testSV().catch(console.error);
