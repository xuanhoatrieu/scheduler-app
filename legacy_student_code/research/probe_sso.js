const axios = require('axios');
const cheerio = require('cheerio');

async function probe() {
  console.log('Thăm dò sso.tuaf.edu.vn...');
  
  const url = 'https://sso.tuaf.edu.vn';
  try {
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
    console.log('Tiêu đề trang SSO:', $('title').text().trim());
    
    const forms = $('form');
    console.log(`Số lượng form: ${forms.length}`);
    forms.each((i, formEl) => {
      const action = $(formEl).attr('action');
      const method = $(formEl).attr('method') || 'GET';
      console.log(`Form #${i + 1}: action="${action}", method="${method}"`);
      const inputs = $(formEl).find('input, select, button');
      inputs.each((j, inputEl) => {
        const name = $(inputEl).attr('name');
        const type = $(inputEl).attr('type') || $(inputEl).prop('tagName').toLowerCase();
        const val = $(inputEl).attr('value') || '';
        console.log(`  - Input: name="${name}", type="${type}", value="${val}"`);
      });
    });
  } catch (err) {
    console.error('Lỗi khi thăm dò SSO:', err.message);
  }
}

probe();
