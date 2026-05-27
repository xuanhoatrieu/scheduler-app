const axios = require('axios');
const cheerio = require('cheerio');

async function checkForm(url, label) {
  console.log(`\n=================== ${label} (${url}) ===================`);
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(res.data);
    
    console.log('Tiêu đề trang:', $('title').text().trim());
    
    const forms = $('form');
    console.log(`Số lượng form tìm thấy: ${forms.length}`);
    
    forms.each((i, formEl) => {
      const action = $(formEl).attr('action');
      const method = $(formEl).attr('method') || 'GET';
      console.log(`Form #${i + 1}: action="${action}", method="${method}"`);
      
      const inputs = $(formEl).find('input, select, textarea, button');
      inputs.each((j, inputEl) => {
        const name = $(inputEl).attr('name');
        const type = $(inputEl).attr('type') || $(inputEl).prop('tagName').toLowerCase();
        const value = $(inputEl).attr('value') || '';
        if (name) {
          console.log(`  - Input: name="${name}", type="${type}", default_value="${value}"`);
        } else {
          console.log(`  - Element: type="${type}" (no name)`);
        }
      });
    });
  } catch (err) {
    console.error(`Lỗi khi lấy ${label}:`, err.message);
  }
}

async function main() {
  await checkForm('https://sinhvien.tuaf.edu.vn/DangNhap/Login', 'Sinh viên');
  await checkForm('https://giangvien.tuaf.edu.vn/DangNhap/Login', 'Giảng viên');
}

main();
