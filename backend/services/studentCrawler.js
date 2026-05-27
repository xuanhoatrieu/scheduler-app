const axios = require('axios');
const cheerio = require('cheerio');
const { parseSchedule, parseExams, parseGrades, parseFinance } = require('./parsers/studentParser');

const BASE_URL = 'https://sinhvien.tuaf.edu.vn';

/**
 * Tạo instance Axios chuyên biệt cho cổng sinh viên TUAF
 */
const createSessionAxios = (cookieStr = '') => {
  return axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    maxRedirects: 5,
    validateStatus: (status) => status < 500,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      ...(cookieStr ? { Cookie: cookieStr } : {})
    }
  });
};

/**
 * Trộn và gộp các Cookie từ HTTP Headers set-cookie
 */
const mergeCookies = (...headerSets) => {
  const map = {};
  for (const headers of headerSets) {
    if (!headers) continue;
    const arrayHeaders = Array.isArray(headers) ? headers : [headers];
    for (const raw of arrayHeaders) {
      const [pair] = raw.split(';');
      const [k, v] = pair.split('=');
      if (k) map[k.trim()] = v ? v.trim() : '';
    }
  }
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
};

/**
 * Đăng nhập Sinh viên và trích xuất cookie phiên làm việc
 * @param {string} username - Mã sinh viên
 * @param {string} password - Mật khẩu cổng sinh viên
 * @returns {Object} { success: boolean, cookie: string, fullName: string, className: string, department: string, error?: string }
 */
