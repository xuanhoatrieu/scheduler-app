const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const { parseLecturerSchedule } = require('./parsers/lecturerParser');

const SSO_URL = 'https://sso.tuaf.edu.vn';
const GV_URL = 'https://giangvien.tuaf.edu.vn';
const CHROME_PATH = '/usr/bin/google-chrome';

/**
 * Đăng nhập SSO Giảng viên bằng Puppeteer headless browser.
 * Cổng GV dùng SPA + OIDC client-side → cần browser thật để xử lý JS.
 *
 * @param {string} username - Tài khoản giảng viên
 * @param {string} password - Mật khẩu giảng viên
 * @returns {Object} { success, cookies[], fullName, browser, page }
 */
const loginLecturer = async (username, password) => {
  let browser;
  try {
    console.log('🔐 [Lecturer] Khởi động Puppeteer headless...');
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Bước 1: Truy cập cổng GV — SPA sẽ tự redirect sang SSO login
    console.log('  📄 Truy cập cổng giảng viên...');
    await page.goto(GV_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Kiểm tra xem đã redirect sang SSO login chưa
    const currentUrl = page.url();
    console.log(`  📍 Current URL: ${currentUrl}`);

    if (currentUrl.includes('sso.tuaf.edu.vn')) {
      // Đang ở trang SSO login
      console.log('  ✅ Đang ở trang SSO, điền thông tin đăng nhập...');

      // Điền username + password
      await page.waitForSelector('input[name="Username"]', { timeout: 10000 });
      await page.type('input[name="Username"]', username, { delay: 50 });
      await page.type('input[name="Password"]', password, { delay: 50 });

      // Click login
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.click('button[type="submit"], button[name="button"]')
      ]);

      const afterLoginUrl = page.url();
      console.log(`  📍 After login URL: ${afterLoginUrl}`);

      // Kiểm tra lỗi đăng nhập
      if (afterLoginUrl.includes('sso.tuaf.edu.vn/Account/Login')) {
        const errorText = await page.evaluate(() => {
          const el = document.querySelector('.alert-danger, .text-danger, .validation-summary-errors');
          return el ? el.textContent.trim() : '';
        });
        await browser.close();
        return { success: false, error: errorText || 'Sai tài khoản hoặc mật khẩu.' };
      }
    }

    // Bước 2: Chờ cổng GV load xong sau OIDC callback
    console.log('  ⏳ Chờ cổng GV xử lý OIDC callback...');

    // Chờ trang GV load (sau khi OIDC redirect xong)
    try {
      await page.waitForFunction(
        () => window.location.hostname === 'giangvien.tuaf.edu.vn' && !window.location.pathname.includes('signin-oidc'),
        { timeout: 20000 }
      );
    } catch (e) {
      // Nếu vẫn ở /signin-oidc, chờ thêm
      console.log('  ⏳ Chờ redirect hoàn tất...');
      await new Promise(r => setTimeout(r, 5000));
    }

    const finalUrl = page.url();
    console.log(`  📍 Final URL: ${finalUrl}`);

    // Bước 3: Lấy cookies từ browser
    const allCookies = await page.cookies();
    const cookieString = allCookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Bước 4: Lấy tên giảng viên từ giao diện
    let fullName = 'Giảng viên TUAF';
    try {
      // Chờ giao diện load
      await new Promise(r => setTimeout(r, 5000));
      fullName = await page.evaluate(() => {
        // Thử nhiều selector phổ biến trên cổng GV
        const selectors = [
          '.user-name-text', '.user-name', '.dropdown-toggle .d-xl-inline-block',
          '.dropdown-toggle', '.user-info', '.display-name',
          '#userName', '.navbar-text', '.profile-name', '.header-profile-user',
          '.text-start .ms-1', 'span.ms-1', '.user-name-sub-text'
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          const text = el ? el.textContent.trim() : '';
          // Tên hợp lệ: > 3 ký tự, < 50, không phải menu text
          if (text.length > 3 && text.length < 50 && !text.includes('Đăng') && !text.includes('Menu')) {
            return text;
          }
        }
        // Thử lấy từ sessionStorage (GV portal lưu 'enjsufo')
        const userInfo = sessionStorage.getItem('enjsufo');
        if (userInfo) {
          try {
            const parsed = JSON.parse(userInfo);
            return parsed.hoTen || parsed.fullName || parsed.name || parsed.tenGiangVien || '';
          } catch (e) {}
        }
        // Thử lấy từ tất cả text elements chứa 'Giảng viên'
        const allText = document.body.innerText;
        const match = allText.match(/(?:Xin chào|Chào)\s*[,:]?\s*([^\n]{3,40})/i);
        if (match) return match[1].trim();
        return '';
      }) || 'Giảng viên TUAF';
    } catch (e) {
      console.warn('  ⚠️ Không lấy được tên GV từ giao diện');
    }

    console.log(`  👤 Giảng viên: ${fullName}`);

    return {
      success: true,
      cookies: allCookies,
      cookieString,
      fullName,
      browser,
      page
    };
  } catch (error) {
    console.error('❌ Login Lecturer Error:', error.message);
    if (browser) await browser.close();
    return { success: false, error: `Đăng nhập thất bại: ${error.message}` };
  }
};

