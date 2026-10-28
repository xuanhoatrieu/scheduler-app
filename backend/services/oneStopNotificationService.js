const { Op } = require('sequelize');
const DeviceToken = require('../models/DeviceToken');
const NotificationOutbox = require('../models/NotificationOutbox');
const ServiceRequest = require('../models/ServiceRequest');
const ServiceCatalog = require('../models/ServiceCatalog');
const configService = require('./configService');
const { createTransporter, getReportRecipients, escapeHtml } = require('./emailReportService');

/**
 * Đưa một thông báo đẩy (Push Notification) vào bảng NotificationOutbox cho userId
 */
async function enqueueUserPush({ userId, dedupeKey, title, body, data = {} } = {}) {
  if (!userId || !title || !body) return false;
  try {
    const devices = await DeviceToken.findAll({
      where: { userId, isActive: true },
    });
    if (!devices || devices.length === 0) return false;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2 * 24 * 3600 * 1000);
    const key = dedupeKey || `onestop:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    await NotificationOutbox.findOrCreate({
      where: { dedupeKey: key },
      defaults: {
        dedupeKey: key,
        userId,
        kind: 'announcement',
        silent: false,
        title,
        body,
        data: JSON.stringify({ type: 'onestop', ...data }),
        targetTokens: JSON.stringify(devices.map((d) => d.token)),
        status: 'pending',
        attempts: 0,
        notBefore: now,
        expiresAt,
      },
    });
    return true;
  } catch (err) {
    console.warn('⚠️ [OneStopNotify] Không thể xếp hàng Push Notification:', err.message);
    return false;
  }
}

/**
 * Gửi email HTML qua cấu hình SMTP của hệ thống
 */
async function sendOneStopEmail({ to, cc = null, subject, html } = {}) {
  if (!to) return false;
  try {
    const transporter = createTransporter();
    if (!transporter) return false;

    const senderUser = configService.get('SMTP_USER') || process.env.SMTP_USER;
    const fromName = configService.get('SMTP_FROM_NAME') || 'Một Cửa Số TUAF';

    const mailOptions = {
      from: `"${fromName}" <${senderUser}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
    };
    if (cc) {
      mailOptions.cc = Array.isArray(cc) ? cc.join(', ') : cc;
    }

    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.warn('⚠️ [OneStopNotify] Lỗi gửi email Một cửa:', err.message);
    return false;
  }
}

/**
 * 1. Thông báo cho Cán bộ thụ lý khi có Hồ sơ mới
 */
async function notifyNewRequest(request, service) {
  if (!request) return;
  const staffUserId = request.assignedTo || service?.assigneeUserId;
  const staffEmail = service?.assigneeEmail;
  const deadlineStr = request.deadlineAt
    ? new Date(request.deadlineAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : '';

  const title = `📋 Hồ sơ Một cửa mới #${request.requestCode}`;
  const body = `${request.studentFullName} (${request.studentUsername || 'Cựu SV'}) đăng ký: ${
    request.serviceName
  }. Hạn xử lý: ${deadlineStr}`;

  if (staffUserId) {
    await enqueueUserPush({
      userId: staffUserId,
      dedupeKey: `onestop:new:${request.requestCode}:${staffUserId}`,
      title,
      body,
      data: { requestId: request.id, requestCode: request.requestCode },
    });
  }

  if (staffEmail) {
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background: #166534; color: #fff; padding: 18px 24px;">
          <h2 style="margin: 0; font-size: 18px;">Tiếp nhận Hồ sơ Một cửa Mới #${escapeHtml(request.requestCode)}</h2>
        </div>
        <div style="padding: 20px 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
          <p>Xin chào <strong>${escapeHtml(service?.assigneeName || 'Cán bộ thụ lý')}</strong>,</p>
          <p>Hệ thống Một cửa Số TUAF vừa tiếp nhận hồ sơ mới thuộc bộ phận <strong>${escapeHtml(request.assignedDepartment)}</strong>:</p>
          <ul>
            <li><strong>Mã hồ sơ:</strong> ${escapeHtml(request.requestCode)}</li>
            <li><strong>Thủ tục:</strong> ${escapeHtml(request.serviceName)}</li>
            <li><strong>Người nộp:</strong> ${escapeHtml(request.studentFullName)} (${escapeHtml(request.studentUsername || 'Cựu sinh viên')})</li>
            <li><strong>Hình thức nhận:</strong> ${escapeHtml(request.deliveryMethod)}</li>
            <li><strong>Hạn cam kết (SLA):</strong> <span style="color: #dc2626; font-weight: bold;">${escapeHtml(deadlineStr)}</span></li>
          </ul>
          <p>Vui lòng truy cập Bàn làm việc Một cửa trên Trang Quản trị hoặc mục Tiện ích trên App để xử lý đúng hạn.</p>
        </div>
      </div>
    `;
    await sendOneStopEmail({
      to: staffEmail,
      subject: `[Một cửa TUAF] Hồ sơ mới #${request.requestCode} - ${request.serviceName}`,
      html,
    });
  }
}

