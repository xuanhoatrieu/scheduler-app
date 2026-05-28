const axios = require('axios');
const cheerio = require('cheerio');
const { parseSchedule, parseExams, parseGrades, parseFinance } = require('./parsers/studentParser');
const { parseCurriculum } = require('./parsers/curriculumParser');

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
    
    const userMenuHtml = $home('#ulMenu2 .styMenu').html() || '';
    let fullName = 'Sinh viên TUAF';
    let className = 'Chưa cập nhật';
    if (userMenuHtml) {
      const parts = userMenuHtml.split(/<br\s*\/?>/i).map(x => cheerio.load(`<div>${x}</div>`).text().trim());
      if (parts[0]) fullName = parts[0];
      if (parts[1]) className = parts[1];
    }
    
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
  let curriculumList = [];

  // 1. Cào Lịch Học (Duyệt qua Đợt học từ 1 đến 6 của học kỳ)
  console.log(`⏳ Đang cào thời khóa biểu học kỳ ${options.semester} năm học ${options.schoolYear}...`);
  for (let batch = 1; batch <= 6; batch++) {
    try {
      const schedulePath = `/TraCuuLichHoc/ThongTinLichHoc?HocKy=${options.semester}&NamHoc=${options.schoolYear}&ChuyenNganh=0&Dothoc=${batch}`;
      const res = await http.get(schedulePath);
      if (res.status === 200 && res.data.length > 500) {
        const batchSchedules = parseSchedule(res.data);
        if (batchSchedules.length > 0) {
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

  // 2. Cào Lịch Thi (Sử dụng đúng endpoint của cổng TUAF)
  console.log('⏳ Đang cào lịch thi...');
  const examPaths = [
    `/TraCuuLichThi/Index?HocKy=${options.semester}&NamHoc=${options.schoolYear}`,
    '/TraCuuLichThi/Index'
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
          break;
        }
      }
    } catch (err) {
      console.warn(`⚠️ Lỗi khi cào lịch thi ở ${path}:`, err.message);
    }
  }

  // 3. Cào Kết Quả Học Tập (Bảng Điểm)
  console.log('⏳ Đang cào bảng điểm...');
  const gradePaths = [
    `/TraCuuDiemSV/Index?HocKy=${options.semester}&NamHoc=${options.schoolYear}`,
    '/TraCuuDiemSV/Index'
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
  console.log('⏳ Đang cào học phí...');
  const financePaths = [
    '/TraCuuHocPhiSV/Index'
  ];
  for (const path of financePaths) {
    try {
      const res = await http.get(path);
      if (res.status === 200 && res.data.length > 500) {
        const parsedFinance = parseFinance(res.data);
        // Lấy thông tin tài chính của kỳ hiện tại trong danh sách allFinances cào được
        const currentSemKey = `HocKy${options.semester}`;
        const currentSchoolYearKey = `${options.schoolYear}-${parseInt(options.schoolYear) + 1}`;
        const currentSemFinance = parsedFinance.allFinances.find(
          f => f.semester === currentSemKey && f.schoolYear === currentSchoolYearKey
        );

        if (currentSemFinance) {
          financeData = {
            totalTuition: currentSemFinance.totalTuition,
            paidTuition: currentSemFinance.paidTuition,
            debtTuition: currentSemFinance.debtTuition,
            invoiceDetails: []
          };
        } else if (parsedFinance.totalTuition > 0) {
          financeData = {
            totalTuition: parsedFinance.totalTuition,
            paidTuition: parsedFinance.paidTuition,
            debtTuition: parsedFinance.debtTuition,
            invoiceDetails: []
          };
        }
        break;
      }
    } catch (err) {
      console.warn(`⚠️ Lỗi khi cào học phí ở ${path}:`, err.message);
    }
  }

  // 5. Cào Khung Chương trình Đào tạo (CTĐT)
  console.log('⏳ Đang cào khung chương trình đào tạo...');
  const ctdtPaths = [
    '/SinhVien/ChuyenNganhChinh',
    '/SinhVien/DaoTaoToanTruong',
    '/ChuongTrinhDaoTao/Index',
    '/KhungCTDT/Index',
    '/CTDT/Index',
    '/TraCuuChuongTrinhDaoTao/Index',
    '/SinhVien/ChuongTrinhDaoTao'
  ];
  for (const path of ctdtPaths) {
    try {
      const res = await http.get(path);
      if (res.status === 200 && res.data.length > 500) {
        const parsed = parseCurriculum(res.data);
        if (parsed.length > 0) {
          curriculumList = parsed;
          console.log(`  ✅ Cào CTĐT thành công từ ${path}: ${parsed.length} môn học`);
          break;
        }
      }
    } catch (err) {
      // Thử URL tiếp theo
    }
  }
  if (curriculumList.length === 0) {
    console.warn('  ⚠️ Không tìm được trang CTĐT trên portal, sẽ dùng fallback từ bảng điểm.');
  }

  return {
    fullName,
    className,
    department,
    scheduleList,
    examList,
    gradeList,
    financeData,
    curriculumList
  };
};

/**
 * Trích xuất năm nhập học từ MSSV (VD: DTN245748004 → 2024)
 */
const extractEnrollmentYear = (username) => {
  const match = username.match(/[A-Za-z]+(\d{2})/);
  if (match) {
    const yearShort = parseInt(match[1]);
    return yearShort >= 50 ? 1900 + yearShort : 2000 + yearShort;
  }
  return new Date().getFullYear() - 3;
};

/**
 * Tạo danh sách tất cả các kỳ từ năm nhập học đến hiện tại
 */
const generateSemesterList = (enrollmentYear) => {
  const currentYear = new Date().getFullYear();
  const semesters = [];

  for (let year = enrollmentYear; year <= currentYear; year++) {
    semesters.push({ semester: '1', schoolYear: String(year) });
    semesters.push({ semester: '2', schoolYear: String(year) });
  }

  return semesters;
};

/**
 * Đồng bộ dữ liệu lịch sử TẤT CẢ các kỳ học (Điểm + Học phí)
 * @param {string} username - Mã sinh viên
 * @param {string} password - Mật khẩu cổng sinh viên
 * @returns {Object} { allGrades: [...], allFinance: [...], semesterList: [...] }
 */
const syncAllSemesters = async (username, password) => {
  const loginResult = await loginStudent(username, password);
  
  if (!loginResult.success) {
    throw new Error(loginResult.error);
  }

  const { cookie, fullName, className, department } = loginResult;
  const http = createSessionAxios(cookie);

  const enrollmentYear = extractEnrollmentYear(username);
  const semesterList = generateSemesterList(enrollmentYear);

  console.log(`📚 [History Sync] Bắt đầu đồng bộ lịch sử thông minh cho ${username}...`);

  const allGrades = [];
  const allFinance = [];
  let courseMapping = {};

  // 1. Tải toàn bộ học phí và bản đồ môn học -> học kỳ/năm học
  try {
    console.log('⏳ Đang cào học phí lịch sử và bản đồ môn học...');
    const res = await http.get('/TraCuuHocPhiSV/Index');
    if (res.status === 200 && res.data.length > 500) {
      const parsedFinance = parseFinance(res.data);
      if (parsedFinance.allFinances && parsedFinance.allFinances.length > 0) {
        allFinance.push(...parsedFinance.allFinances);
      }
      if (parsedFinance.courseMapping) {
        courseMapping = parsedFinance.courseMapping;
        console.log(`  ✅ Cào được bản đồ học phí của ${Object.keys(courseMapping).length} môn học.`);
      }
    }
  } catch (err) {
    console.warn(`⚠️ Lỗi khi cào học phí lịch sử:`, err.message);
  }

  // 2. Tải toàn bộ bảng điểm đã học đúng 1 lần duy nhất
  try {
    console.log('⏳ Đang cào bảng điểm toàn khóa tích lũy...');
    const res = await http.get('/TraCuuDiemSV/Index');
    if (res.status === 200 && res.data.length > 500) {
      const rawGrades = parseGrades(res.data);
      console.log(`  ✅ Cào được bảng điểm gốc gồm ${rawGrades.length} môn học.`);

      // Phân bổ từng môn về đúng học kỳ/năm học dựa trên bản đồ courseMapping
      rawGrades.forEach(item => {
        const key = item.courseName.toLowerCase();
        const mapping = courseMapping[key];
        
        if (mapping) {
          item.semester = mapping.semester;
          item.schoolYear = mapping.schoolYear;
        } else {
          // Fallback: Nếu không khớp bản đồ (ví dụ môn GDQP, GDTC, hoặc môn được miễn phí),
          // ta gán tạm vào Học kỳ 1 của năm nhập học của sinh viên
          item.semester = 'HocKy1';
          item.schoolYear = `${enrollmentYear}-${enrollmentYear + 1}`;
        }
        allGrades.push(item);
      });
    }
  } catch (err) {
    console.warn(`⚠️ Lỗi khi cào bảng điểm toàn khóa:`, err.message);
  }

  console.log(`📚 [History Sync] Đồng bộ hoàn tất! Nhóm được ${allGrades.length} môn điểm chuẩn vào ${allFinance.length} kỳ học phí.`);

  return {
    fullName,
    className,
    department,
    allGrades,
    allFinance,
    semesterList,
    enrollmentYear
  };
};

module.exports = {
  loginStudent,
  syncStudentData,
  syncAllSemesters,
  extractEnrollmentYear,
  generateSemesterList
};