/**
 * Đồng bộ toàn bộ dữ liệu giảng dạy của Giảng viên
 */
const syncLecturerData = async (username, password, options = { semester: '2', schoolYear: '2025' }) => {
  const loginResult = await loginLecturer(username, password);

  if (!loginResult.success) {
    throw new Error(loginResult.error);
  }

  const { cookieString, fullName, browser, page } = loginResult;
  let scheduleList = [];

  try {
    // Dùng Puppeteer page đã login để navigate đến trang lịch dạy
    console.log('⏳ Đang cào lịch dạy giảng viên...');

    // URL chính xác sau khi Puppeteer redirect: /LichGiangDay/Index
    // Thử nhiều URL patterns
    const scheduleUrls = [
      `${GV_URL}/LichGiangDay/Index`,
      `${GV_URL}/LichGiangDay`,
      `${GV_URL}/TraCuuLichDay/ThongTinLichDay`,
    ];

    for (const schedUrl of scheduleUrls) {
      if (scheduleList.length > 0) break;
      try {
        console.log(`  🔍 Thử: ${schedUrl}`);
        await page.goto(schedUrl, { waitUntil: 'networkidle2', timeout: 20000 });

        // Chờ SPA render — tìm select box học kỳ hoặc table
        await new Promise(r => setTimeout(r, 3000));

        // Thử chọn học kỳ và năm học qua form controls
        try {
          await page.evaluate((sem, year) => {
            // Tìm và set giá trị cho select/dropdown học kỳ
            const selects = document.querySelectorAll('select');
            for (const sel of selects) {
              const label = (sel.previousElementSibling || {}).textContent || '';
              const name = sel.name || sel.id || '';
              if (name.toLowerCase().includes('hocky') || label.includes('Học kỳ')) {
                sel.value = sem;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
              }
              if (name.toLowerCase().includes('namhoc') || label.includes('Năm học')) {
                sel.value = year;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
            // Click nút tìm kiếm nếu có
            const btn = document.querySelector('button[type=submit], .btn-search, .btn-primary, #btnSearch, #btnTimKiem');
            if (btn) btn.click();
          }, options.semester, options.schoolYear);
        } catch (e) { /* form controls might not exist */ }

        // Chờ kết quả render
        await new Promise(r => setTimeout(r, 5000));

        const html = await page.content();
        console.log(`  📄 Page: ${html.length} bytes | URL: ${page.url()}`);

        if (html.length > 2000) {
          const batchSchedules = parseLecturerSchedule(html);
          if (batchSchedules.length > 0) {
            batchSchedules.forEach(item => {
              item.semester = `HocKy${options.semester}`;
              item.schoolYear = `${options.schoolYear}-${parseInt(options.schoolYear) + 1}`;
              item.batch = 'Dothoc1';
              item.teacherName = fullName;
            });
            scheduleList = batchSchedules;
            console.log(`  ✅ Tìm thấy ${batchSchedules.length} lịch dạy!`);
          }
        }
      } catch (err) {
        console.warn(`  ⚠️ ${schedUrl}: ${err.message}`);
      }
    }

    // Fallback: Thử intercept AJAX requests từ SPA
    if (scheduleList.length === 0) {
      console.log('  ℹ️ Thử intercept AJAX data từ SPA...');
      try {
        let ajaxData = null;
        page.on('response', async (response) => {
          const url = response.url();
          if (url.includes('LichGiang') || url.includes('LichDay') || url.includes('GetLich')) {
            try {
              const json = await response.json();
              if (Array.isArray(json) && json.length > 0) {
                ajaxData = json;
                console.log(`  ✅ Intercepted AJAX: ${url} (${json.length} records)`);
              }
            } catch (e) {}
          }
        });

        // Reload trang để bắt AJAX calls
        await page.goto(`${GV_URL}/LichGiangDay/Index`, { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise(r => setTimeout(r, 8000));

        if (ajaxData) {
          scheduleList = ajaxData.map(item => ({
            courseName: item.tenHocPhan || item.TenHocPhan || item.tenMon || item.TenMon || '',
            credits: item.soTinChi || item.SoTinChi || 0,
            classCode: item.maLop || item.MaLop || item.tenLop || item.TenLop || '',
            studyTime: item.thoiGian || item.ThoiGian || '',
            dayOfWeek: item.thu || item.Thu || 2,
            periodText: item.tiet || item.Tiet || '',
            room: item.phong || item.Phong || item.diaDiem || item.DiaDiem || '',
            teacherName: fullName,
            semester: `HocKy${options.semester}`,
            schoolYear: `${options.schoolYear}-${parseInt(options.schoolYear) + 1}`,
            batch: 'Dothoc1'
          }));
        }
      } catch (e) {
        console.warn('  ⚠️ AJAX intercept failed:', e.message);
      }
    }

    console.log(`  📊 Kết quả: ${scheduleList.length} lịch dạy`);
  } finally {
    // Đóng browser
    if (browser) {
      await browser.close();
      console.log('  🔒 Browser đã đóng');
    }
  }

  return {
    fullName,
    className: 'Giảng viên TUAF',
    department: 'Khoa Công nghệ thông tin',
    scheduleList
  };
};

module.exports = {
  loginLecturer,
  syncLecturerData
};
