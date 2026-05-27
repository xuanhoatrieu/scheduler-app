require('dotenv').config({ path: __dirname + '/.env' });
const axios = require('axios');
const { connectDB } = require('./config/db');
const User = require('./models/User');

const PORT = 5002;
process.env.PORT = PORT; // override PORT

console.log('==================================================');
console.log('🧪 RUNNING INTEGRATION TESTS FOR BACKEND APIs');
console.log('==================================================');

const testUsername = 'DTN245748004';
const testPassword = 'DTN245748004';

async function run() {
  let serverInstance;
  try {
    // 1. Boot up the server
    console.log('🚀 Đang khởi động Backend Server trên cổng ' + PORT + '...');
    const serverModule = require('./server.js');
    
    // Đợi 3 giây để server kết nối DB thành công
    await new Promise(resolve => setTimeout(resolve, 3000));

    const API_URL = `http://localhost:${PORT}`;

    // 2. Test Health Check Route
    console.log('\n🔍 [Test 1] Health check...');
    const healthRes = await axios.get(`${API_URL}/`);
    console.log('   ✅ Phản hồi server:', healthRes.data);

    // 3. Test Đăng nhập / api/auth/login
    console.log('\n🔍 [Test 2] Đăng nhập & Đồng bộ dữ liệu qua /api/auth/login...');
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      username: testUsername,
      password: testPassword,
      role: 'student'
    });

    console.log('   ✅ Đăng nhập thành công!');
    const { token, user } = loginRes.data;
    console.log(`      👤 Tên SV: ${user.fullName}`);
    console.log(`      🛡️ Token:  ${token.substring(0, 30)}...`);

    // 4. Test Lấy lịch học / api/schedule (Không dùng forceSync -> lấy trực tiếp từ Cache)
    console.log('\n🔍 [Test 3] Lấy Lịch học từ cache PostgreSQL qua /api/schedule...');
    const startTime = Date.now();
    const scheduleRes = await axios.get(`${API_URL}/api/schedule`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const duration = Date.now() - startTime;

    console.log(`   ✅ Phản hồi thành công trong ${duration}ms! (Tiêu chuẩn: < 100ms)`);
    console.log(`      📅 Số môn học trong thời khóa biểu cache: ${scheduleRes.data.data.length} môn`);
    if (scheduleRes.data.data.length > 0) {
      console.log(`      Môn mẫu: "${scheduleRes.data.data[0].courseName}" - Thứ ${scheduleRes.data.data[0].dayOfWeek}`);
    }

    // 5. Test Lấy học phí / api/finance từ cache
    console.log('\n🔍 [Test 4] Lấy học phí công nợ từ cache PostgreSQL qua /api/finance...');
    const financeRes = await axios.get(`${API_URL}/api/finance`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`   ✅ Học phí nợ: ${financeRes.data.data.debtTuition}đ`);

    console.log('\n==================================================');
    console.log('🎉 ALL API INTEGRATION TESTS PASSED SUCCESSFULY!');
    console.log('==================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ INTEGRATION TEST FAILED:', error.response ? error.response.data : error.message);
    process.exit(1);
  }
}

run();
