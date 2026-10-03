/**
 * financeCalculator — HÀM TÍNH HỌC PHÍ DUY NHẤT dùng chung cho:
 *   - Sinh viên: /api/finance, /api/finance/all, đồng bộ lịch sử (syncHistory)
 *   - GVCN: danh sách học phí lớp và chi tiết từng sinh viên
 *
 * Hàm thuần (không đụng DB) → cùng dữ liệu gốc từ SQL Server TUAF luôn ra cùng con số
 * ở mọi màn hình. Logic được chuyển nguyên vẹn từ DatabaseStrategy (chia kỳ + gộp kỳ)
 * và routes/schedule.js (/finance/all: tổng toàn khóa + cấn trừ + nhãn).
 */

// Số dư toàn khóa có |giá trị| nhỏ hơn ngưỡng này (lệch do làm tròn vài đồng) được coi là "Đã nộp đủ".
const SETTLE_TOLERANCE = 1000;

/** Làm tròn tiền về số nguyên giống PostgreSQL INTEGER (nửa đơn vị làm tròn ra xa số 0). */
function roundMoney(value) {
  const n = Number(value) || 0;
  return Math.sign(n) * Math.round(Math.abs(n));
}

function formatDate(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Chuẩn hóa năm học (sửa lỗi các biên lai bị ghi năm học 0-1). */
function normalizeSchoolYear(schoolYear, date) {
  if (schoolYear && schoolYear.includes('-') && schoolYear !== '0-1') {
    return schoolYear;
  }
  if (date) {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      if (month >= 8) {
        return `${year}-${year + 1}`;
      } else {
        return `${year - 1}-${year}`;
      }
    }
  }
  return schoolYear || '';
}

function isRefundReceipt(r) {
  return r.Thu_chi === false || Boolean(r.Noi_dung && r.Noi_dung.toLowerCase().includes('hoàn'));
}

/**
 * Gom nhóm biên lai, miễn giảm, và công nợ tổng hợp của MỘT kỳ thành đối tượng chi tiết.
 */
function aggregateFinanceGroup(group) {
  const { receipts = [], exemptions = [], summaryTerm = null, namVietRow = null } = group || {};

  let totalTuition = namVietRow ? (namVietRow.So_tien_phai_nop || 0) : (summaryTerm ? (summaryTerm.So_tien_phai_nop || 0) : 0);
  let discountTuition = namVietRow ? (namVietRow.So_tien_mien_giam || 0) : (summaryTerm ? (summaryTerm.So_tien_mien_giam || 0) : 0);
  let paidTuition = namVietRow ? (namVietRow.So_tien_da_nop || 0) : (summaryTerm ? (summaryTerm.So_tien_da_nop || 0) : 0);
  let refundTuition = namVietRow ? (namVietRow.So_tien_tra_lai || 0) : (summaryTerm ? (summaryTerm.So_tien_tra_lai || 0) : 0);
  let debtTuition = namVietRow ? (namVietRow.Thieu_thua || 0) : (summaryTerm ? (summaryTerm.Thieu_thua || 0) : 0);

  // Tính toán từ receipts và exemptions nếu không có dữ liệu chốt từ Stored Procedure / bảng tổng hợp
  if (!namVietRow && !summaryTerm) {
    for (const r of receipts) {
      if (isRefundReceipt(r)) {
        refundTuition += Math.abs(r.So_tien || 0);
      } else {
        paidTuition += (r.So_tien || 0);
      }
    }

    if (totalTuition === 0 && paidTuition > 0) {
      totalTuition = paidTuition;
    }

    if (exemptions.length > 0) {
      const percent = exemptions[0]?.Phan_tram || 0;
      discountTuition = exemptions.reduce((sum, e) => sum + (e.So_tien_MG || 0), 0);
      if (percent === 100) {
        discountTuition = totalTuition > 0 ? totalTuition : (discountTuition || 0);
        debtTuition = 0;
      }
    }

    debtTuition = totalTuition - discountTuition - paidTuition + refundTuition;
  } else {
    // Khi không có dữ liệu chốt từ Stored Procedure NamViet (chỉ có summaryTerm), mới dùng receipts để kiểm tra bù đắp
    if (!namVietRow && summaryTerm && receipts.length > 0) {
      const receiptTotal = receipts.reduce((sum, r) => sum + (r.Thu_chi !== false ? (r.So_tien || 0) : 0), 0);
      if (receiptTotal > paidTuition) {
        paidTuition = receiptTotal;
        debtTuition = (totalTuition - discountTuition) - paidTuition;
      }
    }

    if (discountTuition === 0 && debtTuition === 0 && paidTuition === 0 && totalTuition > 0) {
      discountTuition = totalTuition;
    }
  }

  const mustPayTuition = Math.max(0, totalTuition - discountTuition);

  const invoiceDetails = receipts.map(r => ({
    invoiceNo: r.So_phieu || '',
    date: formatDate(r.Ngay_thu),
    amount: Math.abs(r.So_tien || 0),
    round: r.Lan_thu || 1,
    description: r.Noi_dung || '',
    isRefund: isRefundReceipt(r)
  }));

  return {
    totalTuition,
    mustPayTuition,
    discountTuition,
    paidTuition,
    refundTuition,
    debtTuition,
    invoiceDetails
  };
}

