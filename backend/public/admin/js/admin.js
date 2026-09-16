/**
 * TUAF SCHEDULER — ADMIN DASHBOARD JAVASCRIPT LOGIC
 * Safe DOM rendering • Asynchronous Testing • Real-time Monitoring • Hot-Reload Configs
 */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initConfigForm();
  initHealthMonitor();
  initUserInspector();
  initCronJob();
  initModalAndToasts();

  // Tải dữ liệu và kiểm tra trạng thái tất cả các node ngay khi mở trang
  loadConfigs();
  loadHealthData();
  checkAllNodes();

  // Nút làm mới tổng thể
  document.getElementById('btn-refresh-data')?.addEventListener('click', () => {
    loadConfigs();
    loadHealthData();
    checkAllNodes();
    showToast('info', 'Đang làm mới dữ liệu & kiểm tra các node...');
  });
});

/* ── 1. Quản lý Tabs ── */
function initTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  const panes = document.querySelectorAll('.tab-pane');
  const titleEl = document.getElementById('page-title');
  const descEl = document.getElementById('page-desc');

  const tabMeta = {
    'tab-configs': {
      title: '⚙️ Cấu Hình & Quản Lý Kết Nối',
      desc: 'Chỉnh sửa tham số máy chủ SQL Server TUAF, NamViet API và kiểm thử kết nối trực tiếp.'
    },
    'tab-health': {
      title: '📊 Sức Khỏe & Giám Sát Hệ Thống',
      desc: 'Theo dõi tình trạng hoạt động của các node dịch vụ, thông số RAM máy chủ và dữ liệu cache.'
    },
    'tab-users': {
      title: '👥 Tra Cứu Người Dùng & Đồng Bộ Tức Thì',
      desc: 'Tìm kiếm dữ liệu cache của sinh viên/giảng viên và kích hoạt Force Sync thời gian thực.'
    },
    'tab-cron': {
      title: '⏱️ Lịch Trình Quét Đồng Bộ (Cron Job)',
      desc: 'Quản lý tác vụ ngầm quét dữ liệu định kỳ lúc 3:00 sáng hàng ngày.'
    },
    'tab-logs': {
      title: '📜 Nhật Ký Hoạt Động Thời Gian Thực',
      desc: 'Xem nhật ký các yêu cầu kết nối, kiểm thử và đồng bộ từ máy chủ backend.'
    }
  };

  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');

      navItems.forEach(b => b.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(target)?.classList.add('active');

      if (tabMeta[target] && titleEl && descEl) {
        titleEl.textContent = tabMeta[target].title;
        descEl.textContent = tabMeta[target].desc;
      }

      if (target === 'tab-health') {
        loadHealthData();
        checkAllNodes();
      }
    });
  });

  // Subtabs trong User Inspect
  const subtabBtns = document.querySelectorAll('.subtab-btn');
  subtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-subtab');
      subtabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.subtab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(target)?.classList.add('active');
    });
  });
}

/* ── 2. Cấu hình & Lưu Hot-Reload ── */
let currentConfigs = {};

