const nodemailer = require('nodemailer');
const { Op } = require('sequelize');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const ExamViolation = require('../models/ExamViolation');
const ExamRoomInspection = require('../models/ExamRoomInspection');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const configService = require('./configService');

/**
 * Escape HTML special characters để chống XSS/HTML Injection khi render báo cáo email
 */
function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const VIOLATION_LEVEL_LABELS = {
  reprimand: { label: 'Khiển trách (-25%)', color: '#d97706' },
  warning: { label: 'Cảnh cáo (-50%)', color: '#ea580c' },
  suspension: { label: 'Đình chỉ thi (0đ)', color: '#dc2626' },
  late_disqualified: { label: 'Muộn >15p (Vắng thi)', color: '#475569' },
  other: { label: 'Vi phạm khác', color: '#6366f1' }
};

const ROOM_STATUS_LABELS = {
  normal: { label: 'Bình thường', color: '#2e7d32' },
  proctor_late: { label: 'CB coi thi muộn', color: '#e65100' },
  proctor_changed: { label: 'Đổi CB coi thi', color: '#0277bd' },
  proctor_absent: { label: 'Vắng CB coi thi', color: '#c62828' },
  other_issue: { label: 'Sự vụ phòng thi', color: '#6a1b9a' }
};

/**
 * Tạo transporter gửi mail qua Gmail / Google Workspace SMTP
 * Hỗ trợ nạp cấu hình động từ SystemConfig (Admin Dashboard) hoặc customConfig
 */
