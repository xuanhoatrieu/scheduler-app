/**
 * Tab "Đẩy Thông báo" trong Admin Portal.
 * - Dựa vào window.fetch đã được bọc để tự gắn header x-admin-key (xem index.html).
 * - Mọi dữ liệu người dùng / máy chủ chỉ được đưa vào DOM bằng textContent (không innerHTML) → chống XSS.
 */
(function () {
  'use strict';

  const API = '/api/admin/announcements';
  const LIMIT_TITLE = 120;
  const LIMIT_BODY = 2000;
  const PUSH_BODY = 180;
  const BIG_AUDIENCE = 500;

  const state = {
    type: 'students',
    cohorts: new Set(),
    classes: new Map(), // idLop -> className
    cohortsLoaded: false,
    sending: false
  };

  const $ = (id) => document.getElementById(id);
  const toast = (type, text) => (typeof window.showToast === 'function' ? window.showToast(type, text) : alert(text));

  const el = (tag, opts = {}, children = []) => {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text != null) node.textContent = String(opts.text);
    if (opts.title) node.title = opts.title;
    if (opts.style) node.setAttribute('style', opts.style);
    for (const c of children) if (c) node.appendChild(c);
    return node;
  };

  const clear = (node) => { while (node && node.firstChild) node.removeChild(node.firstChild); };

  async function api(path, options = {}) {
    const res = await fetch(API + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok || !json || json.success === false) {
      const err = new Error((json && json.message) || `Lỗi máy chủ (${res.status})`);
      err.status = res.status;
      err.payload = json;
      throw err;
    }
    return json;
  }

  /* ───────── Đối tượng nhận ───────── */

  function selectType(type) {
    state.type = type;
    document.querySelectorAll('#ann-audience .ann-aud-btn').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
    $('ann-panel-cohorts').hidden = type !== 'cohorts';
    $('ann-panel-classes').hidden = type !== 'classes';
    $('ann-panel-users').hidden = type !== 'users';
    if (type === 'cohorts' && !state.cohortsLoaded) loadCohorts();
    resetPreview();
  }

  async function loadCohorts() {
    const box = $('ann-cohort-chips');
    try {
      const { data } = await api('/cohorts');
      state.cohortsLoaded = true;
      clear(box);
      if (!data.length) {
        box.appendChild(el('span', { className: 'form-hint', text: 'Không có Khóa nào đang có sinh viên.' }));
        return;
      }
      for (const c of data) {
        const chip = el('span', { className: 'ann-chip', text: `K${c.cohort} · ${c.studentCount.toLocaleString('vi-VN')} SV` });
        chip.dataset.cohort = String(c.cohort);
        chip.addEventListener('click', () => {
          if (state.cohorts.has(c.cohort)) state.cohorts.delete(c.cohort); else state.cohorts.add(c.cohort);
          chip.classList.toggle('on', state.cohorts.has(c.cohort));
          resetPreview();
        });
        box.appendChild(chip);
      }
    } catch (err) {
      clear(box);
      box.appendChild(el('span', { className: 'form-hint', text: `⚠️ ${err.message}` }));
      if (err.status === 503) toast('error', err.message);
    }
  }

  let searchTimer = null;
  function onClassSearch() {
    clearTimeout(searchTimer);
    const q = $('ann-class-search').value.trim();
    const box = $('ann-class-results');
    if (q.length < 2) { clear(box); return; }
    searchTimer = setTimeout(async () => {
      try {
        const { data } = await api(`/classes?q=${encodeURIComponent(q)}`);
        clear(box);
        if (!data.length) {
          box.appendChild(el('span', { className: 'form-hint', text: 'Không tìm thấy lớp phù hợp.' }));
          return;
        }
        for (const c of data) {
          const name = c.className || c.classCode || `#${c.idLop}`;
          const row = el('div', { className: 'ann-result' }, [
            el('span', { text: name }),
            el('span', { className: 'form-hint', style: 'margin:0', text: `K${c.cohort ?? '?'} · ${c.activeStudents} SV đang học` })
          ]);
          row.addEventListener('click', () => addClass(c.idLop, name));
          box.appendChild(row);
        }
      } catch (err) {
        clear(box);
        box.appendChild(el('span', { className: 'form-hint', text: `⚠️ ${err.message}` }));
      }
    }, 300);
  }

  function addClass(idLop, name) {
    if (state.classes.size >= 50) { toast('error', 'Tối đa 50 lớp mỗi lần gửi.'); return; }
    state.classes.set(idLop, name);
    renderSelectedClasses();
    resetPreview();
  }

  function renderSelectedClasses() {
    const box = $('ann-class-selected');
    clear(box);
    for (const [id, name] of state.classes) {
      const chip = el('span', { className: 'ann-chip on', title: 'Bấm để bỏ chọn' }, [el('span', { text: name }), el('span', { className: 'x', text: '×' })]);
      chip.addEventListener('click', () => { state.classes.delete(id); renderSelectedClasses(); resetPreview(); });
      box.appendChild(chip);
    }
  }

  /* ───────── Soạn & xem trước ───────── */

  function updateCounters() {
    const t = $('ann-title').value;
    const b = $('ann-body').value;
    $('ann-title-count').textContent = `${t.length}/${LIMIT_TITLE}`;
    $('ann-body-count').textContent = `${b.length}/${LIMIT_BODY}`;
    $('ann-title-count').classList.toggle('over', t.length > LIMIT_TITLE);
    $('ann-body-count').classList.toggle('over', b.length > LIMIT_BODY);
    $('ann-banner-title').textContent = t.trim() || 'Tiêu đề thông báo';
    const flat = b.replace(/\s+/g, ' ').trim();
    $('ann-banner-body').textContent = flat ? (flat.length > PUSH_BODY ? `${flat.slice(0, PUSH_BODY - 1)}…` : flat) : 'Nội dung sẽ hiển thị tại đây...';
  }

  function buildPayload() {
    const audience = { type: state.type };
    if (state.type === 'cohorts') audience.cohorts = [...state.cohorts];
    if (state.type === 'classes') audience.classIds = [...state.classes.keys()];
    if (state.type === 'users') audience.usernames = $('ann-usernames').value;
    return {
      title: $('ann-title').value,
      body: $('ann-body').value,
      senderLabel: $('ann-sender').value,
      urgent: $('ann-urgent').checked,
      audience
    };
  }

  function resetPreview() {
    $('ann-stats').hidden = true;
    const note = $('ann-preview-note');
    note.className = 'ann-note';
    note.textContent = 'Bấm “Xem trước số người nhận” để kiểm tra trước khi gửi.';
  }

  function renderPreview(summary, pushEnabled) {
    $('ann-stats').hidden = false;
    $('ann-stat-recipients').textContent = summary.recipients.toLocaleString('vi-VN');
    $('ann-stat-device').textContent = summary.withDevice.toLocaleString('vi-VN');
    $('ann-stat-students').textContent = summary.students.toLocaleString('vi-VN');
    $('ann-stat-lecturers').textContent = summary.lecturers.toLocaleString('vi-VN');
    const note = $('ann-preview-note');
    const lines = [`Đối tượng: ${summary.label}.`];
    if (summary.sourceCount != null && state.type !== 'users') {
      lines.push(`CSDL trường có ${summary.sourceCount.toLocaleString('vi-VN')} sinh viên đang học; ${summary.recipients.toLocaleString('vi-VN')} người đã dùng app.`);
    }
    if (summary.notFoundCount) {
      lines.push(`${summary.notFoundCount} tài khoản chưa dùng app / không hợp lệ: ${summary.notFound.slice(0, 10).join(', ')}${summary.notFoundCount > 10 ? '…' : ''}`);
    }
    if (!pushEnabled) lines.push('⚠️ Máy chủ đang tắt push (PUSH_ENABLED=false): thông báo chỉ vào hộp thư trong app.');
    note.className = summary.notFoundCount || !pushEnabled ? 'ann-note warn' : 'ann-note';
    note.textContent = lines.join(' ');
  }

  async function preview() {
    try {
      const res = await api('/preview', { method: 'POST', body: JSON.stringify(buildPayload()) });
      renderPreview(res.data, res.pushEnabled);
      return res.data;
    } catch (err) {
      toast('error', err.message);
      return null;
    }
  }

  async function send() {
    if (state.sending) return;
    const summary = await preview();
    if (!summary) return;
    if (summary.recipients === 0) { toast('error', 'Không có người nhận nào đang dùng app trong đối tượng đã chọn.'); return; }

    const payload = buildPayload();
    const msg = `Gửi thông báo "${payload.title.trim()}"\n→ ${summary.label}\n→ ${summary.recipients.toLocaleString('vi-VN')} người nhận (${summary.withDevice.toLocaleString('vi-VN')} máy nhận push)${payload.urgent ? '\n⚡ KHẨN: gửi ngay cả giờ yên lặng' : ''}\n\nThông báo đã gửi KHÔNG thể thu hồi. Tiếp tục?`;
    if (!window.confirm(msg)) return;
    if (summary.recipients >= BIG_AUDIENCE) {
      const typed = window.prompt(`Gửi tới ${summary.recipients.toLocaleString('vi-VN')} người. Gõ GUI để xác nhận:`);
      if ((typed || '').trim().toUpperCase() !== 'GUI') { toast('info', 'Đã hủy gửi.'); return; }
    }

    state.sending = true;
    const btn = $('btn-ann-send');
    btn.disabled = true;
    btn.textContent = '⏳ Đang gửi...';
    try {
      const res = await api('', { method: 'POST', body: JSON.stringify({ ...payload, confirm: true }) });
      const when = new Date(res.data.scheduledFor);
      const delayed = when.getTime() - Date.now() > 60 * 1000;
      toast('success', `Đã gửi tới ${res.data.recipients} người${delayed ? ` (push dời tới ${when.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})` : ''}.`);
      $('ann-title').value = '';
      $('ann-body').value = '';
      $('ann-urgent').checked = false;
      updateCounters();
      resetPreview();
      loadHistory();
    } catch (err) {
      toast('error', err.message);
    } finally {
      state.sending = false;
      btn.disabled = false;
      btn.textContent = '🚀 Gửi thông báo';
    }
  }

  /* ───────── Lịch sử ───────── */

  function pill(cls, text) { return el('span', { className: `ann-pill ${cls}`, text }); }

  async function loadHistory() {
    const tbody = $('tbody-announcements');
    try {
      const { data } = await api('?limit=50');
      clear(tbody);
      if (!data.length) {
        const td = el('td', { text: 'Chưa gửi thông báo nào.', style: 'text-align:center;color:var(--text-muted);padding:24px;' });
        td.colSpan = 6;
        tbody.appendChild(el('tr', {}, [td]));
        return;
      }
      for (const a of data) {
        const titleCell = el('td', {}, [
          el('div', { text: a.title, style: 'font-weight:600;color:#f1f5f9;' }),
          el('div', { className: 'form-hint', style: 'margin:2px 0 0;', text: `${a.senderLabel}${a.body.length > 90 ? ` · ${a.body.slice(0, 90)}…` : ` · ${a.body}`}` })
        ]);
        titleCell.title = a.body;
        const pushCell = el('td', {});
        if (a.urgent) pushCell.appendChild(pill('urgent', 'Khẩn'));
        if (a.push.sent) pushCell.appendChild(pill('ok', `${a.push.sent} đã gửi`));
        if (a.push.pending) pushCell.appendChild(pill('wait', `${a.push.pending} chờ`));
        if (a.push.dead || a.push.skipped) pushCell.appendChild(pill('bad', `${a.push.dead + a.push.skipped} lỗi/bỏ qua`));
        if (!pushCell.childNodes.length) pushCell.appendChild(el('span', { className: 'form-hint', style: 'margin:0', text: a.deviceUserCount ? '—' : 'Chỉ hộp thư' }));
        const pct = a.recipientCount ? Math.round((a.readCount / a.recipientCount) * 100) : 0;
        tbody.appendChild(el('tr', {}, [
          el('td', { text: new Date(a.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) }),
          titleCell,
          el('td', { text: a.audienceLabel }),
          el('td', { text: `${a.recipientCount.toLocaleString('vi-VN')}`, style: 'text-align:right;font-family:var(--font-mono);' }),
          pushCell,
          el('td', { text: `${a.readCount.toLocaleString('vi-VN')} (${pct}%)`, style: 'text-align:right;font-family:var(--font-mono);' })
        ]));
      }
    } catch (err) {
      clear(tbody);
      const td = el('td', { text: `⚠️ ${err.message}`, style: 'text-align:center;color:#fbbf24;padding:24px;' });
      td.colSpan = 6;
      tbody.appendChild(el('tr', {}, [td]));
    }
  }

  /* ───────── Khởi tạo ───────── */

  function tickClock() {
    const now = new Date();
    $('ann-phone-time').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  function init() {
    if (!$('tab-announcements')) return;
    document.querySelectorAll('#ann-audience .ann-aud-btn').forEach((b) => b.addEventListener('click', () => selectType(b.dataset.type)));
    $('ann-class-search').addEventListener('input', onClassSearch);
    $('ann-usernames').addEventListener('input', resetPreview);
    $('ann-title').addEventListener('input', updateCounters);
    $('ann-body').addEventListener('input', updateCounters);
    $('btn-ann-preview').addEventListener('click', preview);
    $('btn-ann-send').addEventListener('click', send);
    $('btn-ann-refresh').addEventListener('click', loadHistory);
    $('nav-announcements').addEventListener('click', () => { tickClock(); loadHistory(); });
    updateCounters();
    tickClock();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
