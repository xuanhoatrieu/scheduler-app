const axios = require('axios');

async function dump() {
  try {
    const res = await axios.get('https://giangvien.tuaf.edu.vn', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log('HTML Length:', res.data.length);
    console.log(res.data.slice(0, 2000));
  } catch (err) {
    console.error(err.message);
  }
}

dump();