function createTransporter(customConfig = null) {
  const host = customConfig?.host || configService.get('SMTP_HOST') || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(customConfig?.port || configService.get('SMTP_PORT') || process.env.SMTP_PORT || '465', 10);
  const user = customConfig?.user || configService.get('SMTP_USER') || process.env.SMTP_USER;
  const pass = customConfig?.pass || configService.get('SMTP_PASS') || process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn('⚠️ [EmailService] Chưa cấu hình SMTP_USER hoặc SMTP_PASS trong Cấu hình hệ thống / .env!');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

/**
 * Lấy danh sách email nhận báo cáo của Lãnh đạo
 * Ưu tiên nạp từ SystemConfig (Admin Dashboard)
 */
async function getReportRecipients() {
  // 1. Đọc từ configService trong bộ nhớ
  const memoryEmails = configService.get('INSPECTOR_REPORT_EMAILS') || configService.get('inspector_report_emails');
  if (memoryEmails) {
    const list = memoryEmails.split(',').map(e => e.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }

  // 2. Tra cứu trực tiếp từ bảng SystemConfig
  try {
    const config = await SystemConfig.findOne({
      where: {
        key: { [Op.in]: ['INSPECTOR_REPORT_EMAILS', 'inspector_report_emails'] }
      }
    });
    if (config && config.value) {
      const emails = config.value.split(',').map(e => e.trim()).filter(Boolean);
      if (emails.length > 0) return emails;
    }
  } catch (e) {
    // ignore
  }

  // 3. Fallback process.env
  if (process.env.INSPECTOR_REPORT_EMAILS) {
    return process.env.INSPECTOR_REPORT_EMAILS.split(',').map(e => e.trim()).filter(Boolean);
  }

  const sender = configService.get('SMTP_USER') || process.env.SMTP_USER;
  return [sender || 'admin@tuaf.edu.vn'];
}

/**
 * Tạo HTML Template Báo cáo Thanh tra (Giảng dạy & Thi cử) gửi Ban Giám hiệu
 */
function buildHtmlReport({ dateRangeText, summary, violations, examSummary = {}, examViolations = [], examRoomIssues = [] }) {
  const violationRows = violations.length > 0 ? violations.map((v, idx) => `
    <tr style="border-bottom: 1px solid #e0e0e0; ${idx % 2 === 0 ? 'background-color: #fafafa;' : ''}">
      <td style="padding: 10px; text-align: center; font-weight: bold; color: #555;">${idx + 1}</td>
      <td style="padding: 10px; font-weight: 600; color: #1b5e20;">${escapeHtml(v.teacherName || 'Chưa rõ')}</td>
      <td style="padding: 10px;">
        <div style="font-weight: 600; color: #333;">${escapeHtml(v.courseName || '')}</div>
        <div style="font-size: 12px; color: #777;">${escapeHtml(v.classCode || '')} • Phòng: ${escapeHtml(v.room || 'Chưa rõ')}</div>
      </td>
      <td style="padding: 10px;">
        <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: #fff; background-color: ${escapeHtml(v.statusColor)};">
          ${escapeHtml(v.statusText)}
        </span>
      </td>
      <td style="padding: 10px; text-align: center;">
        ${v.permissionBadge}
      </td>
      <td style="padding: 10px; font-size: 13px; color: #444;">
        ${escapeHtml(v.note || v.rescheduledReason || '—')}
      </td>
    </tr>
  `).join('') : `
    <tr>
      <td colspan="6" style="padding: 20px; text-align: center; color: #2e7d32; font-weight: 600;">
        🎉 Không có trường hợp vi phạm hoặc đổi giờ giảng dạy bất thường trong khoảng thời gian này!
      </td>
    </tr>
  `;

  const examViolationRows = examViolations.length > 0 ? examViolations.map((ev, idx) => {
    const lv = VIOLATION_LEVEL_LABELS[ev.violationLevel] || VIOLATION_LEVEL_LABELS.other;
    const actionsStr = Array.isArray(ev.violationActions) && ev.violationActions.length > 0
      ? ev.violationActions.join('; ')
      : '';
    const detailNote = [actionsStr, ev.evidence ? `Tang vật: ${ev.evidence}` : '', ev.note || ''].filter(Boolean).join(' • ');

    return `
    <tr style="border-bottom: 1px solid #e0e0e0; ${idx % 2 === 0 ? 'background-color: #fffafa;' : ''}">
      <td style="padding: 10px; text-align: center; font-weight: bold; color: #555;">${idx + 1}</td>
      <td style="padding: 10px;">
        <div style="font-weight: 700; color: #991b1b;">${escapeHtml(ev.studentName)}</div>
        <div style="font-size: 12px; color: #555;">MSSV: ${escapeHtml(ev.studentCode)} ${ev.seatNumber ? `• SBD: ${escapeHtml(ev.seatNumber)}` : ''} ${ev.studentClass ? `• Lớp: ${escapeHtml(ev.studentClass)}` : ''}</div>
      </td>
      <td style="padding: 10px;">
        <div style="font-weight: 600; color: #333;">${escapeHtml(ev.courseName || '')}</div>
        <div style="font-size: 12px; color: #777;">Phòng: ${escapeHtml(ev.room || '')} • ${escapeHtml(ev.examDate || '')} ${ev.examTime ? `(${escapeHtml(ev.examTime)})` : ''}</div>
      </td>
      <td style="padding: 10px;">
        <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: #fff; background-color: ${lv.color};">
          ${escapeHtml(lv.label)}
        </span>
      </td>
      <td style="padding: 10px; font-size: 12px; color: #444;">
        ${escapeHtml(detailNote || ev.penalty || '—')}
      </td>
    </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="5" style="padding: 18px; text-align: center; color: #2e7d32; font-weight: 600;">
        ✔ Không có thí sinh vi phạm quy chế thi trong khoảng thời gian này.
      </td>
    </tr>
  `;

  const roomIssueRows = examRoomIssues.length > 0 ? examRoomIssues.map((ri, idx) => {
    const st = ROOM_STATUS_LABELS[ri.status] || ROOM_STATUS_LABELS.other_issue;
    const extraInfo = [
      ri.lateMinutes > 0 ? `Muộn ${ri.lateMinutes} phút` : '',
      ri.substituteProctor ? `CB coi thay: ${ri.substituteProctor}` : '',
      ri.note || ''
    ].filter(Boolean).join(' • ');

    return `
    <tr style="border-bottom: 1px solid #e0e0e0;">
      <td style="padding: 8px; text-align: center;">${idx + 1}</td>
      <td style="padding: 8px; font-weight: 600;">${escapeHtml(ri.room || '')} (${escapeHtml(ri.examDate || '')} ${escapeHtml(ri.examTime || '')})</td>
      <td style="padding: 8px;">${escapeHtml(ri.courseName || '')}<div style="font-size: 11px; color: #666;">CBCT: ${escapeHtml([ri.proctor1, ri.proctor2].filter(Boolean).join(', ') || 'Chưa rõ')}</div></td>
      <td style="padding: 8px;"><span style="color: ${st.color}; font-weight: 700;">${escapeHtml(st.label)}</span></td>
      <td style="padding: 8px; font-size: 12px;">${escapeHtml(extraInfo || '—')}</td>
    </tr>
    `;
  }).join('') : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f6f8; color: #333; }
    .container { max-width: 760px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1b5e20, #2e7d32); color: #ffffff; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 0.5px; }
    .header p { margin: 6px 0 0 0; font-size: 14px; opacity: 0.9; }
    .kpi-grid { display: table; width: 100%; table-layout: fixed; background: #ffffff; padding: 16px 12px; border-bottom: 2px solid #e8f5e9; }
    .kpi-cell { display: table-cell; text-align: center; padding: 10px; }
    .kpi-val { font-size: 22px; font-weight: 800; }
    .kpi-lbl { font-size: 11px; color: #666; text-transform: uppercase; margin-top: 4px; }
    .content { padding: 24px; }
    .table-wrap { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    .table-wrap th { background-color: #2e7d32; color: #ffffff; padding: 10px; text-align: left; font-size: 12px; text-transform: uppercase; }
    .table-exam th { background-color: #991b1b; color: #ffffff; padding: 10px; text-align: left; font-size: 12px; text-transform: uppercase; }
    .footer { background-color: #f1f3f4; padding: 18px 24px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e0e0e0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Trường Đại học Nông Lâm Thái Nguyên</h1>
      <p>BÁO CÁO CÔNG TÁC THANH TRA GIẢNG DẠY & KHẢO THÍ</p>
      <div style="display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 14px; border-radius: 20px; font-size: 12px; margin-top: 8px;">
        📅 ${escapeHtml(dateRangeText)}
      </div>
    </div>

    <!-- KPI SUMMARY -->
    <div class="kpi-grid">
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #1b5e20;">${summary.totalChecked || 0}</div>
        <div class="kpi-lbl">Lớp kiểm tra</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #2e7d32;">${summary.onTime || 0}</div>
        <div class="kpi-lbl">Dạy đúng giờ</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #e65100;">${(summary.late || 0) + (summary.earlyLeave || 0)}</div>
        <div class="kpi-lbl">Muộn / Về sớm</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #c62828;">${summary.absent || 0}</div>
        <div class="kpi-lbl">Vắng / Bỏ tiết</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #0277bd;">${examSummary.totalRoomsChecked || 0}</div>
        <div class="kpi-lbl">Phòng thi đã KT</div>
      </div>
      <div class="kpi-cell">
        <div class="kpi-val" style="color: #dc2626;">${examSummary.totalViolations || 0}</div>
        <div class="kpi-lbl">SV vi phạm thi</div>
      </div>
    </div>

    <!-- DETAILS CONTENT: GIẢNG DẠY -->
    <div class="content">
      <h3 style="color: #1b5e20; margin: 0 0 8px 0; font-size: 16px;">
        📋 I. Danh sách sự vụ Thanh tra Giảng dạy (${violations.length}):
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

      <!-- DETAILS CONTENT: THI CỬ -->
      <h3 style="color: #991b1b; margin: 28px 0 8px 0; font-size: 16px;">
        📝 II. Danh sách Thí sinh Vi phạm Quy chế Thi (${examViolations.length}):
      </h3>
      <table class="table-wrap table-exam">
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">STT</th>
            <th>Thí sinh</th>
            <th>Môn thi / Phòng thi</th>
            <th>Mức xử lý</th>
            <th>Hành vi / Tang vật / Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          ${examViolationRows}
        </tbody>
      </table>

      ${roomIssueRows ? `
      <h3 style="color: #0277bd; margin: 24px 0 8px 0; font-size: 15px;">
        🏫 III. Ghi nhận Phòng thi & Cán bộ coi thi (${examRoomIssues.length}):
      </h3>
      <table class="table-wrap">
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">STT</th>
            <th>Phòng thi / Ca thi</th>
            <th>Môn thi & CB coi thi</th>
            <th>Trạng thái</th>
            <th>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          ${roomIssueRows}
        </tbody>
      </table>
      ` : ''}
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
 * Đánh giá xem có nên gửi email báo cáo thanh tra hay không:
 * - Nếu không có bất kỳ hoạt động kiểm tra lớp học hay phòng thi nào (VD: cuối tuần không có lớp, hoặc chưa kiểm tra): KHÔNG gửi.
 * - Nếu có hoạt động kiểm tra nhưng tất cả đều bình thường hết (không có vi phạm, đổi giờ, dạy thay, bất thường phòng thi hoặc ghi chú sự kiện): KHÔNG gửi.
 * - Chỉ gửi khi có ít nhất 1 sự kiện / vi phạm / ghi chú bất thường trong hoạt động thanh tra.
 */
function evaluateReportSendCondition({
  summary = {},
  violations = [],
  examSummary = {},
  examViolations = [],
  examRoomIssues = []
} = {}) {
  const totalClassesChecked = Number(summary.totalChecked) || 0;
  const totalExamRoomsChecked = Number(examSummary.totalRoomsChecked) || 0;
  const totalExamViolations = Array.isArray(examViolations) ? examViolations.length : (Number(examSummary.totalViolations) || 0);
  const totalTeachingEvents = Array.isArray(violations) ? violations.length : 0;
  const totalExamRoomIssues = Array.isArray(examRoomIssues) ? examRoomIssues.length : (Number(examSummary.issueRooms) || 0);

  const totalActivity = totalClassesChecked + totalExamRoomsChecked + totalExamViolations;
  const totalEvents = totalTeachingEvents + totalExamViolations + totalExamRoomIssues;

  if (totalActivity === 0) {
    return {
      shouldSend: false,
      reason: 'no_activity',
      message: 'Không gửi email báo cáo: Không có lớp học hoặc hoạt động kiểm tra thanh tra nào trong thời gian này (hoặc ngày nghỉ / cuối tuần).'
    };
  }

  if (totalEvents === 0) {
    return {
      shouldSend: false,
      reason: 'all_normal',
      message: `Không gửi email báo cáo: Đã kiểm tra ${totalClassesChecked} lớp học và ${totalExamRoomsChecked} phòng thi, tất cả đều bình thường, không phát sinh sự kiện hay vi phạm nào.`
    };
  }

  return {
    shouldSend: true,
    reason: 'has_events',
    message: 'Đủ điều kiện gửi email báo cáo thanh tra.'
  };
}

/**
 * Tổng hợp số liệu và gửi Email Báo cáo Thanh tra
 * @param {Object} options - { from, to, periodType: 'daily'|'weekly'|'monthly', customRecipients, force }
 */
async function sendInspectorReportEmail({ from, to, periodType = 'daily', customRecipients = null, force = false }) {
  try {
    const vnTime = new Date(Date.now() + 7 * 3600 * 1000);
    const year = vnTime.getUTCFullYear();
    const month = vnTime.getUTCMonth();
    const day = vnTime.getUTCDate();
    const today = new Date(year, month, day);
    const fmtYmd = (dt) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

    let startDate = from;
    let endDate = to;

    if (!startDate || !endDate) {
      if (periodType === 'week' || periodType === 'weekly') {
        const startOfWeek = new Date(today);
        const diffToMonday = today.getDay() === 0 ? -6 : 1 - today.getDay();
        startOfWeek.setDate(today.getDate() + diffToMonday);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        startDate = fmtYmd(startOfWeek);
        endDate = fmtYmd(endOfWeek);
      } else if (periodType === 'month' || periodType === 'monthly') {
        startDate = fmtYmd(new Date(today.getFullYear(), today.getMonth(), 1));
        endDate = fmtYmd(new Date(today.getFullYear(), today.getMonth() + 1, 0));
      } else if (periodType === 'semester') {
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        if (currentMonth < 6) {
          startDate = `${currentYear - 1}-09-01`;
          endDate = `${currentYear}-01-31`;
        } else {
          startDate = `${currentYear}-02-01`;
          endDate = `${currentYear}-06-30`;
        }
      } else {
        startDate = fmtYmd(today);
        endDate = startDate;
      }
    }

    console.log(`📧 [EmailService] Bắt đầu tổng hợp báo cáo thanh tra (${startDate} -> ${endDate}, loại: ${periodType})...`);

    // 1. Truy vấn các bản ghi thanh tra giảng dạy & thi cử trong khoảng thời gian
    const [records, examViolationsRaw, examRoomsRaw] = await Promise.all([
      Attendance.findAll({
        where: {
          date: { [Op.between]: [startDate, endDate] }
        },
        order: [['date', 'ASC'], ['checkInTime', 'ASC']]
      }),
      ExamViolation.findAll({
        where: {
          examDate: { [Op.between]: [startDate, endDate] }
        },
        order: [['examDate', 'ASC'], ['createdAt', 'ASC']]
      }),
      ExamRoomInspection.findAll({
        where: {
          examDate: { [Op.between]: [startDate, endDate] }
        },
        order: [['examDate', 'ASC'], ['updatedAt', 'ASC']]
      })
    ]);

    // 2. Lấy thông tin lịch dạy và giảng viên để bổ sung chi tiết
    const scheduleIds = records.map(r => r.scheduleId).filter(Boolean);
    const schedules = await Schedule.findAll({
      where: { id: { [Op.in]: scheduleIds } }
    });
    const scheduleMap = {};
    for (const s of schedules) {
      scheduleMap[s.id] = s;
    }

    // 3. Thống kê số liệu giảng dạy (chỉ tính các bản ghi đã kiểm tra thực tế, bỏ qua 'pending')
    const checkedRecords = records.filter(r => r.status && r.status !== 'pending');
    let totalChecked = checkedRecords.length;
    let onTime = 0;
    let late = 0;
    let earlyLeave = 0;
    let absent = 0;
    let rescheduledPermitted = 0;
    let rescheduledUnpermitted = 0;
    let substitute = 0;

    const violations = [];

    for (const r of checkedRecords) {
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
        statusText = 'Vắng / Bỏ tiết';
        statusColor = '#c62828';
        permissionBadge = '<span style="color: #c62828; font-weight: bold;">✘ Bỏ tiết</span>';
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

      const hasEventNote = Boolean(r.note && String(r.note).trim());
      if (isViolation || r.status === 'rescheduled' || r.status === 'substitute' || hasEventNote) {
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

    const checkedExamRooms = examRoomsRaw.filter(ri => ri.status && ri.status !== 'pending');
    const examViolations = examViolationsRaw.map(v => (v.toJSON ? v.toJSON() : v));
    const examRoomIssues = checkedExamRooms
      .filter(ri => ri.status !== 'normal' || (ri.note && ri.note.trim()))
      .map(ri => (ri.toJSON ? ri.toJSON() : ri));

    const examSummary = {
      totalRoomsChecked: checkedExamRooms.length,
      totalViolations: examViolations.length,
      issueRooms: examRoomIssues.length
    };

    // 3b. Kiểm tra điều kiện gửi báo cáo:
    // - Không có hoạt động kiểm tra (hoặc cuối tuần không có lớp học) -> Không gửi
    // - Tất cả các lớp / phòng thi đều bình thường hết, không có sự kiện hay vi phạm -> Không gửi
    const sendCondition = evaluateReportSendCondition({
      summary,
      violations,
      examSummary,
      examViolations,
      examRoomIssues
    });

    if (!force && !sendCondition.shouldSend) {
      console.log(`⏭️ [EmailService] Bỏ qua gửi email (${startDate} -> ${endDate}): ${sendCondition.message}`);
      return {
        success: false,
        skipped: true,
        reason: sendCondition.reason,
        message: sendCondition.message,
        summary,
        examSummary,
        violationsCount: violations.length,
        examViolationsCount: examViolations.length
      };
    }

    // 4. Tạo nội dung Email
    let periodTitle = 'BÁO CÁO NGÀY';
    if (periodType === 'weekly' || periodType === 'week') periodTitle = 'BÁO CÁO TUẦN';
    if (periodType === 'monthly' || periodType === 'month') periodTitle = 'BÁO CÁO THÁNG';
    if (periodType === 'semester') periodTitle = 'BÁO CÁO HỌC KỲ';

    const dateRangeText = startDate === endDate ? `Ngày ${startDate}` : `Từ ${startDate} đến ${endDate}`;
    const subject = `[TUAF Thanh Tra] ${periodTitle} - ${dateRangeText}`;
    const html = buildHtmlReport({
      title: periodTitle,
      dateRangeText,
      summary,
      violations,
      examSummary,
      examViolations,
      examRoomIssues
    });

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
        examSummary,
        violationsCount: violations.length,
        examViolationsCount: examViolations.length,
        recipients
      };
    }

    const senderUser = configService.get('SMTP_USER') || process.env.SMTP_USER;
    const fromName = configService.get('SMTP_FROM_NAME') || 'Thanh Tra Đào Tạo TUAF';

    const info = await transporter.sendMail({
      from: `"${fromName}" <${senderUser}>`,
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
      examSummary,
      violationsCount: violations.length,
      examViolationsCount: examViolations.length
    };
  } catch (error) {
    console.error('❌ [EmailService] Lỗi gửi email báo cáo:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Gửi email kiểm thử trực tiếp từ Admin Dashboard
 * @param {Object} params - { to, customConfig: { host, port, user, pass, fromName } }
 */
async function sendTestEmail({ to = null, customConfig = null } = {}) {
  try {
    const sender = customConfig?.user || configService.get('SMTP_USER') || process.env.SMTP_USER;
    const fromName = customConfig?.fromName || configService.get('SMTP_FROM_NAME') || 'Thanh Tra Đào Tạo TUAF';
    const recipient = to || (await getReportRecipients())[0] || sender;

    if (!recipient) {
      return {
        success: false,
        message: 'Chưa có địa chỉ email người nhận thử nghiệm (Vui lòng điền email nhận hoặc cấu hình danh sách nhận)!'
      };
    }

    const transporter = createTransporter(customConfig);
    if (!transporter) {
      return {
        success: false,
        message: 'Chưa cấu hình thông tin SMTP (Tài khoản SMTP_USER hoặc Mật khẩu ứng dụng SMTP_PASS còn trống)!'
      };
    }

    // 1. Kiểm tra xác thực máy chủ SMTP
    await transporter.verify();

    // 2. Soạn nội dung email thử nghiệm
    const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const host = customConfig?.host || configService.get('SMTP_HOST') || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = customConfig?.port || configService.get('SMTP_PORT') || process.env.SMTP_PORT || '465';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f6f8; margin: 0; padding: 20px; }
    .card { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1b5e20, #2e7d32); color: #fff; padding: 24px; text-align: center; }
    .header h2 { margin: 0; font-size: 20px; text-transform: uppercase; }
    .header p { margin: 4px 0 0 0; opacity: 0.9; font-size: 13px; }
    .body { padding: 24px; color: #333; line-height: 1.6; }
    .success-badge { display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 14px; margin-bottom: 12px; }
    .info-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    .info-table td { padding: 8px 10px; border-bottom: 1px solid #eee; }
    .info-table td.label { width: 140px; color: #666; font-weight: 600; }
    .footer { background: #f8f9fa; padding: 14px 20px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #e9ecef; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>Trường Đại học Nông Lâm Thái Nguyên</h2>
      <p>Hệ Thống Giám Sát Lịch Học & Quản Lý Thanh Tra Giảng Dạy</p>
    </div>
    <div class="body">
      <div class="success-badge">✔ KIỂM THỬ KẾT NỐI EMAIL THÀNH CÔNG</div>
      <p>Kính gửi Quý Thầy/Cô,</p>
      <p>Thư này được gửi từ <strong>Admin Dashboard TUAF Schedule</strong> nhằm kiểm tra kết nối dịch vụ gửi thư tự động qua Google Workspace / SMTP.</p>
      
      <table class="info-table">
        <tr>
          <td class="label">Thời gian gửi:</td>
          <td><strong>${escapeHtml(timeStr)}</strong></td>
        </tr>
        <tr>
          <td class="label">Máy chủ SMTP:</td>
          <td><code>${escapeHtml(host)}:${escapeHtml(port)}</code></td>
        </tr>
        <tr>
          <td class="label">Tài khoản gửi:</td>
          <td><code>${escapeHtml(sender)}</code></td>
        </tr>
        <tr>
          <td class="label">Hộp thư nhận:</td>
          <td><strong style="color: #1b5e20;">${escapeHtml(recipient)}</strong></td>
        </tr>
        <tr>
          <td class="label">Trạng thái:</td>
          <td><span style="color: #2e7d32; font-weight: bold;">Hoạt động bình thường (Ready)</span></td>
        </tr>
      </table>

      <p style="color: #555; font-size: 13px;">Hệ thống đã sẵn sàng gửi các bản tin Báo cáo Thanh tra giảng dạy & thi cử định kỳ (18:00 hàng ngày, sáng Thứ Hai hàng tuần và ngày đầu tháng) đến Lãnh đạo Nhà trường.</p>
    </div>
    <div class="footer">
      Bản tin thử nghiệm tự động từ TUAF Schedule Admin System • Vui lòng không trả lời thư này.
    </div>
  </div>
</body>
</html>
    `;

    const info = await transporter.sendMail({
      from: `"${fromName}" <${sender}>`,
      to: recipient,
      subject: `[TUAF Schedule] Kiểm thử kết nối Email Gateway thành công - ${timeStr}`,
      html
    });

    console.log(`✅ [EmailService] Đã gửi email thử nghiệm thành công tới: ${recipient} (Message ID: ${info.messageId})`);

    return {
      success: true,
      message: `✅ Đã gửi email thử nghiệm thành công tới ${recipient}!`,
      details: {
        recipient,
        sender,
        host: `${host}:${port}`,
        messageId: info.messageId
      }
    };
  } catch (error) {
    console.error('❌ [EmailService] Lỗi khi gửi email kiểm thử:', error.message);
    return {
      success: false,
      message: `Lỗi kết nối SMTP: ${error.message}`
    };
  }
}

/**
 * Kiểm thử kết nối máy chủ SMTP mà KHÔNG gửi email (dành cho health check & test connection)
 */
async function verifySmtpConnection({ customConfig = null } = {}) {
  try {
    const transporter = createTransporter(customConfig);
    if (!transporter) {
      return {
        success: false,
        message: 'Chưa cấu hình thông tin SMTP (Tài khoản SMTP_USER hoặc Mật khẩu ứng dụng SMTP_PASS còn trống)!'
      };
    }

    await transporter.verify();

    const host = customConfig?.host || configService.get('SMTP_HOST') || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = customConfig?.port || configService.get('SMTP_PORT') || process.env.SMTP_PORT || '465';
    const sender = customConfig?.user || configService.get('SMTP_USER') || process.env.SMTP_USER;

    return {
      success: true,
      message: `Kết nối máy chủ SMTP (${host}:${port}) thành công!`,
      details: {
        host: `${host}:${port}`,
        user: sender,
        status: 'Ready (Connected)'
      }
    };
  } catch (error) {
    console.error('❌ [EmailService] Lỗi khi kiểm tra kết nối SMTP:', error.message);
    return {
      success: false,
      message: `Lỗi kết nối SMTP: ${error.message}`
    };
  }
}

module.exports = {
  sendInspectorReportEmail,
  evaluateReportSendCondition,
  sendTestEmail,
  verifySmtpConnection,
  getReportRecipients,
  createTransporter,
  buildHtmlReport,
  escapeHtml
};