/**
 * 2. Thông báo cho Cán bộ khi Sinh viên tải lên biên lai nộp lệ phí
 */
async function notifyReceiptUploaded(request, service) {
  if (!request) return;
  const staffUserId = request.assignedTo || service?.assigneeUserId;
  const staffEmail = service?.assigneeEmail;

  const title = `💳 Chờ duyệt lệ phí #${request.requestCode}`;
  const body = `SV ${request.studentFullName} đã tải ảnh biên lai nộp lệ phí (${Number(
    request.feeAmount || 0
  ).toLocaleString('vi-VN')}đ). Chạm để đối soát.`;

  if (staffUserId) {
    await enqueueUserPush({
      userId: staffUserId,
      dedupeKey: `onestop:receipt:${request.requestCode}:${Date.now()}`,
      title,
      body,
      data: { requestId: request.id, requestCode: request.requestCode },
    });
  }

  if (staffEmail) {
    await sendOneStopEmail({
      to: staffEmail,
      subject: `[Một cửa TUAF] Đã tải biên lai lệ phí hồ sơ #${request.requestCode}`,
      html: `<p>Sinh viên <strong>${escapeHtml(
        request.studentFullName
      )}</strong> vừa tải lên ảnh biên lai chuyển khoản cho hồ sơ <strong>#${escapeHtml(
        request.requestCode
      )}</strong> (${escapeHtml(
        Number(request.feeAmount || 0).toLocaleString('vi-VN')
      )} VNĐ). Vui lòng kiểm tra và xác nhận trên hệ thống.</p>`,
    });
  }
}

/**
 * 3. Thông báo cập nhật trạng thái hồ sơ cho Sinh viên / Cựu sinh viên
 */
