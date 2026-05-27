const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
  console.log('Thăm dò giangvien.tuaf.edu.vn...');
  
  const urls = [
    'https://giangvien.tuaf.edu.vn',
    'https://giangvien.tuaf.edu.vn/',
    'http://giangvien.tuaf.edu.vn',
  ];

  for (const url of urls) {
    try {
      console.log(`\n--- Requesting ${url} ---`);
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        maxRedirects: 5,
        validateStatus: s => s < 500
      });
      console.log('Status:', res.status);
      console.log('Final URL:', res.request.res.responseUrl || url);
      
      const $ = cheerio.load(res.data);
      console.log('Tiêu đề trang:', $('title').text().trim());
      
      // Kiểm tra xem có form nào không
      const forms = $('form');
      console.log(`Số lượng form: ${forms.length}`);
      forms.each((i, formEl) => {
        const action = $(formEl).attr('action');
        const method = $(formEl).attr('method') || 'GET';
        console.log(`Form #${i + 1}: action="${action}", method="${method}"`);
        const inputs = $(formEl).find('input');
        inputs.each((j, inputEl) => {
          console.log(`  - Input: name="${$(inputEl).attr('name')}", type="${$(inputEl).attr('type')}"`);
        });
      });

      // Nếu có link đăng nhập
      console.log('Các link trong trang:');
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        const txt = $(el).text().trim().replace(/\s+/g, ' ');
        if (href && (href.toLowerCase().includes('login') || href.toLowerCase().includes('dangnhap') || txt.toLowerCase().includes('đăng nhập'))) {
          console.log(`  - Link: "${txt}" => ${href}`);
        }
      });

    } catch (err) {
      console.error(`Lỗi URL ${url}:`, err.message);
    }
  }
}

probe();
