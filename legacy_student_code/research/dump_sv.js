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

async function dump() {
  const http = makeAxios();

  console.log('1. Tải trang DangNhap/Login...');
  const pageRes = await http.get('/DangNhap/Login');
  const $ = cheerio.load(pageRes.data);

  const formData = new URLSearchParams();
  $('form input[type="hidden"]').each((_, el) => {
    formData.append($(el).attr('name'), $(el).attr('value') || '');
  });

  formData.append('Tentaikhoan', 'DTN245748004');
  formData.append('Matkhau', 'DTN245748004');
  formData.append('vaitro', '0');

  const cookie1 = mergeCookies(pageRes.headers['set-cookie']);

  console.log('2. Đang gửi request POST DangNhap/Login...');
  const loginRes = await makeAxios(cookie1).post('/DangNhap/Login', formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${BASE_URL}/DangNhap/Login`,
    },
  });

  const cookie2 = mergeCookies(pageRes.headers['set-cookie'], loginRes.headers['set-cookie']);
  console.log('Đăng nhập xong, cookie:', cookie2);

  console.log('3. Tải trang SinhVien/Home...');
  const homeRes = await makeAxios(cookie2).get('/SinhVien/Home');
  console.log('Status SinhVien/Home:', homeRes.status);
  
  const $home = cheerio.load(homeRes.data);
  
  console.log('\n--- THÔNG TIN SINH VIÊN TỪ TRANG CHỦ ---');
  console.log('Tiêu đề trang:', $home('title').text().trim());
  
  // Trích xuất các liên kết menu
  console.log('\n--- DANH SÁCH MENU LIÊN KẾT TRONG TRANG ---');
  $home('a').each((_, el) => {
    const text = $home(el).text().trim().replace(/\s+/g, ' ');
    const href = $home(el).attr('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      console.log(`- ${text} => ${href}`);
    }
  });

  // Hãy thử dump cấu trúc HTML nếu cần
  console.log('\n--- THỬ CÀO CÁC ĐƯỜNG DẪN CÓ THỂ CÓ LỊCH HỌC ---');
  const checkPaths = [
    '/SinhVien/LichHoc',
    '/LichHoc/Index',
    '/ThoiKhoaBieu/Index',
    '/SinhVien/ThoiKhoaBieu',
    '/Home/Index',
    '/SinhVien/LichTheoTuan'
  ];
  for (const path of checkPaths) {
    try {
      const res = await makeAxios(cookie2).get(path);
      console.log(`GET ${path} => Status: ${res.status}, Độ dài data: ${res.data.length}`);
      if (res.status === 200 && res.data.length > 500) {
        const $p = cheerio.load(res.data);
        console.log(`   Tiêu đề trang ${path}:`, $p('title').text().trim());
        // Thử tìm xem có table nào không
        console.log(`   Số lượng table:`, $p('table').length);
      }
    } catch (err) {
      console.log(`GET ${path} => Lỗi: ${err.message}`);
    }
  }
}

dump().catch(console.error);
