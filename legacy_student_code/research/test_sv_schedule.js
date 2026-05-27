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
  
  // Chúng ta sẽ thử quét đợt học (Dothoc) từ 1 đến 5 để xem đợt nào có lịch
  console.log('\n3. Đang quét lịch học theo từng Đợt học của Kỳ 2, Năm học 2025-2026...');
  
  const HocKy = '2';
  const NamHoc = '2025'; // Học kỳ 2 năm học 2025-2026
  
  for (let Dothoc = 1; Dothoc <= 6; Dothoc++) {
    try {
      const path = `/TraCuuLichHoc/ThongTinLichHoc?HocKy=${HocKy}&NamHoc=${NamHoc}&ChuyenNganh=0&Dothoc=${Dothoc}`;
      const schRes = await makeAxios(cookie2).get(path);
      
      const $sch = cheerio.load(schRes.data);
      const rows = $sch('table tbody tr, tr');
      
      console.log(`GET Dothoc=${Dothoc} => Status: ${schRes.status}, Độ dài data: ${schRes.data.length}, Số dòng trong bảng: ${rows.length}`);
      
      if (rows.length > 1) { // Lớn hơn 1 dòng (vì có thể có cả dòng header hoặc dòng dữ liệu)
        console.log(`   --> Tìm thấy bảng dữ liệu của Đợt học ${Dothoc}!`);
        rows.each((i, row) => {
          const cells = [];
          $sch(row).find('td').each((j, td) => {
            cells.push($sch(td).text().trim().replace(/\s+/g, ' '));
          });
          if (cells.length > 0) {
            console.log(`       Dòng #${i}:`, cells);
          }
        });
      }
    } catch (err) {
      console.error(`Lỗi đợt ${Dothoc}:`, err.message);
    }
  }
}

testSV().catch(console.error);