/**
 * Chia dữ liệu gốc của MỘT sinh viên theo kỳ: { 'HocKy1|2026-2027': { receipts, exemptions, summaryTerm, namVietRow } }
 * @param {{namViet?: object[], receipts?: object[], exemptions?: object[], summaryTerms?: object[]}} raw
 */
function groupFinanceSources(raw) {
  const { namViet = [], receipts = [], exemptions = [], summaryTerms = [] } = raw || {};
  const financeByKey = {};
  const ensure = (key) => {
    if (!financeByKey[key]) financeByKey[key] = { receipts: [], exemptions: [], summaryTerm: null, namVietRow: null };
    return financeByKey[key];
  };

  // Ghi nhận kỳ từ Stored Procedure Nam Việt (chuẩn xác nhất theo tín chỉ)
  for (const r of (namViet || [])) {
    const cleanYear = normalizeSchoolYear(r.nam_hoc, null);
    const group = ensure(`HocKy${r.Hoc_ky}|${cleanYear}`);
    if (group.namVietRow) {
      group.namVietRow.So_tien_phai_nop = (group.namVietRow.So_tien_phai_nop || 0) + (r.So_tien_phai_nop || 0);
      group.namVietRow.So_tien_mien_giam = (group.namVietRow.So_tien_mien_giam || 0) + (r.So_tien_mien_giam || 0);
      group.namVietRow.So_tien_nop = (group.namVietRow.So_tien_nop || 0) + (r.So_tien_nop || 0);
      group.namVietRow.So_tien_da_nop = (group.namVietRow.So_tien_da_nop || 0) + (r.So_tien_da_nop || 0);
      group.namVietRow.Thieu_thua = (group.namVietRow.Thieu_thua || 0) + (r.Thieu_thua || 0);
    } else {
      group.namVietRow = { ...r, nam_hoc: cleanYear };
    }
  }

  // Ghi nhận kỳ từ biên lai
  for (const r of (receipts || [])) {
    ensure(`HocKy${r.Hoc_ky}|${normalizeSchoolYear(r.Nam_hoc, r.Ngay_thu)}`).receipts.push(r);
  }

  // Ghi nhận kỳ từ bảng miễn giảm
  for (const r of (exemptions || [])) {
    ensure(`HocKy${r.Hoc_ky}|${normalizeSchoolYear(r.Nam_hoc, null)}`).exemptions.push(r);
  }

  // Ghi nhận kỳ từ bảng tổng hợp công nợ theo kỳ
  for (const r of (summaryTerms || [])) {
    ensure(`HocKy${r.Hoc_ky}|${normalizeSchoolYear(r.Nam_hoc, null)}`).summaryTerm = r;
  }

  return financeByKey;
}

/**
 * Dữ liệu gốc của MỘT sinh viên → danh sách kỳ (cùng dạng với bản ghi Finance trong PostgreSQL),
 * xếp theo năm học tăng dần rồi học kỳ tăng dần.
 */
function buildFinanceTerms(raw) {
  const terms = Object.entries(groupFinanceSources(raw)).map(([key, group]) => {
    const [semester, schoolYear] = key.split('|');
    const a = aggregateFinanceGroup(group);
    return {
      semester,
      schoolYear: schoolYear || '',
      totalTuition: roundMoney(a.totalTuition),
      mustPayTuition: roundMoney(a.mustPayTuition),
      discountTuition: roundMoney(a.discountTuition),
      paidTuition: roundMoney(a.paidTuition),
      refundTuition: roundMoney(a.refundTuition),
      debtTuition: roundMoney(a.debtTuition),
      invoiceDetails: a.invoiceDetails
    };
  });
  return sortTermsAsc(terms);
}

function sortTermsAsc(terms) {
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...terms].sort((x, y) => cmp(x.schoolYear || '', y.schoolYear || '') || cmp(x.semester || '', y.semester || ''));
}

/**
 * Danh sách kỳ → { data: các kỳ đã chuẩn hóa nhãn, summary: tổng toàn khóa }.
 * Nhận cả bản ghi Sequelize (có toJSON) lẫn object thường.
 */
