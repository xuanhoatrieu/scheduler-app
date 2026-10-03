const cron = require('node-cron');
const repo = require('../services/notificationRepo');
const pushService = require('../services/pushService');
const { createNotificationCenter } = require('../services/notificationCenter');

const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Tắt toàn bộ push bằng PUSH_ENABLED=false (mặc định bật) */
const isPushEnabled = () => String(process.env.PUSH_ENABLED || 'true').toLowerCase() !== 'false';

const center = createNotificationCenter({ repo, push: pushService });

const safe = (name, fn) => async () => {
  try {
    const r = await fn();
    if (r && !r.skipped && Object.values(r).some((v) => v)) console.log(`🔔 [Push] ${name}:`, JSON.stringify(r));
  } catch (err) {
    console.error(`🔔 [Push] Lỗi ${name}:`, err.message);
  }
};

const initPushJobs = () => {
  if (!isPushEnabled()) {
    console.log('🔕 [Push] PUSH_ENABLED=false → không chạy worker gửi thông báo.');
    return;
  }
  // Worker gửi outbox
  cron.schedule('* * * * *', safe('processOutbox', () => center.processOutbox(new Date())), { timezone: VN_TZ });
  // Receipts (Expo trả sau 15–30 phút)
  cron.schedule('*/30 * * * *', safe('checkReceipts', () => center.checkReceipts(new Date())), { timezone: VN_TZ });
  // Bản tin sáng dự phòng — chỉ cho máy chưa cập nhật lịch nhắc và chỉ khi hôm nay có buổi học/thi
  cron.schedule('0 6 * * *', safe('morningDigest', async () => ({ queued: await center.enqueueMorningDigests(new Date()) })), { timezone: VN_TZ });
  // Dọn outbox cũ
  cron.schedule('30 4 * * *', safe('purge', async () => ({ purged: await repo.purgeOldOutbox(new Date()) })), { timezone: VN_TZ });
  console.log('🔔 [Push] Đã bật worker push (outbox mỗi phút, receipts 30 phút, bản tin 06:00).');
};

module.exports = { initPushJobs, notificationCenter: center, isPushEnabled };
