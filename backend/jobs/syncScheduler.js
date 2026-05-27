const cron = require('node-cron');
const User = require('../models/User');
const { decrypt } = require('../utils/security');
const strategyManager = require('../strategies/StrategyManager');

/**
 * Hàm thực thi đồng bộ dữ liệu cho tất cả người dùng trong hệ thống
 */
const runDailySync = async () => {
  console.log('⏰ [Cron Job] Bắt đầu tiến trình đồng bộ dữ liệu tự động lúc 3:00 sáng...');
  try {
    const users = await User.findAll();
    console.log(`⏰ [Cron Job] Tìm thấy ${users.length} tài khoản người dùng cần đồng bộ.`);

    const strategy = strategyManager.getStrategy();

    for (const user of users) {
      try {
        console.log(`⏰ [Cron Job] Đang đồng bộ tài khoản: ${user.username} (Role: ${user.role})...`);
        
        // 1. Giải mã mật khẩu bằng AES-256-CBC
        const decryptedPassword = decrypt(user.encryptedPassword);

        // 2. Chạy Strategy Pattern (CrawlerStrategy) để lấy và cache dữ liệu vào PostgreSQL
        await strategy.getSchedule(user, decryptedPassword, {
          semester: '2',
          schoolYear: '2025'
        });

        console.log(`⏰ [Cron Job] Đồng bộ thành công cho ${user.username}!`);
      } catch (userError) {
        console.error(`⏰ [Cron Job] Lỗi đồng bộ tài khoản ${user.username}:`, userError.message);
      }
    }
    console.log('⏰ [Cron Job] Tiến trình đồng bộ dữ liệu tự động hoàn thành xuất sắc!');
  } catch (error) {
    console.error('⏰ [Cron Job] Lỗi nghiêm trọng trong tiến trình đồng bộ:', error.message);
  }
};

/**
 * Khởi tạo dịch vụ Cron chạy hàng ngày lúc 3:00 sáng
 */
const initCronJob = () => {
  // Định cấu hình: 3:00 AM hàng ngày -> '0 3 * * *'
  const cronSchedule = process.env.CRON_SCHEDULE || '0 3 * * *';
  
  cron.schedule(cronSchedule, () => {
    runDailySync();
  });
  
  console.log(`📅 [Cron Service] Đã thiết lập lịch đồng bộ tự động: "${cronSchedule}"`);
};

module.exports = {
  initCronJob,
  runDailySync
};
