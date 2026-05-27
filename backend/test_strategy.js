// Test script to verify connection to PostgreSQL, create a test user, 
// and run the StrategyManager to crawl and cache data.
require('dotenv').config({ path: __dirname + '/.env' });
const { connectDB } = require('./config/db');
const User = require('./models/User');
const Schedule = require('./models/Schedule');
const Exam = require('./models/Exam');
const Grade = require('./models/Grade');
const Finance = require('./models/Finance');
const { encrypt } = require('./utils/security');
const strategyManager = require('./strategies/StrategyManager');

const testUsername = 'DTN245748004';
const testPassword = 'DTN245748004';

console.log('==================================================');
console.log('🧪 TESTING STRATEGY PATTERN & POSTGRESQL CACHING');
console.log('==================================================');

async function run() {
  try {
    // 1. Kết nối PostgreSQL
    await connectDB();

    // 2. Tìm hoặc Tạo tài khoản mẫu trong DB
    console.log(`👤 Đang tìm/tạo tài khoản mẫu ${testUsername} trong DB...`);
    let user = await User.findOne({ where: { username: testUsername } });
    
    const encryptedPassword = encrypt(testPassword);

    if (!user) {
      user = await User.create({
        username: testUsername,
        encryptedPassword: encryptedPassword,
        role: 'student',
        fullName: 'Sinh viên mẫu',
        className: 'Chưa cập nhật',
        department: 'TUAF'
      });
      console.log('   ✅ Đã tạo tài khoản mới thành công!');
    } else {
      user.encryptedPassword = encryptedPassword;
      await user.save();
      console.log('   ✅ Tài khoản đã tồn tại. Đã cập nhật mật khẩu mã hóa mới!');
    }

    // 3. Khởi chạy StrategyManager trích xuất & lưu cache dữ liệu
    console.log(`\n⏳ Khởi chạy StrategyManager với DATA_SOURCE=${process.env.DATA_SOURCE || 'crawler'}...`);
    const strategy = strategyManager.getStrategy();
    
    const result = await strategy.getSchedule(user, testPassword, {
      semester: '2',
      schoolYear: '2025'
    });

    console.log('\n==================================================');
    console.log('🎉 STRATEGY COMPLETED SUCCESSFULLY!');
    console.log('==================================================');
    console.log(`👤 Sinh viên: ${result.fullName}`);
    console.log(`🏫 Lớp:      ${result.className}`);
    console.log(`🎓 Khoa:     ${result.department}`);
    console.log(`📅 Thời gian đồng bộ gần nhất: ${result.lastSyncedAt}`);
    
    // 4. Truy vấn chéo PostgreSQL để xác minh Cache đã được ghi chính xác chưa
    console.log('\n🔍 BẮT ĐẦU TRUY VẤN KIỂM CHỨNG CACHE TRONG POSTGRESQL:');
    
    const cachedSchedules = await Schedule.findAll({ where: { userId: user.id } });
    console.log(`   👉 Bảng SCHEDULES: Đã ghi nhận ${cachedSchedules.length} bản ghi cache.`);
    if (cachedSchedules.length > 0) {
      console.log(`      Mẫu bản ghi 1: Môn "${cachedSchedules[0].courseName}" - Thứ ${cachedSchedules[0].dayOfWeek} - Phòng ${cachedSchedules[0].room}`);
    }

    const cachedExams = await Exam.findAll({ where: { userId: user.id } });
    console.log(`   👉 Bảng EXAMS:     Đã ghi nhận ${cachedExams.length} bản ghi cache.`);

    const cachedGrades = await Grade.findAll({ where: { userId: user.id } });
    console.log(`   👉 Bảng GRADES:    Đã ghi nhận ${cachedGrades.length} bản ghi cache.`);

    const cachedFinance = await Finance.findOne({ where: { userId: user.id } });
    console.log(`   👉 Bảng FINANCES:  ${cachedFinance ? `Đã có (Nợ: ${cachedFinance.debtTuition}đ)` : 'Không có công nợ'}`);
    
    console.log('==================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ STRATEGY TEST FAILED:', error);
    process.exit(1);
  }
}

run();