function summarizeFinance(rows) {
  // Chuẩn hóa tính toán công nợ và miễn giảm theo thực tế
  const processedFinances = (rows || []).map(row => {
    const f = row && typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
    const totalTuition = f.totalTuition || 0;
    const mustPayTuition = f.mustPayTuition !== undefined && f.mustPayTuition !== null ? f.mustPayTuition : totalTuition;
    let discountTuition = f.discountTuition || 0;
    const paidTuition = f.paidTuition || 0;
    const refundTuition = f.refundTuition || 0;
    const debtTuition = f.debtTuition || 0;

    // Xử lý sinh viên được miễn giảm 100% (Phải nộp = 0, Học phí gốc > 0)
    if (discountTuition === 0 && mustPayTuition === 0 && totalTuition > 0) {
      discountTuition = totalTuition;
    } else if (!discountTuition && totalTuition > mustPayTuition) {
      discountTuition = totalTuition - mustPayTuition;
    }

    const discountPercent = totalTuition > 0 ? Math.min(100, Math.round((discountTuition / totalTuition) * 100)) : 0;

    return {
      ...f,
      totalTuition,
      discountTuition,
      discountPercent,
      mustPayTuition,
      paidTuition,
      refundTuition,
      debtTuition
    };
  });

  // Tính tổng qua các kỳ đã ghi nhận
  const totalTuition = processedFinances.reduce((sum, f) => sum + f.totalTuition, 0);
  const totalDiscount = processedFinances.reduce((sum, f) => sum + f.discountTuition, 0);
  const totalMustPay = processedFinances.reduce((sum, f) => sum + f.mustPayTuition, 0);
  const totalPaid = processedFinances.reduce((sum, f) => sum + f.paidTuition, 0);
  const totalRefund = processedFinances.reduce((sum, f) => sum + f.refundTuition, 0);

  // QUY TẮC CÔNG NỢ TOÀN KHÓA (CÓ CẤN TRỪ LIÊN KỲ):
  // Phải nộp lũy kế - Đã nộp lũy kế + Đã hoàn trả
  const netBalance = totalMustPay - totalPaid + totalRefund;
  // Lệch dưới SETTLE_TOLERANCE (do làm tròn) được coi là đã nộp đủ — áp dụng như nhau cho SV và GVCN.
  const withinTolerance = Math.abs(netBalance) < SETTLE_TOLERANCE;
  const totalDebt = withinTolerance ? 0 : Math.max(0, netBalance);
  const totalSurplus = !withinTolerance && netBalance < 0 ? Math.abs(netBalance) : 0;
  const isOverallSettled = totalDebt === 0;

  // Chuẩn hóa từng kỳ: Tách bạch rõ ràng nợ / thừa / đã cấn trừ, không để số âm lọt ra ngoài
  const enrichedFinances = processedFinances.map(f => {
    const rawDebt = f.debtTuition || 0;
    const isOverpaid = rawDebt < 0;
    const surplusAmount = isOverpaid ? Math.abs(rawDebt) : 0;

    let termDebt = 0;
    let status = 'completed';
    let badge = '✓ Đã nộp đủ';
    let note = '';

    if (isOverpaid) {
      status = 'surplus';
      badge = `✓ Nộp thừa ${surplusAmount.toLocaleString('vi-VN')}đ`;
      note = 'Số dư thừa lưu trên hệ thống';
    } else if (rawDebt > 0) {
      if (isOverallSettled) {
        // Sinh viên có nợ cục bộ ở kỳ này nhưng tổng thể toàn khóa đã hết nợ (được cấn trừ)
        status = 'offset';
        termDebt = 0;
        badge = '✓ Đã cấn trừ đủ';
        note = 'Đã bù trừ từ các kỳ sau';
      } else {
        status = 'debt';
        termDebt = rawDebt;
        badge = `Còn thiếu ${termDebt.toLocaleString('vi-VN')}đ`;
        note = 'Chưa thanh toán đủ';
      }
    }

    return {
      ...f,
      rawDebtTuition: rawDebt,
      debtTuition: termDebt,
      surplusTuition: surplusAmount,
      status,
      badge,
      note
    };
  });

  let summaryStatus = 'completed';
  let summaryStatusText = 'Đã hoàn thành nghĩa vụ học phí';
  if (totalDebt > 0) {
    summaryStatus = 'debt';
    summaryStatusText = `Còn nợ ${totalDebt.toLocaleString('vi-VN')}đ`;
  } else if (totalSurplus > 0) {
    summaryStatus = 'surplus';
    summaryStatusText = `Đang nộp thừa ${totalSurplus.toLocaleString('vi-VN')}đ`;
  }

  return {
    data: enrichedFinances,
    summary: {
      totalTuition,
      totalDiscount,
      totalMustPay,
      totalPaid,
      totalRefund,
      totalDebt,
      totalSurplus,
      netBalance,
      status: summaryStatus,
      statusText: summaryStatusText,
      totalSemesters: enrichedFinances.length
    }
  };
}

module.exports = {
  SETTLE_TOLERANCE,
  roundMoney,
  formatDate,
  normalizeSchoolYear,
  isRefundReceipt,
  aggregateFinanceGroup,
  groupFinanceSources,
  buildFinanceTerms,
  sortTermsAsc,
  summarizeFinance
};
