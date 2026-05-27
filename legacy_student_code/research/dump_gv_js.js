const axios = require('axios');

async function dump() {
  try {
    const res = await axios.get('https://giangvien.tuaf.edu.vn/Scripts/ClientApp/build/auth/sign-in.js', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log('JS Length:', res.data.length);
    
    // Tìm các đường dẫn URL hoặc phương thức ajax
    const matches = res.data.match(/url\s*:\s*['"`][^'"`]+['"`]/g) || [];
    console.log('Các URL khớp:', matches);

    // Thử in ra các phần code có chứa '/dangnhap' hoặc '/login' hoặc '/api'
    const lines = res.data.split('\n');
    console.log(`Tổng số dòng trong file JS: ${lines.length}`);
    
    // Nếu file bị minify trên 1 dòng, hãy cắt ra các đoạn chứa các từ khóa
    const text = res.data;
    const keywords = ['/DangNhap', '/Login', '/api/', 'ajax', 'post', 'url:'];
    keywords.forEach(kw => {
      let idx = 0;
      console.log(`\n--- Phân tích từ khóa: "${kw}" ---`);
      while ((idx = text.indexOf(kw, idx)) !== -1) {
        const start = Math.max(0, idx - 150);
        const end = Math.min(text.length, idx + 150);
        console.log(`[${idx}]: ... ${text.slice(start, end).replace(/\s+/g, ' ')} ...`);
        idx += kw.length;
      }
    });

  } catch (err) {
    console.error(err.message);
  }
}

dump();
