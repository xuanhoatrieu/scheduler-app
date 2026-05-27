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

  const formData = new URLSearchParams();
  formData.append('__RequestVerificationToken', token || '');
  formData.append('UserName', 'DTN245748004');
  formData.append('Password', 'DTN245748004');
  formData.append('Role', '0');

  const cookie1 = mergeCookies(pageRes.headers['set-cookie']);

  console.log('2. POST đăng nhập...');
  const loginRes = await makeAxios(cookie1).post('/DangNhap/SaveToken', formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${BASE_URL}/DangNhap/Login`,
    },
  });

  const cookie2 = mergeCookies(pageRes.headers['set-cookie'], loginRes.headers['set-cookie']);
  
  // Parse trang trả về từ POST (chính là trang chủ sau đăng nhập)
  const $res = cheerio.load(loginRes.data);
  console.log('\n--- THÔNG TIN TRANG CHỦ SAU ĐĂNG NHẬP ---');
  console.log('Tiêu đề:', $res('title').text().trim());

  // In ra các menu links thực tế
  console.log('\n--- DANH SÁCH MENU SAU ĐĂNG NHẬP ---');
  const links = [];
  $res('a').each((_, el) => {
    const text = $res(el).text().trim().replace(/\s+/g, ' ');
    const href = $res(el).attr('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      links.push({ text, href });
      console.log(`- ${text} => ${href}`);
    }
  });

  // Tìm thông tin cá nhân (họ tên, mã SV, ...)
  console.log('\n--- TÌM THÔNG TIN CÁ NHÂN ---');
  // Hệ thống Nam Việt thường hiển thị lời chào "Chào bạn, [Tên SV]" hoặc tương tự
  const welcomeText = $res('.welcome, .dropdown-toggle, .user-name, .profile, #user-profile, .dropdown-user').text().trim().replace(/\s+/g, ' ');
  console.log('Chào mừng:', welcomeText);

  // In các text của thẻ h1, h2, h3, h4, span có thể chứa tên
  $res('span, a, p, strong, td').each((_, el) => {
    const text = $res(el).text().trim();
    if (text.includes('DTN') || text.includes('DTN245748004') || text.toLowerCase().includes('sinh viên') || text.toLowerCase().includes('đăng xuất')) {
      console.log(`Tìm thấy: [${el.tagName}] -> ${text.replace(/\s+/g, ' ')}`);
    }
  });

  // Tìm các đường dẫn liên quan đến lịch học hoặc thời khóa biểu từ danh sách menu
  const scheduleMenu = links.filter(l => l.text.toLowerCase().includes('lịch') || l.text.toLowerCase().includes('thời khóa biểu') || l.href.toLowerCase().includes('lich') || l.href.toLowerCase().includes('thoikhoabieu'));
  console.log('\nMenu lịch học phát hiện:', scheduleMenu);

  if (scheduleMenu.length > 0) {
    console.log('\n--- THỬ CÀO LỊCH HỌC TỪ MENU PHÁT HIỆN ---');
    const path = scheduleMenu[0].href;
    const schRes = await makeAxios(cookie2).get(path);
    console.log(`GET ${path} => Status: ${schRes.status}, Length: ${schRes.data.length}`);
    const $sch = cheerio.load(schRes.data);
    console.log('Tiêu đề trang lịch học:', $sch('title').text().trim());
    console.log('Số lượng table:', $sch('table').length);
    
    // Lưu HTML của trang lịch học để phân tích
    const fs = require('fs');
    fs.writeFileSync('/home/trieuhoa/lichhoc-app/schedule_page.html', schRes.data);
    console.log('Đã lưu file schedule_page.html');
  }
}

testSV().catch(console.error);
