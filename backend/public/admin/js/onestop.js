/**
 * Tab "Dịch vụ Một cửa" (One-Stop Service) trong Admin Portal.
 * - Sử dụng DOM API an toàn (createElement + textContent) để chống XSS.
 * - Hỗ trợ 3 phân khu:
 *   1. Bàn làm việc Xử lý Hồ sơ & Duyệt Lệ phí (Staff Workbench)
 *   2. Quản lý Danh mục Thủ tục Động (Dynamic Service Catalog)
 *   3. Dashboard Giám sát SLA, Giải trình Quá hạn & Ý kiến Chỉ đạo Lãnh đạo
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const toast = (type, text) => {
    if (typeof window.showToast === 'function') {
      window.showToast(type, text);
    }
  };

  const el = (tag, opts = {}, children = []) => {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text != null) node.textContent = String(opts.text);
    if (opts.title) node.title = opts.title;
    if (opts.style) node.setAttribute('style', opts.style);
    if (opts.href) node.setAttribute('href', opts.href);
    if (opts.target) node.setAttribute('target', opts.target);
    if (opts.type) node.setAttribute('type', opts.type);
    if (opts.value != null) node.value = opts.value;
    if (opts.placeholder) node.setAttribute('placeholder', opts.placeholder);
    if (opts.onclick) node.addEventListener('click', opts.onclick);
    for (const c of children) {
      if (c) node.appendChild(c);
    }
    return node;
  };

  const clear = (node) => {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  };

  const STATUS_LABELS = {
    pending_payment: 'Chờ nộp lệ phí',
    payment_review: 'Chờ duyệt biên lai',
    submitted: 'Mới tiếp nhận',
    processing: 'Đang xử lý',
    need_more_info: 'Cần bổ sung HS',
    ready_for_pickup: 'Sẵn sàng trả KQ',
    completed: 'Đã hoàn thành',
    rejected: 'Từ chối',
    cancelled: 'Đã hủy',
  };

  const OVERDUE_CATEGORIES = {
    waiting_signature: 'Chờ trình ký Lãnh đạo',
    system_error: 'Lỗi hệ thống / phần mềm',
    student_late_supplement: 'Sinh viên bổ sung hồ sơ muộn',
    overload: 'Quá tải đợt cao điểm',
    other: 'Nguyên nhân khác',
  };

  let currentRequests = [];
  let currentServices = [];
  let selectedRequest = null;
  let editingService = null;

  async function apiCall(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      const err = new Error(json.message || `Lỗi máy chủ (${res.status})`);
      err.code = json.code;
      throw err;
    }
    return json;
  }

  /* ── Chuyển đổi Subtab ── */
  function switchOneStopSubtab(subtabId) {
    document.querySelectorAll('#tab-onestop .os-subtab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.osSubtab === subtabId);
    });
    document.querySelectorAll('#tab-onestop .os-subtab-pane').forEach((pane) => {
      pane.style.display = pane.id === subtabId ? 'block' : 'none';
    });

    if (subtabId === 'os-pane-workbench') {
      loadStaffRequests();
    } else if (subtabId === 'os-pane-catalog') {
      loadServiceCatalog();
    } else if (subtabId === 'os-pane-sla') {
      loadSlaOverview();
    }
  }

  /* ── 1. BÀN LÀM VIỆC XỬ LÝ HỒ SƠ & DUYỆT LỆ PHÍ ── */
  async function loadStaffRequests() {
    const tbody = $('os-requests-tbody');
    if (!tbody) return;
    try {
      const status = $('os-filter-status')?.value || '';
      const department = $('os-filter-dept')?.value || '';
      const overdueOnly = $('os-filter-overdue')?.checked ? 'true' : '';
      const search = $('os-filter-search')?.value.trim() || '';

      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (department) params.set('department', department);
      if (overdueOnly) params.set('overdue', 'true');
      if (search) params.set('search', search);

      const res = await apiCall(`/api/services/staff/requests?${params.toString()}`);
      currentRequests = res.data || [];

      if (res.stats) {
        if ($('os-stat-total')) $('os-stat-total').textContent = res.stats.total;
        if ($('os-stat-payment')) $('os-stat-payment').textContent = res.stats.paymentReview;
        if ($('os-stat-processing'))
          $('os-stat-processing').textContent = res.stats.submitted + res.stats.processing;
        if ($('os-stat-overdue')) $('os-stat-overdue').textContent = res.stats.overdue;
      }

      clear(tbody);
      if (!currentRequests.length) {
        const tr = el('tr', {}, [
          el('td', {
            text: 'Chưa có hồ sơ Một cửa nào khớp bộ lọc.',
            style: 'text-align:center;padding:24px;color:var(--text-muted);',
          }),
        ]);
        tr.firstChild.colSpan = 7;
        tbody.appendChild(tr);
        return;
      }

      for (const reqItem of currentRequests) {
        const isOverdue = Boolean(reqItem.isOverdue || reqItem.slaStatus?.isOverdue);
        const slaColor = isOverdue
          ? '#f87171'
          : reqItem.slaStatus?.isNearDue
          ? '#fbbf24'
          : '#4ade80';

        const tr = el('tr', {}, [
          el('td', { className: 'code-font', style: 'font-weight:700;color:#60a5fa;', text: reqItem.requestCode }),
          el('td', {}, [
            el('div', { style: 'font-weight:600;color:#fff;', text: reqItem.studentFullName }),
            el('div', {
              style: 'font-size:12px;color:var(--text-muted);',
              text: `${reqItem.studentUsername || reqItem.nationalId || 'Cựu SV'} • ${reqItem.studentClass || '—'}`,
            }),
          ]),
          el('td', {}, [
            el('div', { style: 'font-weight:600;', text: reqItem.serviceName }),
            el('div', { style: 'font-size:12px;color:var(--text-muted);', text: reqItem.assignedDepartment }),
          ]),
          el('td', {}, [
            el('span', {
              className: 'badge',
              style: 'background:rgba(59,130,246,0.18);color:#93c5fd;padding:4px 10px;border-radius:999px;font-size:12px;',
              text: STATUS_LABELS[reqItem.status] || reqItem.status,
            }),
          ]),
          el('td', {}, [
            el('div', {
              style: `font-weight:700;font-size:12px;color:${slaColor};`,
              text: reqItem.slaStatus?.remainingText || '—',
            }),
            isOverdue && !reqItem.overdueReason
              ? el('div', {
                  style: 'font-size:11px;color:#fca5a5;margin-top:2px;',
                  text: '⚠️ Chưa giải trình quá hạn',
                })
              : null,
          ]),
          el('td', {
            style: 'font-size:12px;',
            text:
              Number(reqItem.feeAmount) > 0
                ? `${Number(reqItem.feeAmount).toLocaleString('vi-VN')}đ (${reqItem.paymentStatus})`
                : 'Miễn phí',
          }),
          el('td', {}, [
            el('button', {
              className: 'btn btn-sm btn-primary',
              text: '⚙️ Xử lý',
              onclick: () => openRequestDetailModal(reqItem),
            }),
          ]),
        ]);
        tbody.appendChild(tr);
      }
    } catch (err) {
      toast('error', err.message);
    }
  }

  function openRequestDetailModal(reqItem) {
    selectedRequest = reqItem;
    const modal = $('modal-os-request-detail');
    if (!modal) return;

    $('os-modal-req-title').textContent = `Hồ sơ #${reqItem.requestCode} — ${reqItem.serviceName}`;
    $('os-modal-student-info').textContent = `${reqItem.studentFullName} (${
      reqItem.studentUsername || reqItem.nationalId || 'Cựu SV'
    }) • Lớp: ${reqItem.studentClass || '—'} • SĐT: ${reqItem.studentPhone || '—'}`;
    $('os-modal-sla-info').textContent = `Đơn vị: ${reqItem.assignedDepartment} • Trạng thái SLA: ${
      reqItem.slaStatus?.remainingText || '—'
    }`;

    // Hiển thị dữ liệu biểu mẫu động
    const formBox = $('os-modal-form-data');
    clear(formBox);
    const formEntries = Object.entries(reqItem.formData || {});
    if (formEntries.length === 0) {
      formBox.appendChild(el('div', { style: 'font-size:13px;color:var(--text-muted);', text: 'Không có trường dữ liệu bổ sung.' }));
    } else {
      for (const [k, v] of formEntries) {
        formBox.appendChild(
          el('div', { style: 'font-size:13px;margin-bottom:4px;' }, [
            el('strong', { text: `${k}: ` }),
            el('span', { text: String(v) }),
          ])
        );
      }
    }

    const hrNoteBox = $('os-modal-homeroom-note');
    if (hrNoteBox) {
      if (reqItem.homeroomNote) {
        hrNoteBox.style.display = 'block';
        hrNoteBox.textContent = `✍️ Ý kiến GVCN (${reqItem.homeroomNotedBy || 'GVCN'}): "${reqItem.homeroomNote}"`;
      } else {
        hrNoteBox.style.display = 'none';
        hrNoteBox.textContent = '';
      }
    }

    // Hiển thị khu vực đối soát lệ phí nếu có
    const paymentBox = $('os-modal-payment-section');
    if (Number(reqItem.feeAmount) > 0) {
      paymentBox.style.display = 'block';
      $('os-modal-fee-text').textContent = `Lệ phí: ${Number(reqItem.feeAmount).toLocaleString(
        'vi-VN'
      )} VNĐ — Trạng thái: ${reqItem.paymentStatus}`;
      const proofLinkBox = $('os-modal-proof-link');
      clear(proofLinkBox);
      if (reqItem.paymentProofUrl) {
        proofLinkBox.appendChild(
          el('a', {
            href: reqItem.paymentProofUrl,
            target: '_blank',
            style: 'color:#60a5fa;font-weight:600;font-size:13px;',
            text: '🖼️ Xem ảnh biên lai chuyển khoản của sinh viên',
          })
        );
      } else {
        proofLinkBox.appendChild(
          el('span', { style: 'font-size:12px;color:var(--text-muted);', text: 'Sinh viên chưa tải lên ảnh biên lai.' })
        );
      }
    } else {
      paymentBox.style.display = 'none';
    }

    // Hiển thị cảnh báo bắt buộc giải trình nếu quá hạn SLA
    const isOverdue = Boolean(reqItem.isOverdue || reqItem.slaStatus?.isOverdue);
    const overdueBox = $('os-modal-overdue-section');
    overdueBox.style.display = isOverdue ? 'block' : 'none';
    $('os-inp-overdue-category').value = reqItem.overdueReasonCategory || 'waiting_signature';
    $('os-inp-overdue-reason').value = reqItem.overdueReason || '';

    // Điền giá trị xử lý hiện tại
    $('os-inp-status').value =
      reqItem.status === 'pending_payment' || reqItem.status === 'payment_review'
        ? 'processing'
        : reqItem.status;
    $('os-inp-staff-note').value = reqItem.staffNote || '';
    $('os-inp-tray-location').value = reqItem.trayLocation || '';
    $('os-inp-postal-tracking').value = reqItem.postalTrackingNumber || '';

    modal.classList.add('active');
  }

  async function handleConfirmPayment() {
    if (!selectedRequest) return;
    try {
      await apiCall(`/api/services/staff/requests/${selectedRequest.id}/confirm-payment`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Đã xác nhận biên lai hợp lệ trên Cổng Quản trị.' }),
      });
      toast('success', 'Đã xác nhận biên lai lệ phí và chuyển sang Đang xử lý!');
      $('modal-os-request-detail')?.classList.remove('active');
      loadStaffRequests();
    } catch (err) {
      toast('error', err.message);
    }
  }

  async function handleRejectPayment() {
    if (!selectedRequest) return;
    const reason = $('os-inp-staff-note')?.value.trim();
    if (!reason) {
      toast('error', 'Vui lòng nhập lý do từ chối biên lai vào ô Ghi chú cán bộ!');
      return;
    }
    try {
      await apiCall(`/api/services/staff/requests/${selectedRequest.id}/reject-payment`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      toast('success', 'Đã yêu cầu sinh viên tải lại biên lai!');
      $('modal-os-request-detail')?.classList.remove('active');
      loadStaffRequests();
    } catch (err) {
      toast('error', err.message);
    }
  }

  async function handleProcessRequest() {
    if (!selectedRequest) return;
    try {
      const payload = {
        status: $('os-inp-status').value,
        staffNote: $('os-inp-staff-note').value.trim(),
        trayLocation: $('os-inp-tray-location').value.trim(),
        postalTrackingNumber: $('os-inp-postal-tracking').value.trim(),
        overdueReasonCategory: $('os-inp-overdue-category').value,
        overdueReason: $('os-inp-overdue-reason').value.trim(),
      };

      await apiCall(`/api/services/staff/requests/${selectedRequest.id}/process`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast('success', 'Đã cập nhật trạng thái xử lý hồ sơ thành công!');
      $('modal-os-request-detail')?.classList.remove('active');
      loadStaffRequests();
    } catch (err) {
      toast('error', err.message);
    }
  }

  async function handleQuickQrHandover() {
    const code = $('os-inp-quick-qr')?.value.trim();
    if (!code) {
      toast('error', 'Vui lòng nhập hoặc quét mã QR nhận bản giấy / Mã hồ sơ!');
      return;
    }
    try {
      const res = await apiCall('/api/services/staff/requests/scan/handover', {
        method: 'POST',
        body: JSON.stringify({ pickupQrCode: code }),
      });
      toast('success', res.message || 'Đã bàn giao bản giấy thành công!');
      $('os-inp-quick-qr').value = '';
      loadStaffRequests();
    } catch (err) {
      toast('error', err.message);
    }
  }

  /* ── 2. QUẢN LÝ DANH MỤC THỦ TỤC ĐỘNG ── */
  async function loadServiceCatalog() {
    const tbody = $('os-catalog-tbody');
    if (!tbody) return;
    try {
      const res = await apiCall('/api/admin/services');
      currentServices = res.data || [];
      clear(tbody);

      for (const srv of currentServices) {
        const tr = el('tr', {}, [
          el('td', { className: 'code-font', style: 'font-weight:700;color:#93c5fd;', text: srv.code }),
          el('td', {}, [
            el('div', { style: 'font-weight:600;color:#fff;', text: srv.name }),
            el('div', {
              style: 'font-size:12px;color:var(--text-muted);',
              text: srv.allowAlumni ? 'Hỗ trợ cả SV & Cựu SV (/onegate)' : 'Chỉ SV đang theo học',
            }),
          ]),
          el('td', { text: srv.department }),
          el('td', { style: 'font-weight:700;', text: `${srv.slaHours} giờ` }),
          el('td', {}, [
            el('div', { text: srv.assigneeName || '—' }),
            srv.assigneeUsername
              ? el('div', {
                  className: 'code-font',
                  style: 'font-size:11px;color:#4ade80;font-weight:700;',
                  text: `🔑 TK App: ${srv.assigneeUsername}`,
                })
              : el('div', {
                  style: 'font-size:11px;color:#fbbf24;',
                  text: '⚠️ Chưa gán TK App',
                }),
            el('div', { style: 'font-size:12px;color:var(--text-muted);', text: srv.assigneeEmail || '' }),
          ]),
          el('td', {
            text: srv.isPaid ? `${Number(srv.feeAmount).toLocaleString('vi-VN')}đ` : 'Miễn phí',
          }),
          el('td', {}, [
            el('button', {
              className: `btn btn-sm ${srv.isActive ? 'btn-primary' : 'btn-secondary'}`,
              text: srv.isActive ? '🟢 Đang Mở' : '⚪ Đang Tắt',
              onclick: () => toggleServiceStatus(srv),
            }),
          ]),
          el('td', {}, [
            el('button', {
              className: 'btn btn-sm btn-outline',
              text: '✏️ Cấu hình',
              onclick: () => openServiceEditorModal(srv),
            }),
          ]),
        ]);
        tbody.appendChild(tr);
      }
    } catch (err) {
      toast('error', err.message);
    }
  }

  async function toggleServiceStatus(srv) {
    try {
      const res = await apiCall(`/api/admin/services/${srv.id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !srv.isActive }),
      });
      toast('success', res.message);
      loadServiceCatalog();
    } catch (err) {
      toast('error', err.message);
    }
  }

  function openServiceEditorModal(srv = null) {
    editingService = srv;
    const modal = $('modal-os-service-editor');
    if (!modal) return;

    $('os-srv-modal-title').textContent = srv
      ? `✏️ Cấu hình Thủ tục: ${srv.name}`
      : '➕ Thêm Thủ Tục Hành Chính Một Cửa Mới';
    $('os-srv-code').value = srv ? srv.code : '';
    $('os-srv-code').disabled = Boolean(srv);
    $('os-srv-name').value = srv ? srv.name : '';
    $('os-srv-dept').value = srv ? srv.department : 'Phòng Công tác HSSV';
    $('os-srv-sla').value = srv ? srv.slaHours : 24;
    $('os-srv-fee').value = srv ? srv.feeAmount : 0;
    $('os-srv-postal-fee').value = srv ? srv.postalFeeAmount : 30000;
    if ($('os-srv-assignee-username')) {
      $('os-srv-assignee-username').value = srv ? srv.assigneeUsername || '' : '';
    }
    $('os-srv-assignee-name').value = srv ? srv.assigneeName || '' : '';
    $('os-srv-assignee-email').value = srv ? srv.assigneeEmail || '' : '';
    $('os-srv-assignee-phone').value = srv ? srv.assigneePhone || '' : '';
    $('os-srv-leader-email').value = srv ? srv.leaderEmail || '' : '';
    $('os-srv-allow-alumni').checked = srv ? Boolean(srv.allowAlumni) : false;
    $('os-srv-is-active').checked = srv ? Boolean(srv.isActive) : true;

    modal.classList.add('active');
  }

  async function handleLookupOneStopStaff() {
    const raw = $('os-srv-assignee-username')?.value.trim() || '';
    const firstCode = raw.split(/[,;\s]+/).filter(Boolean)[0];
    if (!firstCode) {
      toast('error', 'Vui lòng nhập Mã cán bộ / Username để tra cứu từ CSDL TUAF!');
      return;
    }
    try {
      const res = await apiCall(`/api/admin/inspectors/lookup?username=${encodeURIComponent(firstCode)}`);
      if (res.found && res.data) {
        $('os-srv-assignee-name').value = res.data.fullName || '';
        if (res.data.email) $('os-srv-assignee-email').value = res.data.email;
        toast('success', `Đã tìm thấy cán bộ: ${res.data.fullName} (${res.data.department || 'TUAF'})`);
      } else {
        toast('error', res.message || 'Không tìm thấy cán bộ trong CSDL TUAF!');
      }
    } catch (err) {
      toast('error', err.message || 'Lỗi tra cứu cán bộ TUAF!');
    }
  }

  async function handleSaveServiceCatalog() {
    try {
      const feeAmount = Math.max(0, parseInt($('os-srv-fee').value, 10) || 0);
      const payload = {
        code: $('os-srv-code').value.trim().toUpperCase(),
        name: $('os-srv-name').value.trim(),
        department: $('os-srv-dept').value.trim(),
        slaHours: Math.max(1, parseInt($('os-srv-sla').value, 10) || 24),
        isPaid: feeAmount > 0,
        feeAmount,
        postalFeeAmount: Math.max(0, parseInt($('os-srv-postal-fee').value, 10) || 0),
        assigneeUsername: $('os-srv-assignee-username')
          ? $('os-srv-assignee-username').value.trim()
          : '',
        assigneeName: $('os-srv-assignee-name').value.trim(),
        assigneeEmail: $('os-srv-assignee-email').value.trim(),
        assigneePhone: $('os-srv-assignee-phone').value.trim(),
        leaderEmail: $('os-srv-leader-email').value.trim(),
        allowAlumni: $('os-srv-allow-alumni').checked,
        isActive: $('os-srv-is-active').checked,
      };

      if (editingService) {
        await apiCall(`/api/admin/services/${editingService.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast('success', 'Đã lưu cấu hình thủ tục thành công!');
      } else {
        await apiCall('/api/admin/services', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast('success', 'Đã tạo mới thủ tục hành chính thành công!');
      }

      $('modal-os-service-editor')?.classList.remove('active');
      loadServiceCatalog();
    } catch (err) {
      toast('error', err.message);
    }
  }

  /* ── 3. DASHBOARD GIÁM SÁT SLA & GIẢI TRÌNH LÃNH ĐẠO ── */
  async function loadSlaOverview() {
    try {
      const res = await apiCall('/api/admin/services/overview');
      const sum = res.summary || {};

      if ($('os-kpi-ontime')) $('os-kpi-ontime').textContent = `${sum.onTimeRate ?? 100}%`;
      if ($('os-kpi-overdue')) $('os-kpi-overdue').textContent = sum.overdueCount ?? 0;
      if ($('os-kpi-unexplained'))
        $('os-kpi-unexplained').textContent = sum.unexplainedOverdueCount ?? 0;
      if ($('os-kpi-rating'))
        $('os-kpi-rating').textContent = `${sum.avgRating || 5.0} ⭐ (${sum.ratedCount || 0})`;

      // Bảng theo phòng ban
      const deptTbody = $('os-dept-sla-tbody');
      if (deptTbody) {
        clear(deptTbody);
        const depts = res.byDepartment || [];
        if (!depts.length) {
          const tr = el('tr', {}, [
            el('td', {
              text: 'Chưa có dữ liệu thống kê theo phòng ban.',
              style: 'text-align:center;padding:16px;color:var(--text-muted);',
            }),
          ]);
          tr.firstChild.colSpan = 5;
          deptTbody.appendChild(tr);
        } else {
          for (const d of depts) {
            deptTbody.appendChild(
              el('tr', {}, [
                el('td', { style: 'font-weight:700;color:#fff;', text: d.department }),
                el('td', { text: d.total }),
                el('td', { style: 'color:#4ade80;font-weight:600;', text: d.completed }),
                el('td', { style: 'color:#f87171;font-weight:700;', text: d.overdue }),
                el('td', { style: 'color:#fbbf24;font-weight:700;', text: d.unexplainedOverdue }),
              ])
            );
          }
        }
      }

      // Bảng danh sách hồ sơ quá hạn & giải trình
      const overdueTbody = $('os-overdue-explain-tbody');
      if (overdueTbody) {
        clear(overdueTbody);
        const overdues = res.overdueList || [];
        if (!overdues.length) {
          const tr = el('tr', {}, [
            el('td', {
              text: '🎉 Tuyệt vời! Không có hồ sơ nào bị quá hạn SLA.',
              style: 'text-align:center;padding:20px;color:#4ade80;font-weight:600;',
            }),
          ]);
          tr.firstChild.colSpan = 6;
          overdueTbody.appendChild(tr);
        } else {
          for (const item of overdues) {
            const dirInput = el('input', {
              type: 'text',
              className: 'form-control',
              value: item.leaderDirective || '',
              placeholder: 'Nhập chỉ đạo của Lãnh đạo...',
              style: 'font-size:12px;padding:6px 10px;',
            });

            overdueTbody.appendChild(
              el('tr', {}, [
                el('td', { className: 'code-font', style: 'font-weight:700;color:#f87171;', text: item.requestCode }),
                el('td', {}, [
                  el('div', { style: 'font-weight:600;', text: item.serviceName }),
                  el('div', { style: 'font-size:12px;color:var(--text-muted);', text: item.assignedDepartment }),
                ]),
                el('td', { text: item.assignedStaffName || 'Chưa phân công' }),
                el('td', {
                  style: 'font-size:12px;',
                  text: item.overdueReason
                    ? `[${OVERDUE_CATEGORIES[item.overdueReasonCategory] || item.overdueReasonCategory}] ${item.overdueReason}`
                    : '❌ CHƯA GIẢI TRÌNH',
                }),
                el('td', {}, [dirInput]),
                el('td', {}, [
                  el('button', {
                    className: 'btn btn-sm btn-primary',
                    text: '💾 Lưu chỉ đạo',
                    onclick: async () => {
                      try {
                        await apiCall(`/api/admin/services/requests/${item.id}/directive`, {
                          method: 'POST',
                          body: JSON.stringify({ leaderDirective: dirInput.value.trim() }),
                        });
                        toast('success', `Đã lưu chỉ đạo cho hồ sơ #${item.requestCode}!`);
                      } catch (e) {
                        toast('error', e.message);
                      }
                    },
                  }),
                ]),
              ])
            );
          }
        }
      }
    } catch (err) {
      toast('error', err.message);
    }
  }

  async function handleSendWeeklyDigest() {
    try {
      const res = await apiCall('/api/admin/services/send-digest', { method: 'POST' });
      toast('success', res.message);
    } catch (err) {
      toast('error', err.message);
    }
  }

  function initOneStopAdmin() {
    document.querySelectorAll('#tab-onestop .os-subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchOneStopSubtab(btn.dataset.osSubtab));
    });

    $('btn-os-filter')?.addEventListener('click', loadStaffRequests);
    $('btn-os-quick-handover')?.addEventListener('click', handleQuickQrHandover);
    $('btn-os-confirm-payment')?.addEventListener('click', handleConfirmPayment);
    $('btn-os-reject-payment')?.addEventListener('click', handleRejectPayment);
    $('btn-os-save-process')?.addEventListener('click', handleProcessRequest);
    $('btn-os-new-service')?.addEventListener('click', () => openServiceEditorModal(null));
    $('btn-os-lookup-staff')?.addEventListener('click', handleLookupOneStopStaff);
    $('btn-os-save-service')?.addEventListener('click', handleSaveServiceCatalog);
    $('btn-os-send-digest')?.addEventListener('click', handleSendWeeklyDigest);

    const navBtn = $('nav-onestop');
    if (navBtn) {
      navBtn.addEventListener('click', () => {
        loadStaffRequests();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOneStopAdmin);
  } else {
    initOneStopAdmin();
  }
})();