async function notifyStudentStatusUpdate(request, { title, body } = {}) {
  if (!request || !title || !body) return;

  if (request.studentUserId) {
    await enqueueUserPush({
      userId: request.studentUserId,
      dedupeKey: `onestop:status:${request.requestCode}:${request.status}:${Date.now()}`,
      title,
      body,
      data: { requestId: request.id, requestCode: request.requestCode, status: request.status },
    });
  }

  if (request.studentEmail) {
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background: #166534; color: #fff; padding: 18px 24px;">
          <h2 style="margin: 0; font-size: 17px;">${escapeHtml(title)}</h2>
        </div>
        <div style="padding: 20px 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
          <p>Xin chào <strong>${escapeHtml(request.studentFullName)}</strong>,</p>
          <p>${escapeHtml(body)}</p>
          <ul>
            <li><strong>Mã hồ sơ:</strong> ${escapeHtml(request.requestCode)}</li>
            <li><strong>Thủ tục:</strong> ${escapeHtml(request.serviceName)}</li>
            <li><strong>Trạng thái hiện tại:</strong> ${escapeHtml(request.status)}</li>
            ${
              request.trayLocation
                ? `<li><strong>Vị trí nhận bản giấy:</strong> ${escapeHtml(request.trayLocation)}</li>`
                : ''
            }
            ${
              request.postalTrackingNumber
                ? `<li><strong>Mã vận đơn Bưu điện:</strong> ${escapeHtml(request.postalTrackingNumber)}</li>`
                : ''
            }
            ${
              request.staffNote
                ? `<li><strong>Ghi chú từ cán bộ:</strong> ${escapeHtml(request.staffNote)}</li>`
                : ''
            }
          </ul>
        </div>
      </div>
    `;
    await sendOneStopEmail({
      to: request.studentEmail,
      subject: `[Một cửa TUAF] ${title}`,
      html,
    });
  }
}

/**
 * 4. Cảnh báo sắp đến hạn (còn <= 4 giờ) cho Cán bộ thụ lý
 */
async function notifyNearDueWarning(request, service) {
  if (!request) return;
  const staffUserId = request.assignedTo || service?.assigneeUserId;
  const title = `⚠️ Sắp đến hạn SLA: Hồ sơ #${request.requestCode}`;
  const body = `Hồ sơ "${request.serviceName}" của ${request.studentFullName} chỉ còn chưa đầy 4 giờ làm việc để hoàn thành.`;

  if (staffUserId) {
    await enqueueUserPush({
      userId: staffUserId,
      dedupeKey: `onestop:neardue:${request.requestCode}`,
      title,
      body,
      data: { requestId: request.id, requestCode: request.requestCode },
    });
  }
}

/**
 * 5. Cảnh báo Quá hạn SLA cho Cán bộ + Lãnh đạo phòng & Gửi thông báo xin lỗi gia hạn cho Sinh viên
 */
async function notifyOverdueEscalation(request, service) {
  if (!request) return;
  const staffUserId = request.assignedTo || service?.assigneeUserId;
  const staffEmail = service?.assigneeEmail;
  const leaderEmail = service?.leaderEmail;

  // 5a. Nhắc cán bộ & CC Lãnh đạo
  const staffTitle = `🔴 QUÁ HẠN SLA: Hồ sơ #${request.requestCode}`;
  const staffBody = `Hồ sơ "${request.serviceName}" của ${request.studentFullName} đã quá hạn cam kết. Yêu cầu nhập báo cáo giải trình và xử lý gấp!`;

  if (staffUserId) {
    await enqueueUserPush({
      userId: staffUserId,
      dedupeKey: `onestop:overdue:${request.requestCode}`,
      title: staffTitle,
      body: staffBody,
      data: { requestId: request.id, requestCode: request.requestCode },
    });
  }

  if (staffEmail || leaderEmail) {
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #fecaca; border-radius: 12px; overflow: hidden;">
        <div style="background: #dc2626; color: #fff; padding: 18px 24px;">
          <h2 style="margin: 0; font-size: 17px;">🔴 Cảnh báo Hồ sơ Quá hạn SLA #${escapeHtml(request.requestCode)}</h2>
        </div>
        <div style="padding: 20px 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
          <p>Hồ sơ hành chính Một cửa dưới đây đã vượt quá thời hạn giải quyết cam kết (SLA):</p>
          <ul>
            <li><strong>Mã hồ sơ:</strong> ${escapeHtml(request.requestCode)}</li>
            <li><strong>Thủ tục:</strong> ${escapeHtml(request.serviceName)} (${escapeHtml(request.assignedDepartment)})</li>
            <li><strong>Người nộp:</strong> ${escapeHtml(request.studentFullName)} (${escapeHtml(request.studentUsername || 'Cựu SV')})</li>
            <li><strong>Cán bộ phụ trách:</strong> ${escapeHtml(request.assignedStaffName || service?.assigneeName || 'Chưa rõ')}</li>
            <li><strong>Hạn cam kết:</strong> ${escapeHtml(new Date(request.deadlineAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }))}</li>
          </ul>
          <p style="color: #dc2626; font-weight: bold;">Theo quy định, cán bộ thụ lý bắt buộc phải nhập Báo cáo giải trình lý do chậm trễ trên hệ thống trước khi hoàn tất hồ sơ này.</p>
        </div>
      </div>
    `;
    await sendOneStopEmail({
      to: staffEmail || leaderEmail,
      cc: staffEmail && leaderEmail ? leaderEmail : null,
      subject: `[Cảnh báo SLA Một cửa] Hồ sơ quá hạn #${request.requestCode} - ${request.serviceName}`,
      html,
    });
  }

  // 5b. Gửi thông báo xin lỗi & gia hạn tự động cho Sinh viên (chuẩn Nghị định 61/2018/NĐ-CP)
  await notifyStudentStatusUpdate(request, {
    title: `Thông báo gia hạn xử lý hồ sơ #${request.requestCode}`,
    body: `Bộ phận Một cửa xin cáo lỗi vì hồ sơ "${request.serviceName}" của bạn cần thêm thời gian phối hợp xác minh. Hệ thống đã đôn đốc bộ phận chuyên môn ưu tiên giải quyết sớm nhất cho bạn.`,
  });
}

