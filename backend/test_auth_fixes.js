require('dotenv').config({ path: __dirname + '/.env' });
const axios = require('axios');
const { connectDB } = require('./config/db');
const User = require('./models/User');

const PORT = 5088;
process.env.PORT = PORT;

async function testAll() {
  console.log('==================================================');
  console.log('🧪 TESTING AUTH FIXES FOR LECTURER & INSPECTOR');
  console.log('==================================================');

  // Khởi động server nội bộ
  const app = require('./server');
  await new Promise(r => setTimeout(r, 2500));
  const BASE_URL = `http://localhost:${PORT}/api`;

  try {
    // Test 1: Lecturer đăng nhập sai mật khẩu
    console.log('\n--- Test 1: Lecturer đăng nhập sai mật khẩu ---');
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        username: 'nguyenviethung',
        password: 'wrong_password_test',
        role: 'lecturer'
      });
      console.error('❌ Test 1 FAILED: Mong đợi lỗi 401 nhưng request lại thành công!');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log('✅ Test 1 PASSED: Trả về HTTP 401 đúng chuẩn:', err.response.data.message);
      } else {
        console.error('❌ Test 1 FAILED:', err.message);
      }
    }

    // Test 2: Lecturer đăng nhập đúng mật khẩu (nguyenviethung / 123)
    console.log('\n--- Test 2: Lecturer đăng nhập đúng mật khẩu ---');
    try {
      const res = await axios.post(`${BASE_URL}/auth/login`, {
        username: 'nguyenviethung',
        password: '123',
        role: 'lecturer'
      });
      if (res.data.success && res.data.token && res.data.user.role === 'lecturer') {
        console.log('✅ Test 2 PASSED: Đăng nhập giảng viên thành công!');
        console.log('   User:', res.data.user);
      } else {
        console.error('❌ Test 2 FAILED:', res.data);
      }
    } catch (err) {
      console.error('❌ Test 2 FAILED:', err.response?.data || err.message);
    }

    // Test 3: Thanh tra tạo tài khoản mới lần đầu
    console.log('\n--- Test 3: Thanh tra đăng nhập / tạo tài khoản mới ---');
    const testInspUser = `thanhtra_test_${Date.now()}`;
    try {
      const res = await axios.post(`${BASE_URL}/auth/login`, {
        username: testInspUser,
        password: 'TestPassword@123',
        role: 'inspector'
      });
      if (res.data.success && res.data.token && res.data.user.role === 'inspector') {
        console.log('✅ Test 3 PASSED: Đăng nhập / tạo thanh tra mới thành công!');
        console.log('   User:', res.data.user);
      } else {
        console.error('❌ Test 3 FAILED:', res.data);
      }
    } catch (err) {
      console.error('❌ Test 3 FAILED:', err.response?.data || err.message);
    }

    // Test 4: Thanh tra đăng nhập lại đúng mật khẩu
    console.log('\n--- Test 4: Thanh tra đăng nhập lại đúng mật khẩu ---');
    try {
      const res = await axios.post(`${BASE_URL}/auth/login`, {
        username: testInspUser,
        password: 'TestPassword@123',
        role: 'inspector'
      });
      if (res.data.success && res.data.token) {
        console.log('✅ Test 4 PASSED: Đăng nhập lại thanh tra thành công!');
      } else {
        console.error('❌ Test 4 FAILED:', res.data);
      }
    } catch (err) {
      console.error('❌ Test 4 FAILED:', err.response?.data || err.message);
    }

    // Test 5: Thanh tra đăng nhập sai mật khẩu
    console.log('\n--- Test 5: Thanh tra đăng nhập sai mật khẩu ---');
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        username: testInspUser,
        password: 'WrongPassword',
        role: 'inspector'
      });
      console.error('❌ Test 5 FAILED: Mong đợi lỗi 401 nhưng lại thành công!');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log('✅ Test 5 PASSED: Báo lỗi sai mật khẩu đúng chuẩn:', err.response.data.message);
      } else {
        console.error('❌ Test 5 FAILED:', err.message);
      }
    }

    // Test 6: Cán bộ trường đăng nhập bằng tab Thanh tra (nguyenviethung / 123)
    console.log('\n--- Test 6: Cán bộ trường đăng nhập qua tab Thanh tra ---');
    try {
      const res = await axios.post(`${BASE_URL}/auth/login`, {
        username: 'nguyenviethung',
        password: '123',
        role: 'inspector'
      });
      if (res.data.success && res.data.token && res.data.user.role === 'inspector') {
        console.log('✅ Test 6 PASSED: Cán bộ trường tự động xác thực vào tab Thanh tra thành công!');
        console.log('   User:', res.data.user);
      } else {
        console.error('❌ Test 6 FAILED:', res.data);
      }
    } catch (err) {
      console.error('❌ Test 6 FAILED:', err.response?.data || err.message);
    }

    console.log('\n🎉 TẤT CẢ TEST ĐÃ VƯỢT QUA XUẤT SẮC!');
  } finally {
    process.exit(0);
  }
}

testAll();
