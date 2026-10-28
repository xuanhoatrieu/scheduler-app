/**
 * Bộ tính toán Thời hạn giải quyết thủ tục Một cửa (SLA) theo ngày làm việc (Bỏ qua Thứ 7, Chủ Nhật)
 */

const HOUR_MS = 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;

/**
 * Kiểm tra một thời điểm (Date) có rơi vào ngày nghỉ cuối tuần (Thứ 7 hoặc Chủ Nhật) theo giờ Việt Nam (UTC+7) hay không
 * @param {Date} dt
 * @returns {boolean}
 */
function isWeekendVN(dt) {
  const vnTime = new Date(dt.getTime() + VN_OFFSET_MS);
  const day = vnTime.getUTCDay(); // 0 = CN, 6 = Thứ 7
  return day === 0 || day === 6;
}

/**
 * Cộng số giờ SLA theo ngày làm việc (tự động nhảy qua Thứ 7 và Chủ Nhật)
 * @param {Date|string|number} submittedAt
 * @param {number} slaHours
 * @returns {Date}
 */
function calculateBusinessDeadline(submittedAt, slaHours = 24) {
  const start = submittedAt ? new Date(submittedAt) : new Date();
  const hoursToAdd = Math.max(1, parseInt(slaHours, 10) || 24);

  let current = new Date(start.getTime());

  // Nếu nộp vào cuối tuần, chuyển mốc bắt đầu tính sang 07:30 sáng Thứ Hai kế tiếp (giờ VN)
  while (isWeekendVN(current)) {
    const vn = new Date(current.getTime() + VN_OFFSET_MS);
    vn.setUTCDate(vn.getUTCDate() + 1);
    vn.setUTCHours(7, 30, 0, 0);
    current = new Date(vn.getTime() - VN_OFFSET_MS);
  }

  let remainingHours = hoursToAdd;
  while (remainingHours > 0) {
    current = new Date(current.getTime() + HOUR_MS);
    if (!isWeekendVN(current)) {
      remainingHours -= 1;
    }
  }

  return current;
}

/**
 * Đánh giá trạng thái SLA hiện tại của một hồ sơ Một cửa
 * @param {Object} request - Bản ghi ServiceRequest
 * @param {Date} [now]
 * @returns {{ state: string, label: string, color: string, remainingHours: number, isOverdue: boolean, isNearDue: boolean }}
 */
function evaluateSlaStatus(request, now = new Date()) {
  if (!request) {
    return {
      state: 'in_sla',
      label: 'Đang trong hạn',
      remainingText: 'Đang trong hạn',
      color: '#10b981',
      remainingHours: 24,
      overdueHours: 0,
      isOverdue: false,
      isNearDue: false,
    };
  }

  const normalizedStatus = String(request.status || '').toLowerCase();
  const terminalStatuses = ['completed', 'rejected', 'cancelled'];
  const pausedStatuses = ['pending_payment', 'need_more_info'];
  const deadline = request.deadlineAt ? new Date(request.deadlineAt) : new Date();
  const currentNow = now instanceof Date ? now : new Date(now);

  if (terminalStatuses.includes(normalizedStatus)) {
    const wasOverdue = Boolean(
      request.isOverdue ||
        (request.completedAt && new Date(request.completedAt) > deadline)
    );
    const label = wasOverdue ? 'Hoàn thành (Trễ hạn)' : 'Hoàn thành đúng hạn';
    return {
      state: wasOverdue ? 'completed_overdue' : 'completed_on_time',
      label,
      remainingText: label,
      color: wasOverdue ? '#f59e0b' : '#10b981',
      remainingHours: 0,
      overdueHours: 0,
      isOverdue: wasOverdue,
      isNearDue: false,
    };
  }

  if (pausedStatuses.includes(normalizedStatus)) {
    const label =
      normalizedStatus === 'pending_payment'
        ? 'Tạm dừng chờ sinh viên nộp lệ phí'
        : 'Tạm dừng chờ sinh viên bổ sung hồ sơ';
    return {
      state: 'paused',
      label,
      remainingText: label,
      color: '#64748b',
      remainingHours: 0,
      overdueHours: 0,
      isOverdue: false,
      isNearDue: false,
    };
  }

  const diffHours = (deadline.getTime() - currentNow.getTime()) / HOUR_MS;
  const roundedHours = Math.round(diffHours * 10) / 10;

  if (diffHours < 0 || request.isOverdue) {
    const overdueHours = Math.max(1, Math.abs(Math.round(diffHours)));
    const label = `Quá hạn ${overdueHours} giờ`;
    return {
      state: 'overdue',
      label,
      remainingText: label,
      color: '#ef4444',
      remainingHours: roundedHours,
      overdueHours,
      isOverdue: true,
      isNearDue: false,
    };
  }

  if (diffHours <= 4) {
    const label = `Sắp đến hạn (còn ${Math.max(1, Math.ceil(diffHours))}h)`;
    return {
      state: 'near_due',
      label,
      remainingText: label,
      color: '#f59e0b',
      remainingHours: roundedHours,
      overdueHours: 0,
      isOverdue: false,
      isNearDue: true,
    };
  }

  const label = `Còn ${Math.ceil(diffHours)} giờ`;
  return {
    state: 'in_sla',
    label,
    remainingText: label,
    color: '#10b981',
    remainingHours: roundedHours,
    overdueHours: 0,
    isOverdue: false,
    isNearDue: false,
  };
}

module.exports = {
  isWeekendVN,
  calculateBusinessDeadline,
  evaluateSlaStatus,
};
