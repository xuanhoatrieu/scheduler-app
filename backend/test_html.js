const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://sinhvien.tuaf.edu.vn';
const username = 'DTN245748004';
const password = 'DTN245748004';

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

async function run() {
  try {
    console.log('1. Fetching login token...');
    const http1 = createSessionAxios();
    const loginPage = await http1.get('/DangNhap/Login');
    const $ = cheerio.load(loginPage.data);
    const token = $('input[name="__RequestVerificationToken"]').val();
    
    if (!token) {
      console.error('No CSRF token found');
      return;
    }
    console.log('CSRF Token:', token);

    const cookie1 = mergeCookies(loginPage.headers['set-cookie']);
    
    const formData = new URLSearchParams();
    formData.append('__RequestVerificationToken', token);
    formData.append('UserName', username);
    formData.append('Password', password);
    formData.append('Role', '0');

    console.log('2. Posting login data...');
    const loginRes = await createSessionAxios(cookie1).post('/DangNhap/SaveToken', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${BASE_URL}/DangNhap/Login`
      }
    });

    const cookie2 = mergeCookies(loginPage.headers['set-cookie'], loginRes.headers['set-cookie']);
    console.log('Logged in! Cookie:', cookie2);

    const scratchDir = path.join(__dirname, 'scratch_html');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir);
    }

    const http = createSessionAxios(cookie2);

    // Save Home HTML
    console.log('Fetching home page...');
    const homeRes = await http.get('/SinhVien/Home');
    fs.writeFileSync(path.join(scratchDir, 'home.html'), homeRes.data);
    console.log('Saved home.html');

    // Fetch grades pages
    console.log('Fetching grades /TraCuuDiemSV/Index...');
    const gradesRes = await http.get('/TraCuuDiemSV/Index');
    fs.writeFileSync(path.join(scratchDir, 'grades_default.html'), gradesRes.data);
    console.log('Saved grades_default.html');

    // Fetch grades with specific semesters
    console.log('Fetching grades for specific semester /TraCuuDiemSV/Index?HocKy=2&NamHoc=2025...');
    const gradesSemRes = await http.get('/TraCuuDiemSV/Index?HocKy=2&NamHoc=2025');
    fs.writeFileSync(path.join(scratchDir, 'grades_sem.html'), gradesSemRes.data);
    console.log('Saved grades_sem.html');

    // Fetch finance page
    console.log('Fetching finance page /TraCuuHocPhiSV/Index...');
    const financeRes = await http.get('/TraCuuHocPhiSV/Index');
    fs.writeFileSync(path.join(scratchDir, 'finance.html'), financeRes.data);
    console.log('Saved finance.html');

    // Fetch exam page
    console.log('Fetching exam page /TraCuuLichThi/Index?HocKy=2&NamHoc=2025...');
    const examRes = await http.get('/TraCuuLichThi/Index?HocKy=2&NamHoc=2025');
    fs.writeFileSync(path.join(scratchDir, 'exams.html'), examRes.data);
    console.log('Saved exams.html');

    console.log('All done!');
  } catch (error) {
    console.error('Error running:', error);
  }
}

run();
