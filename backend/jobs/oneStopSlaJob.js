const cron = require('node-cron');
const { Op } = require('sequelize');
const ServiceRequest = require('../models/ServiceRequest');
const ServiceCatalog = require('../models/ServiceCatalog');
const ServiceRequestLog = require('../models/ServiceRequestLog');
const { evaluateSlaStatus } = require('../utils/slaCalculator');
const {
  notifyNearDueWarning,
  notifyOverdueEscalation,
  sendWeeklyOneStopDigestEmail,
} = require('../services/oneStopNotificationService');

const ACTIVE_REQUEST_STATUSES = [
  'submitted',
  'payment_review',
  'processing',
  'ready_for_pickup',
  'PENDING',
  'WAITING_PAYMENT_CONFIRM',
  'PAID',
  'PROCESSING',
  'APPROVED',
  'READY_FOR_PICKUP',
  'DELIVERING',
];

/**
 * Quét toàn bộ các hồ sơ Một cửa đang xử lý để:
 * 1. Gửi cảnh báo sắp hết hạn (còn <= 4 giờ làm việc)
 * 2. Tự động đánh dấu quá hạn (isOverdue = true), ghi Audit Log và bắn thông báo cho Cán bộ + Lãnh đạo + Sinh viên
 */
async function scanOneStopSla(now = new Date()) {
  const activeRequests = await ServiceRequest.findAll({
    where: {
      status: { [Op.in]: ACTIVE_REQUEST_STATUSES },
    },
  });

  if (activeRequests.length === 0) {
    return { scanned: 0, nearDueWarned: 0, overdueFlagged: 0 };
  }

  const serviceIds = [...new Set(activeRequests.map((r) => r.serviceId).filter(Boolean))];
  const services = await ServiceCatalog.findAll({
    where: { id: { [Op.in]: serviceIds } },
  });
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  let nearDueWarned = 0;
  let overdueFlagged = 0;

  for (const reqItem of activeRequests) {
    const sla = evaluateSlaStatus(reqItem, now);
    const service = serviceMap.get(reqItem.serviceId);

    if (sla.state === 'overdue' && !reqItem.isOverdue) {
      reqItem.isOverdue = true;
      reqItem.overdueNotifiedAt = now;
      await reqItem.save();

      await ServiceRequestLog.create({
        requestId: reqItem.id,
        actorId: null,
        actorName: 'Hệ thống Giám sát SLA',
        actorRole: 'system',
        action: 'OVERDUE_FLAGGED',
        fromStatus: reqItem.status,
        toStatus: reqItem.status,
        note: 'Hồ sơ đã vượt quá thời hạn cam kết giải quyết (SLA). Yêu cầu cán bộ thụ lý nhập giải trình.',
      });

      await notifyOverdueEscalation(reqItem, service);
      overdueFlagged += 1;
    } else if (sla.state === 'near_due' && !reqItem.warningSentAt && !reqItem.isOverdue) {
      reqItem.warningSentAt = now;
      await reqItem.save();

      await notifyNearDueWarning(reqItem, service);
      nearDueWarned += 1;
    }
  }

  return {
    scanned: activeRequests.length,
    nearDueWarned,
    overdueFlagged,
  };
}

/**
 * Khởi động Cron Jobs cho phân hệ Một cửa:
 * - Mỗi 15 phút: Quét SLA các hồ sơ đang xử lý
 * - 17:00 Thứ Sáu hàng tuần: Gửi báo cáo tổng hợp Một cửa cho Ban Giám hiệu
 */
function initOneStopCronJobs() {
  console.log('⏰ [Cron] Khởi động Giám sát SLA Một cửa Số...');

  // Quét SLA mỗi 15 phút từ Thứ 2 -> Thứ 6
  cron.schedule(
    '*/15 7-18 * * 1-5',
    async () => {
      try {
        const res = await scanOneStopSla(new Date());
        if (res.nearDueWarned > 0 || res.overdueFlagged > 0) {
          console.log(
            `🔔 [OneStop SLA] Đã quét ${res.scanned} hồ sơ: Cảnh báo sắp hạn=${res.nearDueWarned}, Đánh dấu quá hạn=${res.overdueFlagged}`
          );
        }
      } catch (err) {
        console.error('❌ [OneStop SLA] Lỗi quét SLA:', err.message);
      }
    },
    {
      scheduled: true,
      timezone: 'Asia/Ho_Chi_Minh',
    }
  );

  // Báo cáo tuần lúc 17:00 Thứ Sáu
  cron.schedule(
    '0 17 * * 5',
    async () => {
      try {
        const result = await sendWeeklyOneStopDigestEmail();
        if (result.skipped) {
          console.log(`⏭️ [OneStop Digest] ${result.message}`);
        } else {
          console.log(
            '🏁 [OneStop Digest] Kết quả gửi báo cáo Một cửa tuần:',
            result.success ? 'THÀNH CÔNG' : result.message
          );
        }
      } catch (err) {
        console.error('❌ [OneStop Digest] Lỗi gửi báo cáo tuần:', err.message);
      }
    },
    {
      scheduled: true,
      timezone: 'Asia/Ho_Chi_Minh',
    }
  );
}

module.exports = {
  scanOneStopSla,
  initOneStopCronJobs,
};