const loginStudent = async (username, password) => {
  try {
    const http = createSessionAxios();
    
    // 1. Gửi GET để nhận Token CSRF
    const loginPage = await http.get('/DangNhap/Login');
    const $ = cheerio.load(loginPage.data);
    const token = $('input[name="__RequestVerificationToken"]').val();
    
    if (!token) {
      return { success: false, error: 'Không tìm thấy CSRF Token bảo vệ từ cổng trường.' };
    }

    const cookie1 = mergeCookies(loginPage.headers['set-cookie']);
    
    // 2. Chuẩn bị FormData đăng nhập
    const formData = new URLSearchParams();
    formData.append('__RequestVerificationToken', token);
    formData.append('UserName', username);
    formData.append('Password', password);
    formData.append('Role', '0'); // Sinh viên

    // 3. POST Đăng nhập
    const loginRes = await createSessionAxios(cookie1).post('/DangNhap/SaveToken', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${BASE_URL}/DangNhap/Login`
      }
    });

    const cookie2 = mergeCookies(loginPage.headers['set-cookie'], loginRes.headers['set-cookie']);

    // 4. Kiểm tra xem đăng nhập thành công hay thất bại
    const $res = cheerio.load(loginRes.data);
    const alertText = $res('.alert, .text-danger, #error-message, .validation-summary-errors').text().trim();
    
    if (alertText && (alertText.includes('không chính xác') || alertText.includes('sai'))) {
      return { success: false, error: 'Mã sinh viên hoặc mật khẩu cổng trường không chính xác.' };
    }

    // 5. Xác thực thành công -> Lấy thông tin sinh viên từ trang chủ /SinhVien/Home
    const homeRes = await createSessionAxios(cookie2).get('/SinhVien/Home');
    const $home = cheerio.load(homeRes.data);
    
    const fullName = $home('.dropdown-toggle, .user-name, td:contains("Họ tên") + td').first().text().trim() || 'Sinh viên TUAF';
    const rawClass = $home('body').text().match(/Lớp\s*:\s*([A-Za-z0-9&.\-\s]+)/i);
    const className = rawClass ? rawClass[1].trim() : 'Chưa cập nhật';
    const department = $home('body').text().includes('Công nghệ thông tin') ? 'Khoa Công nghệ thông tin' : 'TUAF';

    return {
      success: true,
      cookie: cookie2,
      fullName,
      className,
      department
    };
  } catch (error) {
    console.error('Login Student Error:', error);
    return { success: false, error: `Kết nối tới cổng trường TUAF thất bại: ${error.message}` };
  }
};

/**
 * Đồng bộ toàn bộ dữ liệu Sinh viên (Lịch học, Lịch thi, Điểm, Học phí)
 * @param {string} username - Mã sinh viên
 * @param {string} password - Mật khẩu cổng sinh viên
 * @param {Object} options - { semester: string, schoolYear: string }
 * @returns {Object} Đối tượng dữ liệu cào sạch sẽ
 */
const syncStudentData = async (username, password, options = { semester: '2', schoolYear: '2025' }) => {
  const loginResult = await loginStudent(username, password);
  
  if (!loginResult.success) {
    throw new Error(loginResult.error);
  }

  const { cookie, fullName, className, department } = loginResult;
  const http = createSessionAxios(cookie);
  
  let scheduleList = [];
  let examList = [];
  let gradeList = [];
  let financeData = { totalTuition: 0, paidTuition: 0, debtTuition: 0, invoiceDetails: [] };

  // 1. Cào Lịch Học (Duyệt qua Đợt học từ 1 đến 6 của học kỳ)
  console.log(`⏳ Đang cào thời khóa biểu học kỳ ${options.semester} năm học ${options.schoolYear}...`);
  for (let batch = 1; batch <= 6; batch++) {
    try {
      const schedulePath = `/TraCuuLichHoc/ThongTinLichHoc?HocKy=${options.semester}&NamHoc=${options.schoolYear}&ChuyenNganh=0&Dothoc=${batch}`;
      const res = await http.get(schedulePath);
      if (res.status === 200 && res.data.length > 500) {
        const batchSchedules = parseSchedule(res.data);
        if (batchSchedules.length > 0) {
          // Gắn thêm thuộc tính đợt học (batch)
          batchSchedules.forEach(item => {
            item.semester = `HocKy${options.semester}`;
            item.schoolYear = `${options.schoolYear}-${parseInt(options.schoolYear) + 1}`;
            item.batch = `Dothoc${batch}`;
          });
          scheduleList = [...scheduleList, ...batchSchedules];
        }
      }
    } catch (err) {
      console.warn(`⚠️ Lỗi khi cào đợt học ${batch}:`, err.message);
    }
  }

  // 2. Cào Lịch Thi (Thăm dò các endpoint lịch thi phổ biến)
  console.log('⏳ Đang thăm dò và cào lịch thi...');
  const examPaths = [
    `/TraCuuLichHoc/ThongTinLichThi?HocKy=${options.semester}&NamHoc=${options.schoolYear}`,
    '/SinhVien/LichThi',
    '/TraCuuLichHoc/LichThi'
  ];
  for (const path of examPaths) {
    try {
      const res = await http.get(path);
      if (res.status === 200 && res.data.length > 500) {
        const parsedExams = parseExams(res.data);
        if (parsedExams.length > 0) {
          parsedExams.forEach(item => {
            item.semester = `HocKy${options.semester}`;
            item.schoolYear = `${options.schoolYear}-${parseInt(options.schoolYear) + 1}`;
          });
          examList = parsedExams;
          break; // Tìm thấy và cào thành công -> thoát
        }
      }
    } catch (err) {
      console.warn(`⚠️ Lỗi khi cào lịch thi ở ${path}:`, err.message);
    }
  }

  // 3. Cào Kết Quả Học Tập (Bảng Điểm)
  console.log('⏳ Đang thăm dò và cào bảng điểm...');
  const gradePaths = [
    `/Diem/KetQuaHocTap?HocKy=${options.semester}&NamHoc=${options.schoolYear}`,
    '/Diem/DiemNganh',
    '/Diem/KetQuaHocTap'
  ];
  for (const path of gradePaths) {
    try {
      const res = await http.get(path);
      if (res.status === 200 && res.data.length > 500) {
        const parsedGrades = parseGrades(res.data);
        if (parsedGrades.length > 0) {
          parsedGrades.forEach(item => {
            item.semester = `HocKy${options.semester}`;
            item.schoolYear = `${options.schoolYear}-${parseInt(options.schoolYear) + 1}`;
          });
          gradeList = parsedGrades;
          break;
        }
      }
    } catch (err) {
      console.warn(`⚠️ Lỗi khi cào bảng điểm ở ${path}:`, err.message);
    }
  }

  // 4. Cào Tài Chính Học Phí
  console.log('⏳ Đang thăm dò và cào học phí...');
  const financePaths = [
    '/HocPhi/CongNoHocPhi',
    '/Finance/CongNoHocPhi',
    '/HocPhi/CongNo'
  ];
  for (const path of financePaths) {
    try {
      const res = await http.get(path);
      if (res.status === 200 && res.data.length > 500) {
        const parsedFinance = parseFinance(res.data);
        if (parsedFinance.totalTuition > 0) {
          parsedFinance.semester = `HocKy${options.semester}`;
          financeData = parsedFinance;
          break;
        }
      }
    } catch (err) {
      console.warn(`⚠️ Lỗi khi cào học phí ở ${path}:`, err.message);
    }
  }

  return {
    fullName,
    className,
    department,
    scheduleList,
    examList,
    gradeList,
    financeData
  };
};

module.exports = {
  loginStudent,
  syncStudentData
};