/**
 * 6. Gửi Email thông báo cho Lãnh đạo khi Cán bộ nộp Báo cáo giải trình quá hạn
 */
async function notifyOverdueExplanationSubmitted(request, service) {
  const leaderEmail = service?.leaderEmail;
  if (!request || !leaderEmail) return;

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden;">
      <div style="background: #0f172a; color: #fff; padding: 18px 24px;">
        <h2 style="margin: 0; font-size: 17px;">📝 Báo cáo Giải trình Hồ sơ Quá hạn #${escapeHtml(request.requestCode)}</h2>
      </div>
      <div style="padding: 20px 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
        <p>Kính gửi <strong>${escapeHtml(service?.leaderName || 'Lãnh đạo đơn vị')}</strong>,</p>
        <p>Cán bộ <strong>${escapeHtml(request.overdueExplainedByName || request.assignedStaffName || 'Thụ lý')}</strong> vừa nộp báo cáo giải trình cho hồ sơ quá hạn <strong>#${escapeHtml(request.requestCode)}</strong>:</p>
        <ul>
          <li><strong>Thủ tục:</strong> ${escapeHtml(request.serviceName)}</li>
          <li><strong>Sinh viên:</strong> ${escapeHtml(request.studentFullName)} (${escapeHtml(request.studentUsername || 'Cựu SV')})</li>
          <li><strong>Nhóm nguyên nhân:</strong> ${escapeHtml(request.overdueReasonCategory || 'Khác')}</li>
          <li><strong>Nội dung giải trình:</strong> <em>"${escapeHtml(request.overdueReason || '')}"</em></li>
        </ul>
      </div>
    </div>
  `;

  await sendOneStopEmail({
    to: leaderEmail,
    subject: `[Giải trình Một cửa] Hồ sơ #${request.requestCode} - ${request.overdueReasonCategory || ''}`,
    html,
  });
}

/**
 * 7. Gửi Báo cáo Tổng hợp Tuần (Weekly Executive Digest) cho Ban Giám hiệu & Trưởng phòng
 * Chỉ gửi khi trong tuần có hoạt động hồ sơ hoặc hồ sơ quá hạn.
 */
