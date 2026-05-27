/**
 * PORTAL ADAPTER: Đại học Nông Lâm - ĐH Thái Nguyên (TUAF)
 * URL: https://sinhvien.tuaf.edu.vn
 *
 * Cách thêm cổng mới: copy file này, đổi tên, chỉnh BASE_URL + selectors
 */

const axios = require('axios');
const cheerio = require('cheerio');

// ────────────────────────────────────────────────
// THÔNG TIN CỔNG
// ────────────────────────────────────────────────
const PORTAL_INFO = {
  id: 'tuaf',
  name: 'Đại học Nông Lâm Thái Nguyên',
  shortName: 'TUAF',
  logo: 'https://sinhvien.tuaf.edu.vn/FileManager/Upload/images/logoTruongDHThuDo.png',
  baseUrl: 'https://sinhvien.tuaf.edu.vn',
};

// Axios instance với cookie jar thủ công
function makeAxios(cookieStr = '') {
  return axios.create({
    baseURL: PORTAL_INFO.baseUrl,
    withCredentials: true,
    maxRedirects: 10,
    validateStatus: s => s < 500,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'vi-VN,vi;q=0.9',
      ...(cookieStr ? { Cookie: cookieStr } : {}),
    },
  });
}

// Hợp nhất set-cookie thành chuỗi
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

// ────────────────────────────────────────────────
// HÀM ĐĂNG NHẬP
// ────────────────────────────────────────────────
async function login(maSV, matKhau) {
  const http = makeAxios();

  // 1. Lấy trang login → lấy cookie session + token ẩn
  const pageRes = await http.get('/DangNhap/Login');
  const $ = cheerio.load(pageRes.data);

  // Lấy các hidden input (token, RequestVerificationToken, ...)
  const formData = new URLSearchParams();
  $('form input[type="hidden"]').each((_, el) => {
    formData.append($(el).attr('name'), $(el).attr('value') || '');
  });

  // Điền thông tin đăng nhập
  // (Dựa theo form HTML của trang: input name="Tentaikhoan" và "Matkhau")
  formData.append('Tentaikhoan', maSV);
  formData.append('Matkhau', matKhau);
  formData.append('vaitro', '0'); // 0 = Sinh viên

  const cookie1 = mergeCookies(pageRes.headers['set-cookie']);

  // 2. POST đăng nhập
  const loginRes = await makeAxios(cookie1).post('/DangNhap/Login', formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${PORTAL_INFO.baseUrl}/DangNhap/Login`,
    },
  });

  const cookie2 = mergeCookies(pageRes.headers['set-cookie'], loginRes.headers['set-cookie']);

  // Kiểm tra đăng nhập
  const $res = cheerio.load(loginRes.data);
  const errorMsg = $res('.alert-danger, .text-danger, #error-message').text().trim();
  if (errorMsg) throw new Error(errorMsg || 'Sai mã sinh viên hoặc mật khẩu');

  // Nếu vẫn còn form login (chưa redirect) → sai thông tin
  if ($res('form input[name="Matkhau"]').length > 0) {
    throw new Error('Sai mã sinh viên hoặc mật khẩu');
  }

  return cookie2;
}

// ────────────────────────────────────────────────
// LẤY THÔNG TIN SINH VIÊN
// ────────────────────────────────────────────────
async function getStudentInfo(maSV, cookieStr) {
  const http = makeAxios(cookieStr);
  const res = await http.get('/SinhVien/Home');
  const $ = cheerio.load(res.data);

  // Thử các selector phổ biến của hệ Nam Việt JSC
  return {
    maSV,
    hoTen:    $('.hoten, .ho-ten, td:contains("Họ tên") + td, .student-name').first().text().trim() || maSV,
    lop:      $('.lop, td:contains("Lớp") + td, .class-name').first().text().trim() || '',
    khoa:     $('.khoa, td:contains("Khoa") + td').first().text().trim() || '',
    nganh:    $('.nganh, td:contains("Ngành") + td').first().text().trim() || '',
    portal:   PORTAL_INFO.shortName,
  };
}

// ────────────────────────────────────────────────
// SCRAPE LỊCH HỌC
// ────────────────────────────────────────────────
async function getSchedule(cookieStr) {
  const http = makeAxios(cookieStr);

  // Các URL lịch học phổ biến của hệ Nam Việt JSC
  const candidates = [
    '/SinhVien/LichHoc',
    '/LichHoc/Index',
    '/ThoiKhoaBieu/Index',
    '/SinhVien/ThoiKhoaBieu',
  ];

  let html = '';
  for (const path of candidates) {
    try {
      const res = await http.get(path);
      if (res.status === 200 && res.data.length > 500) {
        html = res.data;
        break;
      }
    } catch (_) {}
  }

  if (!html) throw new Error('Không tìm thấy trang lịch học');

  const $ = cheerio.load(html);
  const schedule = [];

  // Selector cho bảng lịch học (hệ Nam Việt JSC thường dùng table.table)
  $('table.table tbody tr, table#tblLichHoc tbody tr, .lich-hoc table tbody tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;

    const thu     = $(cells[0]).text().trim();
    const monHoc  = $(cells[1]).text().trim();
    const tiet    = $(cells[2]).text().trim();
    const phong   = $(cells[3])?.text().trim() || '';
    const gv      = $(cells[4])?.text().trim() || '';
    const nhom    = $(cells[5])?.text().trim() || '';

    if (!thu || !monHoc) return;

    schedule.push({ thu, monHoc, tiet, phongHoc: phong, giangVien: gv, nhom });
  });

  return schedule;
}

// ────────────────────────────────────────────────
// EXPORT CHUẨN (adapter interface)
// ────────────────────────────────────────────────
module.exports = {
  info: PORTAL_INFO,

  async authenticate(maSV, matKhau) {
    const cookie = await login(maSV, matKhau);
    const [studentInfo, schedule] = await Promise.all([
      getStudentInfo(maSV, cookie),
      getSchedule(cookie),
    ]);
    return { studentInfo, schedule };
  },
};
