const nodemailer = require('nodemailer');
const { Op } = require('sequelize');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');

/**
 * Tạo transporter gửi mail qua Gmail / Google Workspace SMTP
 */
function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn('⚠️ [EmailService] Chưa cấu hình SMTP_USER hoặc SMTP_PASS trong .env!');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

/**
 * Lấy danh sách email nhận báo cáo của Lãnh đạo
 */
async function getReportRecipients() {
  try {
    const config = await SystemConfig.findOne({ where: { key: 'inspector_report_emails' } });
    if (config && config.value) {
      const emails = config.value.split(',').map(e => e.trim()).filter(Boolean);
      if (emails.length > 0) return emails;
    }
  } catch (e) {
    // ignore
  }

  if (process.env.INSPECTOR_REPORT_EMAILS) {
    return process.env.INSPECTOR_REPORT_EMAILS.split(',').map(e => e.trim()).filter(Boolean);
  }

  return [process.env.SMTP_USER || 'admin@tuaf.edu.vn'];
}

/**
 * Tạo HTML Template Báo cáo Thanh tra gửi Ban Giám hiệu
 */
function buildHtmlReport({ title, dateRangeText, summary, violations }) {
  const violationRows = violations.length > 0 ? violations.map((v, idx) => `
    <tr style="border-bottom: 1px solid #e0e0e0; ${idx % 2 === 0 ? 'background-color: #fafafa;' : ''}">
      <td style="padding: 10px; text-align: center; font-weight: bold; color: #555;">${idx + 1}</td>
      <td style="padding: 10px; font-weight: 600; color: #1b5e20;">${v.teacherName || 'Chưa rõ'}</td>
      <td style="padding: 10px;">
        <div style="font-weight: 600; color: #333;">${v.courseName || ''}</div>
        <div style="font-size: 12px; color: #777;">${v.classCode || ''} • Phòng: ${v.room || 'Chưa rõ'}</div>
      </td>
      <td style="padding: 10px;">
        <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: #fff; background-color: ${v.statusColor};">
          ${v.statusText}
        </span>
      </td>
      <td style="padding: 10px; text-align: center;">
        ${v.permissionBadge}
      </td>
      <td style="padding: 10px; font-size: 13px; color: #444;">
        ${v.note || v.rescheduledReason || '—'}
      </td>
    </tr>
  `).join('') : `
    <tr>
      <td colspan="6" style="padding: 24px; text-align: center; color: #2e7d32; font-weight: 600;">
        🎉 Không có trường hợp vi phạm hoặc đổi giờ bất thường trong khoảng thời gian này!
      </td>
    </tr>
  `;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f6f8; color: #333; }
    .container { max-width: 720px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1b5e20, #2e7d32); color: #ffffff; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 0.5px; }
    .header p { margin: 6px 0 0 0; font-size: 14px; opacity: 0.9; }
    .kpi-grid { display: table; width: 100%; table-layout: fixed; background: #ffffff; padding: 16px 12px; border-bottom: 2px solid #e8f5e9; }
    .kpi-cell { display: table-cell; text-align: center; padding: 10px; }
    .kpi-val { font-size: 24px; font-weight: 800; }
    .kpi-lbl { font-size: 11px; color: #666; text-transform: uppercase; margin-top: 4px; }
    .content { padding: 24px; }
    .table-wrap { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
    .table-wrap th { background-color: #2e7d32; color: #ffffff; padding: 10px; text-align: left; font-size: 12px; text-transform: uppercase; }
    .footer { background-color: #f1f3f4; padding: 18px 24px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e0e0e0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Trường Đại học Nông Lâm Thái Nguyên</h1>
      <p>BÁO CÁO CÔNG TÁC THANH TRA GIẢNG DẠY</p>
      <div style="display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 14px; border-radius: 20px; font-size: 12px; margin-top: 8px;">
        📅 ${dateRangeText}
      </div>
    </div>

    <!-- KPI SUMMARY -->
    <div class="kpi-grid">
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #1b5e20;">${summary.totalChecked || 0}</div>
        <div class="kpi-lbl">Tổng ca kiểm tra</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #2e7d32;">${summary.onTime || 0}</div>
        <div class="kpi-lbl">Đúng giờ</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #e65100;">${(summary.late || 0) + (summary.earlyLeave || 0)}</div>
        <div class="kpi-lbl">Muộn / Về sớm</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #0277bd;">${summary.rescheduledPermitted || 0}</div>
        <div class="kpi-lbl">Đổi giờ có phép</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #c62828;">${summary.rescheduledUnpermitted || 0}</div>
        <div class="kpi-lbl">Tự ý đổi giờ</div>
      </div>
    </div>

    <!-- DETAILS CONTENT -->
    <div class="content">
      <h3 style="color: #1b5e20; margin: 0 0 8px 0; font-size: 16px;">
        📋 Danh sách các sự vụ cần lưu ý:
      </h3>
      <table class="table-wrap">
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">STT</th>
            <th>Giảng viên</th>
            <th>Lớp học phần / Phòng</th>
            <th>Sự vụ</th>
            <th style="text-align: center;">Đề nghị</th>
            <th>Ghi chú / Lý do</th>
          </tr>
        </thead>
        <tbody>
          ${violationRows}
        </tbody>
      </table>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <p style="margin: 0;">Báo cáo được tổng hợp tự động từ <strong>Hệ thống Giám sát & Quản lý Lịch học TUAF Schedule</strong></p>
      <p style="margin: 4px 0 0 0;">Kính gửi: Ban Giám hiệu, Phòng Đào tạo & Phòng Thanh tra - Pháp chế</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Tổng hợp số liệu và gửi Email Báo cáo Thanh tra
 * @param {Object} options - { from, to, periodType: 'daily'|'weekly'|'monthly', customRecipients }
 */
async function sendInspectorReportEmail({ from, to, periodType = 'daily', customRecipients = null }) {
  try {
    const startDate = from || new Date().toISOString().split('T')[0];
    const endDate = to || startDate;

    console.log(`📧 [EmailService] Bắt đầu tổng hợp báo cáo thanh tra (${startDate} -> ${endDate}, loại: ${periodType})...`);

    // 1. Truy vấn các bản ghi thanh tra trong khoảng thời gian
    const records = await Attendance.findAll({
      where: {
        date: { [Op.between]: [startDate, endDate] }
      },
      order: [['date', 'ASC'], ['checkInTime', 'ASC']]
    });

    // 2. Lấy thông tin lịch dạy và giảng viên để bổ sung chi tiết
    const scheduleIds = records.map(r => r.scheduleId).filter(Boolean);
    const schedules = await Schedule.findAll({
      where: { id: { [Op.in]: scheduleIds } }
    });
    const scheduleMap = {};
    for (const s of schedules) {
      scheduleMap[s.id] = s;
    }

    // 3. Thống kê số liệu
    let totalChecked = records.length;
    let onTime = 0;
    let late = 0;
    let earlyLeave = 0;
    let absent = 0;
    let rescheduledPermitted = 0;
    let rescheduledUnpermitted = 0;
    let substitute = 0;

    const violations = [];

    for (const r of records) {
      const sch = scheduleMap[r.scheduleId];
      const teacherName = sch?.teacherName || 'Chưa rõ';
      const courseName = sch?.courseName || 'Học phần';
      const classCode = sch?.classCode || '';
      const room = sch?.room || '';

      let isViolation = false;
      let statusText = 'Đúng giờ';
      let statusColor = '#2e7d32';
      let permissionBadge = '—';

      if (r.status === 'on_time') {
        onTime++;
      } else if (r.status === 'late') {
        late++;
        isViolation = true;
        statusText = `Muộn ${r.lateMinutes || 0}p`;
        statusColor = '#e65100';
      } else if (r.status === 'early_leave') {
        earlyLeave++;
        isViolation = true;
        statusText = `Về sớm ${r.earlyMinutes || 0}p`;
        statusColor = '#f57c00';
      } else if (r.status === 'absent') {
        absent++;
        isViolation = true;
        statusText = 'Vắng mặt';
        statusColor = '#c62828';
      } else if (r.status === 'rescheduled') {
        if (r.hasPermission === true) {
          rescheduledPermitted++;
          statusText = 'Đổi giờ (Có phép)';
          statusColor = '#0277bd';
          permissionBadge = '<span style="color: #2e7d32; font-weight: bold;">✔ Đã báo</span>';
        } else {
          rescheduledUnpermitted++;
          isViolation = true;
          statusText = 'Tự ý đổi giờ';
          statusColor = '#c62828';
          permissionBadge = '<span style="color: #c62828; font-weight: bold;">✘ Không phép</span>';
        }
      } else if (r.status === 'substitute') {
        substitute++;
        statusText = `Dạy thay: ${r.substituteTeacher || 'GV khác'}`;
        statusColor = '#5c6bc0';
        permissionBadge = r.hasPermission ? '<span style="color: #2e7d32;">✔ Có phép</span>' : '<span style="color: #c62828;">✘ Chưa rõ</span>';
      }

      if (isViolation || r.status === 'rescheduled' || r.status === 'substitute') {
        violations.push({
          teacherName,
          courseName,
          classCode,
          room,
          statusText,
          statusColor,
          permissionBadge,
          note: r.note,
          rescheduledReason: r.rescheduledReason
        });
      }
    }

    const summary = {
      totalChecked,
      onTime,
      late,
      earlyLeave,
      absent,
      rescheduledPermitted,
      rescheduledUnpermitted,
      substitute
    };

    // 4. Tạo nội dung Email
    let periodTitle = 'BÁO CÁO NGÀY';
    if (periodType === 'weekly') periodTitle = 'BÁO CÁO TUẦN';
    if (periodType === 'monthly') periodTitle = 'BÁO CÁO THÁNG';

    const dateRangeText = startDate === endDate ? `Ngày ${startDate}` : `Từ ${startDate} đến ${endDate}`;
    const subject = `[TUAF Thanh Tra] ${periodTitle} - ${dateRangeText}`;
    const html = buildHtmlReport({ title: periodTitle, dateRangeText, summary, violations });

    // 5. Xác định danh sách nhận
    const recipients = customRecipients || await getReportRecipients();
    if (!recipients || recipients.length === 0) {
      console.warn('⚠️ [EmailService] Không có người nhận báo cáo nào được cấu hình.');
      return { success: false, message: 'Chưa cấu hình danh sách người nhận báo cáo!' };
    }

    // 6. Gửi email qua Transporter
    const transporter = createTransporter();
    if (!transporter) {
      return {
        success: false,
        message: 'Chưa cấu hình SMTP Gmail trong .env (SMTP_USER, SMTP_PASS)',
        previewSummary: summary,
        violationsCount: violations.length,
        recipients
      };
    }

    const info = await transporter.sendMail({
      from: `"Thanh Tra Đào Tạo TUAF" <${process.env.SMTP_USER}>`,
      to: recipients.join(', '),
      subject,
      html
    });

    console.log(`✅ [EmailService] Báo cáo đã gửi thành công tới: ${recipients.join(', ')} (Message ID: ${info.messageId})`);

    return {
      success: true,
      messageId: info.messageId,
      recipients,
      summary,
      violationsCount: violations.length
    };
  } catch (error) {
    console.error('❌ [EmailService] Lỗi gửi email báo cáo:', error.message);
    return { success: false, message: error.message };
  }
}

module.exports = {
  sendInspectorReportEmail,
  getReportRecipients,
  createTransporter
};