async function sendWeeklyOneStopDigestEmail({ fromDate, toDate, force = false } = {}) {
  try {
    const end = toDate ? new Date(toDate) : new Date();
    const start = fromDate ? new Date(fromDate) : new Date(end.getTime() - 7 * 24 * 3600 * 1000);

    const requests = await ServiceRequest.findAll({
      where: {
        submittedAt: { [Op.between]: [start, end] },
      },
      order: [['submittedAt', 'DESC']],
    });

    if (!force && requests.length === 0) {
      return {
        success: false,
        skipped: true,
        reason: 'no_activity',
        message: 'Bỏ qua gửi báo cáo Một cửa tuần: Không có hồ sơ phát sinh trong tuần.',
      };
    }

    const total = requests.length;
    const completed = requests.filter(
      (r) => String(r.status || '').toLowerCase() === 'completed'
    ).length;
    const overdueList = requests.filter((r) => r.isOverdue);
    const onTimeRate = total > 0 ? Math.round(((total - overdueList.length) / total) * 100) : 100;

    if (!force && overdueList.length === 0 && total === 0) {
      return {
        success: false,
        skipped: true,
        reason: 'all_normal',
        message: 'Bỏ qua gửi báo cáo Một cửa: Không có sự kiện bất thường.',
      };
    }

    const recipients = await getReportRecipients();
    if (!recipients || recipients.length === 0) {
      return { success: false, message: 'Chưa cấu hình danh sách email nhận báo cáo!' };
    }

    const overdueRows = overdueList.length
      ? overdueList
          .map(
            (r, i) => `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px; text-align: center;">${i + 1}</td>
            <td style="padding: 8px; font-weight: 700;">${escapeHtml(r.requestCode)}</td>
            <td style="padding: 8px;">${escapeHtml(r.serviceName)} (${escapeHtml(r.assignedDepartment)})</td>
            <td style="padding: 8px;">${escapeHtml(r.assignedStaffName || '—')}</td>
            <td style="padding: 8px;">${escapeHtml(r.overdueReason || 'Chưa nhập giải trình')}</td>
          </tr>`
          )
          .join('')
      : `<tr><td colspan="5" style="padding: 14px; text-align: center; color: #166534;">✔ 100% hồ sơ trong kỳ đều được giải quyết đúng hạn SLA.</td></tr>`;

    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 720px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background: #14532d; color: #fff; padding: 22px 24px; text-align: center;">
          <h2 style="margin: 0;">BÁO CÁO GIÁM SÁT DỊCH VỤ MỘT CỬA SỐ TUAF</h2>
          <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9;">Tổng hợp tình hình giải quyết thủ tục hành chính sinh viên</p>
        </div>
        <div style="padding: 24px;">
          <p><strong>Tổng số hồ sơ tiếp nhận:</strong> ${total} | <strong>Đã hoàn thành:</strong> ${completed} | <strong>Tỷ lệ đúng hạn SLA:</strong> ${onTimeRate}% | <strong>Quá hạn:</strong> ${overdueList.length}</p>
          <h3 style="color: #991b1b; font-size: 15px; margin-top: 20px;">Danh sách hồ sơ quá hạn & Giải trình của cán bộ:</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #f1f5f9; text-align: left;">
                <th style="padding: 8px; width: 40px;">STT</th>
                <th style="padding: 8px;">Mã HS</th>
                <th style="padding: 8px;">Thủ tục / Đơn vị</th>
                <th style="padding: 8px;">Cán bộ</th>
                <th style="padding: 8px;">Nội dung giải trình</th>
              </tr>
            </thead>
            <tbody>${overdueRows}</tbody>
          </table>
        </div>
      </div>
    `;

    const sent = await sendOneStopEmail({
      to: recipients,
      subject: `[TUAF Một Cửa] Báo cáo Tổng hợp Giám sát SLA & Giải trình`,
      html,
    });

    return {
      success: sent,
      total,
      completed,
      overdueCount: overdueList.length,
      onTimeRate,
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = {
  enqueueUserPush,
  sendOneStopEmail,
  notifyNewRequest,
  notifyReceiptUploaded,
  notifyStudentStatusUpdate,
  notifyNearDueWarning,
  notifyOverdueEscalation,
  notifyOverdueExplanationSubmitted,
  sendWeeklyOneStopDigestEmail,
};