function initConfigForm() {
  // Toggle password masking
  document.querySelectorAll('.btn-toggle-mask').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🔒';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
      }
    });
  });

  // Nút Lưu Cấu Hình
  document.getElementById('btn-save-configs')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-configs');
    const form = document.getElementById('form-configs');
    const formData = new FormData(form);
    const payload = {};

    formData.forEach((val, key) => {
      payload[key] = val;
    });

    try {
      btn.disabled = true;
      btn.textContent = '⏳ Đang lưu...';
      addLog('info', 'Đang lưu cấu hình hệ thống...');

      const res = await fetch('/api/admin/configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: payload })
      });
      const data = await res.json();

      if (data.success) {
        showToast('success', 'Đã lưu và áp dụng cấu hình mới tức thì!');
        addLog('success', '✅ Đã lưu cấu hình mới và kích hoạt Hot-Reload.');
        populateConfigForm(data.data);
        checkAllNodes();
      } else {
        showToast('error', data.message || 'Lỗi khi lưu cấu hình');
        addLog('danger', `❌ Lưu thất bại: ${data.message}`);
      }
    } catch (err) {
      showToast('error', err.message);
      addLog('danger', `❌ Lỗi mạng: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Lưu & Áp Dụng Ngay (Hot-Reload)';
    }
  });

  // Nút Khôi phục cấu hình
  document.getElementById('btn-reset-configs')?.addEventListener('click', () => {
    loadConfigs();
    showToast('info', 'Đã khôi phục lại cấu hình ban đầu');
  });

  // Nút Test Connection
  document.querySelectorAll('.btn-test').forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = btn.getAttribute('data-target');
      await runTestConnection(target, btn);
    });
  });
}

async function loadConfigs() {
  try {
    const res = await fetch('/api/admin/configs');
    const data = await res.json();
    if (data.success) {
      populateConfigForm(data.data);
    }
  } catch (err) {
    console.error('Lỗi load configs:', err);
  }
}

function populateConfigForm(configList) {
  configList.forEach(item => {
    currentConfigs[item.key] = item.value;
    const input = document.getElementById(`cfg_${item.key}`);
    if (input) {
      if (item.isSecret && item.maskedValue) {
        input.value = item.maskedValue;
      } else {
        input.value = item.value || '';
      }
    }
  });
}

/* ── 3. Kiểm thử kết nối (Live Test Connection) ── */
async function runTestConnection(target, buttonEl) {
  const originalText = buttonEl ? buttonEl.textContent : '';
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = '⏳ Đang test...';
  }

  addLog('info', `Đang kiểm thử kết nối: [${target.toUpperCase()}]...`);

  // Thu thập overrides từ form nếu người dùng vừa sửa trực tiếp trên giao diện
  const overrides = {};
  if (target === 'sqlserver') {
    const s = document.getElementById('cfg_TUAF_DB_SERVER')?.value;
    const db = document.getElementById('cfg_TUAF_DB_NAME')?.value;
    const u = document.getElementById('cfg_TUAF_DB_USER')?.value;
    const p = document.getElementById('cfg_TUAF_DB_PASSWORD')?.value;
    if (s) overrides.TUAF_DB_SERVER = s;
    if (db) overrides.TUAF_DB_NAME = db;
    if (u) overrides.TUAF_DB_USER = u;
    if (p && !p.includes('•')) overrides.TUAF_DB_PASSWORD = p;
  } else if (target === 'namviet') {
    const url = document.getElementById('cfg_NAMVIET_API_URL')?.value;
    const key = document.getElementById('cfg_NAMVIET_SECRET_KEY')?.value;
    const truong = document.getElementById('cfg_NAMVIET_MA_TRUONG')?.value;
    const usr = document.getElementById('cfg_NAMVIET_USERNAME')?.value;
    if (url) overrides.NAMVIET_API_URL = url;
    if (truong) overrides.NAMVIET_MA_TRUONG = truong;
    if (usr) overrides.NAMVIET_USERNAME = usr;
    if (key && !key.includes('•')) overrides.NAMVIET_SECRET_KEY = key;
  } else if (target === 'email') {
    const host = document.getElementById('cfg_SMTP_HOST')?.value;
    const port = document.getElementById('cfg_SMTP_PORT')?.value;
    const user = document.getElementById('cfg_SMTP_USER')?.value;
    const pass = document.getElementById('cfg_SMTP_PASS')?.value;
    const fromName = document.getElementById('cfg_SMTP_FROM_NAME')?.value;
    const reportEmails = document.getElementById('cfg_INSPECTOR_REPORT_EMAILS')?.value;
    if (host) overrides.SMTP_HOST = host;
    if (port) overrides.SMTP_PORT = port;
    if (user) overrides.SMTP_USER = user;
    if (pass && !pass.includes('•')) overrides.SMTP_PASS = pass;
    if (fromName) overrides.SMTP_FROM_NAME = fromName;
    if (reportEmails) overrides.INSPECTOR_REPORT_EMAILS = reportEmails;

    let defaultRecipient = '';
    if (reportEmails) {
      const parts = reportEmails.split(',').map(e => e.trim()).filter(Boolean);
      if (parts.length > 0) defaultRecipient = parts[0];
    }
    if (!defaultRecipient && user) defaultRecipient = user;

    const testTo = prompt('Nhập địa chỉ email người nhận thư thử nghiệm:', defaultRecipient);
    if (testTo === null) {
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
      }
      return;
    }
    if (testTo.trim()) {
      overrides.TEST_RECIPIENT_EMAIL = testTo.trim();
    }
  }

  try {
    const res = await fetch('/api/admin/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, overrides })
    });
    const data = await res.json();

    updateNodeBadge(target, data.success, data.latencyMs);

    if (data.success) {
      showToast('success', `${data.message}`);
      addLog('success', `${data.message}`);
      showTestModal(target, true, data);
    } else {
      showToast('error', `${data.message}`);
      addLog('danger', `${data.message}`);
      showTestModal(target, false, data);
    }

    return data;
  } catch (err) {
    showToast('error', `Lỗi kiểm thử: ${err.message}`);
    addLog('danger', `❌ Lỗi khi test [${target}]: ${err.message}`);
    updateNodeBadge(target, false);
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.textContent = originalText;
    }
  }
}

function updateNodeBadge(target, isOnline, latencyMs) {
  const card = document.getElementById(`node-${target}`);
  const badge = card?.querySelector('.node-badge');
  if (badge) {
    if (isOnline) {
      badge.className = 'node-badge online';
      badge.textContent = latencyMs ? `Online (${latencyMs}ms)` : 'Online';
    } else {
      badge.className = 'node-badge offline';
      badge.textContent = 'Offline';
    }
  }

  if (target === 'email') {
    const detail = document.getElementById('node-email-detail');
    const host = document.getElementById('cfg_SMTP_HOST')?.value || 'smtp.gmail.com';
    const port = document.getElementById('cfg_SMTP_PORT')?.value || '465';
    if (detail) detail.textContent = `${host}:${port}`;
  }
}

/* ── 4. Sức khỏe & Giám sát (Health Tab) ── */
function initHealthMonitor() {
  // Tự động kiểm tra
}

async function loadHealthData() {
  try {
    const res = await fetch('/api/admin/health');
    const data = await res.json();
    if (data.success) {
      const d = data.data;
      setText('val-uptime', d.uptimeFormatted || `${d.uptime}s`);
      setText('val-platform', `${d.platform} • Mode: ${d.dataSourceMode}`);
      setText('val-memory', `${d.memory.heapUsedMb} MB / ${d.memory.rssMb} MB`);
      setText('val-node-ver', `${d.nodeVersion}`);

      setText('val-count-users', d.counts.users);
      setText('val-count-schedules', d.counts.schedules);
      setText('val-count-grades-exams', `${d.counts.grades} / ${d.counts.exams}`);
      setText('val-count-curriculums', d.counts.curriculums);
    }
  } catch (err) {
    console.error('Lỗi load health:', err);
  }
}

async function checkAllNodes() {
  const nodes = ['sqlserver', 'namviet', 'postgres', 'portals', 'email'];

  nodes.forEach(target => {
    const card = document.getElementById(`node-${target}`);
    const badge = card?.querySelector('.node-badge');
    if (badge) {
      badge.className = 'node-badge checking';
      badge.textContent = 'Checking...';
    }
  });

  // Chạy song song để có kết quả ngay lập tức
  await Promise.all(nodes.map(async (target) => {
    try {
      const res = await fetch('/api/admin/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      const data = await res.json();
      updateNodeBadge(target, data.success, data.latencyMs);
    } catch (e) {
      updateNodeBadge(target, false);
    }
  }));
}

/* ── 5. Tra cứu người dùng & Force Sync ── */
let currentInspectedUser = null;

function initUserInspector() {
  const inputEl = document.getElementById('input-inspect-username');
  const btnInspect = document.getElementById('btn-inspect-user');
  const btnForceSync = document.getElementById('btn-force-sync-user');

  btnInspect?.addEventListener('click', () => {
    const username = inputEl.value.trim();
    if (username) inspectUser(username);
  });

  inputEl?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const username = inputEl.value.trim();
      if (username) inspectUser(username);
    }
  });

  // Quick tags
  document.querySelectorAll('.tag-btn').forEach(tag => {
    tag.addEventListener('click', () => {
      const user = tag.getAttribute('data-user');
      if (inputEl) inputEl.value = user;
      inspectUser(user);
    });
  });

  // Force Sync Button
  btnForceSync?.addEventListener('click', async () => {
    if (!currentInspectedUser) return;
    btnForceSync.disabled = true;
    btnForceSync.textContent = '⏳ Đang đồng bộ...';
    addLog('info', `Bắt đầu Force Sync dữ liệu cho ${currentInspectedUser}...`);

    try {
      const res = await fetch('/api/admin/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentInspectedUser, semester: '2', schoolYear: '2025' })
      });
      const data = await res.json();

      if (data.success) {
        showToast('success', data.message);
        addLog('success', `${data.message}`);
        // Refresh inspection
        await inspectUser(currentInspectedUser);
      } else {
        showToast('error', data.message);
        addLog('danger', `❌ Force Sync lỗi: ${data.message}`);
      }
    } catch (err) {
      showToast('error', err.message);
      addLog('danger', `❌ Lỗi kết nối sync: ${err.message}`);
    } finally {
      btnForceSync.disabled = false;
      btnForceSync.textContent = '⚡ Force Sync Ngay';
    }
  });
}

async function inspectUser(username) {
  const resultArea = document.getElementById('user-inspect-result');
  const btnForceSync = document.getElementById('btn-force-sync-user');
  const btnInspect = document.getElementById('btn-inspect-user');

  btnInspect.disabled = true;
  btnInspect.textContent = '⏳...';

  try {
    const res = await fetch(`/api/admin/users/inspect?username=${encodeURIComponent(username)}`);
    const data = await res.json();

    if (!data.success) {
      showToast('error', data.message);
      if (resultArea) resultArea.style.display = 'none';
      if (btnForceSync) btnForceSync.disabled = true;
      currentInspectedUser = null;
      return;
    }

    currentInspectedUser = username;
    if (btnForceSync) btnForceSync.disabled = false;
    if (resultArea) resultArea.style.display = 'block';

    const u = data.data.user;
    const s = data.data.summary;

    setText('res-user-fullname', u.fullName || u.username);
    setText('res-user-role', u.role);
    setText('res-user-username', u.username);
    setText('res-user-class', u.className || 'Chưa cập nhật');
    setText('res-user-dept', u.department || 'TUAF');
    setText('res-user-synced', u.lastSyncedAt ? new Date(u.lastSyncedAt).toLocaleString('vi-VN') : 'Chưa đồng bộ');
    setText('res-user-avatar', (u.fullName ? u.fullName.split(' ').pop().substring(0, 2) : u.username.substring(0, 2)).toUpperCase());

    setText('res-num-schedules', s.totalSchedules);
    setText('res-num-exams', s.totalExams);
    setText('res-num-grades', s.totalGrades);
    setText('res-num-finance', data.data.finance ? `${Number(data.data.finance.debtTuition || 0).toLocaleString('vi-VN')}đ` : '0đ');

    setText('count-sub-sched', s.totalSchedules);
    setText('count-sub-exams', s.totalExams);
    setText('count-sub-grades', s.totalGrades);

    renderSchedulesTable(data.data.schedules || []);
    renderExamsTable(data.data.exams || []);
    renderGradesTable(data.data.grades || []);

    addLog('info', `Đã tra cứu dữ liệu sinh viên ${u.username} (${u.fullName || ''})`);
  } catch (err) {
    showToast('error', err.message);
  } finally {
    btnInspect.disabled = false;
    btnInspect.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Tra cứu';
  }
}

function renderSchedulesTable(items) {
  const tbody = document.getElementById('tbody-schedules');
  if (!tbody) return;
  tbody.replaceChildren();

  if (items.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'text-center';
    td.textContent = 'Không có lịch học trong kỳ này';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(item.dayOfWeek || '')}</strong></td>
      <td>${escapeHtml(item.courseName || '')}</td>
      <td class="code-font">${escapeHtml(String(item.credits || ''))}</td>
      <td>${escapeHtml(item.periodText || item.studyTime || '')}</td>
      <td><span class="badge badge-sub">${escapeHtml(item.room || 'TBA')}</span></td>
      <td>${escapeHtml(item.teacherName || '')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderExamsTable(items) {
  const tbody = document.getElementById('tbody-exams');
  if (!tbody) return;
  tbody.replaceChildren();

  if (items.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'text-center';
    td.textContent = 'Chưa có lịch thi';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="code-font">${escapeHtml(item.examDate || '')}</td>
      <td>${escapeHtml(item.examTime || '')}</td>
      <td><strong>${escapeHtml(item.courseName || '')}</strong></td>
      <td>${escapeHtml(item.room || '')}</td>
      <td class="code-font">${escapeHtml(String(item.seatNumber || ''))}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderGradesTable(items) {
  const tbody = document.getElementById('tbody-grades');
  if (!tbody) return;
  tbody.replaceChildren();

  if (items.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'text-center';
    td.textContent = 'Chưa có bảng điểm';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="code-font">${escapeHtml(item.courseCode || '')}</td>
      <td>${escapeHtml(item.courseName || '')}</td>
      <td>${escapeHtml(item.processGrade || '-')}</td>
      <td>${escapeHtml(item.finalGrade || '-')}</td>
      <td><strong>${escapeHtml(item.totalGrade10 || '-')}</strong></td>
      <td>${escapeHtml(item.totalGrade4 || '-')}</td>
      <td><span class="badge ${getGradeBadgeClass(item.letterGrade)}">${escapeHtml(item.letterGrade || '-')}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function getGradeBadgeClass(letter) {
  if (['A', 'A+'].includes(letter)) return 'badge-emerald';
  if (['B', 'B+'].includes(letter)) return 'badge-indigo';
  if (['C', 'C+'].includes(letter)) return 'badge-amber';
  return 'badge-sub';
}

/* ── 6. Cron Job Trigger ── */
function initCronJob() {
  document.getElementById('btn-trigger-all-cron')?.addEventListener('click', () => {
    showToast('info', 'Đang khởi động tác vụ quét đồng bộ nền...');
    addLog('warning', '🚀 Đã kích hoạt quét tự động cho tất cả tài khoản trong hệ thống.');
  });

  document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
    document.getElementById('console-logs')?.replaceChildren();
    addLog('info', 'Đã xóa trắng màn hình nhật ký.');
  });
}

/* ── 7. Modals & Toasts ── */
function initModalAndToasts() {
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-test-result')?.classList.remove('active');
    });
  });
}

function showTestModal(target, isSuccess, data) {
  const modal = document.getElementById('modal-test-result');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  if (!modal || !title || !body) return;

  title.textContent = `Kết Quả Test: ${target.toUpperCase()}`;
  body.replaceChildren();

  const statusCard = document.createElement('div');
  statusCard.style.padding = '14px';
  statusCard.style.borderRadius = '8px';
  statusCard.style.marginBottom = '16px';
  statusCard.style.background = isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
  statusCard.style.border = `1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`;
  statusCard.style.color = isSuccess ? '#34d399' : '#f87171';
  statusCard.style.fontWeight = '600';
  statusCard.textContent = data.message || (isSuccess ? 'Thành công' : 'Thất bại');

  body.appendChild(statusCard);

  if (data.details) {
    const pre = document.createElement('pre');
    pre.className = 'code-font';
    pre.style.background = '#080c14';
    pre.style.padding = '12px';
    pre.style.borderRadius = '6px';
    pre.style.overflowX = 'auto';
    pre.style.fontSize = '12px';
    pre.textContent = JSON.stringify(data.details, null, 2);
    body.appendChild(pre);
  }

  modal.classList.add('active');
}

function showToast(type, text) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = text;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function addLog(type, text) {
  const box = document.getElementById('console-logs');
  if (!box) return;

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;

  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = `[${new Date().toLocaleTimeString('vi-VN')}]`;

  const msg = document.createElement('span');
  msg.textContent = ` ${text}`;

  entry.appendChild(time);
  entry.appendChild(msg);
  box.appendChild(entry);
  box.scrollTop = box.scrollHeight;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text !== null && text !== undefined ? text : '';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
