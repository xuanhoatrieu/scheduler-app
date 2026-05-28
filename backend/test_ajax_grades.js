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
    const http1 = createSessionAxios();
    const loginPage = await http1.get('/DangNhap/Login');
    const $ = cheerio.load(loginPage.data);
    const token = $('input[name="__RequestVerificationToken"]').val();
    
    const cookie1 = mergeCookies(loginPage.headers['set-cookie']);
    
    const formData = new URLSearchParams();
    formData.append('__RequestVerificationToken', token);
    formData.append('UserName', username);
    formData.append('Password', password);
    formData.append('Role', '0');

    const loginRes = await createSessionAxios(cookie1).post('/DangNhap/SaveToken', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${BASE_URL}/DangNhap/Login`
      }
    });

    const cookie2 = mergeCookies(loginPage.headers['set-cookie'], loginRes.headers['set-cookie']);
    const http = createSessionAxios(cookie2);

    const { parseGrades } = require('./services/parsers/studentParser');

    // Thử gọi ajax cho Kỳ 1 năm 2024
    console.log('Fetching ajax grades for HocKy 1, NamHoc 2024...');
    const ajaxRes1 = await http.get('/TraCuuDiemSV/ThongTinDiemSinhVien?HocKy=1&NamHoc=2024&ChuyenNganh=0');
    const parsed1 = parseGrades(ajaxRes1.data);
    console.log(`Parsed ${parsed1.length} courses from Kỳ 1 2024.`);
    console.log('Courses:', parsed1.map(p => p.courseName));

    // Thử gọi ajax cho Kỳ 2 năm 2024
    console.log('\nFetching ajax grades for HocKy 2, NamHoc 2024...');
    const ajaxRes2 = await http.get('/TraCuuDiemSV/ThongTinDiemSinhVien?HocKy=2&NamHoc=2024&ChuyenNganh=0');
    const parsed2 = parseGrades(ajaxRes2.data);
    console.log(`Parsed ${parsed2.length} courses from Kỳ 2 2024.`);
    console.log('Courses:', parsed2.map(p => p.courseName));
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
