const cron = require('node-cron');
const { sendInspectorReportEmail } = require('../services/emailReportService');

/**
 * Khởi động các Cron Jobs gửi báo cáo Thanh tra tự động
 */
function initInspectorCronJobs() {
  console.log('⏰ [Cron] Khởi động lập lịch gửi báo cáo Thanh tra tự động...');

  // 1. BÁO CÁO NGÀY: 18:00 hàng ngày (Thứ 2 -> Thứ 7)
  // '0 18 * * 1-6' theo múi giờ Việt Nam (UTC+7)
  cron.schedule('0 18 * * 1-6', async () => {
    try {
      const VN_TZ = 'Asia/Ho_Chi_Minh';
      const today = new Date(new Date().toLocaleString('en-US', { timeZone: VN_TZ }));
      const todayStr = today.toISOString().split('T')[0];

      console.log(`🔔 [Cron 18:00] Bắt đầu tự động gửi Báo cáo Ngày ${todayStr}...`);
      const result = await sendInspectorReportEmail({
        from: todayStr,
        to: todayStr,
        periodType: 'daily'
      });
      console.log('🏁 [Cron 18:00] Kết quả gửi báo cáo ngày:', result.success ? 'THÀNH CÔNG' : result.message);
    } catch (err) {
      console.error('❌ [Cron 18:00] Lỗi khi chạy Báo cáo Ngày:', err.message);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Ho_Chi_Minh'
  });

  // 2. BÁO CÁO TUẦN: 08:00 Sáng Thứ Hai hàng tuần
  cron.schedule('0 8 * * 1', async () => {
    try {
      const VN_TZ = 'Asia/Ho_Chi_Minh';
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: VN_TZ }));
      
      // Lấy tuần trước (Thứ 2 tuần trước -> Chủ Nhật tuần trước)
      const lastMonday = new Date(now);
      lastMonday.setDate(now.getDate() - 7);
      const lastSunday = new Date(now);
      lastSunday.setDate(now.getDate() - 1);

      const fromStr = lastMonday.toISOString().split('T')[0];
      const toStr = lastSunday.toISOString().split('T')[0];

      console.log(`🔔 [Cron 08:00 Thứ 2] Bắt đầu tự động gửi Báo cáo Tuần (${fromStr} -> ${toStr})...`);
      const result = await sendInspectorReportEmail({
        from: fromStr,
        to: toStr,
        periodType: 'weekly'
      });
      console.log('🏁 [Cron 08:00 Thứ 2] Kết quả gửi báo cáo tuần:', result.success ? 'THÀNH CÔNG' : result.message);
    } catch (err) {
      console.error('❌ [Cron 08:00 Thứ 2] Lỗi khi chạy Báo cáo Tuần:', err.message);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Ho_Chi_Minh'
  });

  // 3. BÁO CÁO THÁNG: 08:00 Ngày mùng 1 hàng tháng
  cron.schedule('0 8 1 * *', async () => {
    try {
      const VN_TZ = 'Asia/Ho_Chi_Minh';
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: VN_TZ }));

      // Lấy tháng trước
      const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      const fromStr = firstDayPrevMonth.toISOString().split('T')[0];
      const toStr = lastDayPrevMonth.toISOString().split('T')[0];

      console.log(`🔔 [Cron Ngày 01] Bắt đầu tự động gửi Báo cáo Tháng (${fromStr} -> ${toStr})...`);
      const result = await sendInspectorReportEmail({
        from: fromStr,
        to: toStr,
        periodType: 'monthly'
      });
      console.log('🏁 [Cron Ngày 01] Kết quả gửi báo cáo tháng:', result.success ? 'THÀNH CÔNG' : result.message);
    } catch (err) {
      console.error('❌ [Cron Ngày 01] Lỗi khi chạy Báo cáo Tháng:', err.message);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Ho_Chi_Minh'
  });

  console.log('✅ [Cron] 3 lịch trình báo cáo Thanh tra (Ngày 18:00, Tuần Thứ 2, Tháng Ngày 01) đã sẵn sàng!');
}

module.exports = { initInspectorCronJobs };
