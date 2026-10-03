// Chạy: cd backend && npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../services/financeCalculator');

const nv = (o) => ({ Hoc_ky: 1, nam_hoc: '2024-2025', So_tien_phai_nop: 0, So_tien_mien_giam: 0, So_tien_da_nop: 0, So_tien_tra_lai: 0, Thieu_thua: 0, ...o });
const term = (o) => ({ semester: 'HocKy1', schoolYear: '2024-2025', totalTuition: 0, mustPayTuition: 0, discountTuition: 0, paidTuition: 0, refundTuition: 0, debtTuition: 0, invoiceDetails: [], ...o });

// ───────────── buildFinanceTerms: dữ liệu gốc → từng kỳ ─────────────

test('buildFinanceTerms: ưu tiên số liệu thủ tục Nam Việt', () => {
  const [t] = calc.buildFinanceTerms({
    namViet: [nv({ So_tien_phai_nop: 10000000, So_tien_mien_giam: 2000000, So_tien_da_nop: 7000000, Thieu_thua: 1000000 })],
    receipts: [{ Hoc_ky: 1, Nam_hoc: '2024-2025', Ngay_thu: '2024-09-10', So_tien: 7000000, Thu_chi: true, So_phieu: 'BL01', Lan_thu: 1 }]
  });
  assert.equal(t.semester, 'HocKy1');
  assert.equal(t.schoolYear, '2024-2025');
  assert.equal(t.totalTuition, 10000000);
  assert.equal(t.discountTuition, 2000000);
  assert.equal(t.mustPayTuition, 8000000);
  assert.equal(t.paidTuition, 7000000);
  assert.equal(t.debtTuition, 1000000);
  assert.deepEqual(t.invoiceDetails, [{ invoiceNo: 'BL01', date: '10/09/2024', amount: 7000000, round: 1, description: '', isRefund: false }]);
});

test('buildFinanceTerms: chỉ có biên lai → tự tính, sửa năm học 0-1 theo ngày thu, nhận biên lai hoàn tiền', () => {
  const terms = calc.buildFinanceTerms({
    receipts: [
      { Hoc_ky: 2, Nam_hoc: '0-1', Ngay_thu: '2025-03-10', So_tien: 5000000, Thu_chi: true },
      { Hoc_ky: 2, Nam_hoc: '0-1', Ngay_thu: '2025-04-01', So_tien: -500000, Thu_chi: false, Noi_dung: 'Hoàn trả' }
    ]
  });
  assert.equal(terms.length, 1);
  const t = terms[0];
  assert.equal(t.schoolYear, '2024-2025');
  assert.equal(t.paidTuition, 5000000);
  assert.equal(t.refundTuition, 500000);
  assert.equal(t.totalTuition, 5000000);
  assert.equal(t.debtTuition, 500000);
  assert.equal(t.invoiceDetails[1].isRefund, true);
  assert.equal(t.invoiceDetails[1].amount, 500000);
});

test('buildFinanceTerms: bảng tổng hợp theo kỳ được bù bằng biên lai mới hơn', () => {
  const [t] = calc.buildFinanceTerms({
    summaryTerms: [{ Hoc_ky: 1, Nam_hoc: '2025-2026', So_tien_phai_nop: 6000000, So_tien_mien_giam: 0, So_tien_da_nop: 2000000, So_tien_tra_lai: 0, Thieu_thua: 4000000 }],
    receipts: [
      { Hoc_ky: 1, Nam_hoc: '2025-2026', Ngay_thu: '2025-09-01', So_tien: 2000000, Thu_chi: true },
      { Hoc_ky: 1, Nam_hoc: '2025-2026', Ngay_thu: '2025-10-05', So_tien: 4000000, Thu_chi: true }
    ]
  });
  assert.equal(t.paidTuition, 6000000);
  assert.equal(t.debtTuition, 0);
});

test('buildFinanceTerms: miễn giảm 100% không phát sinh nợ', () => {
  const [t] = calc.buildFinanceTerms({
    exemptions: [{ Hoc_ky: 1, Nam_hoc: '2025-2026', Phan_tram: 100, So_tien_MG: 3000000 }]
  });
  assert.equal(t.debtTuition <= 0, true);
  assert.equal(t.mustPayTuition, 0);
});

test('buildFinanceTerms: làm tròn tiền như cột INTEGER và xếp kỳ tăng dần', () => {
  const terms = calc.buildFinanceTerms({
    namViet: [
      nv({ Hoc_ky: 2, nam_hoc: '2025-2026', So_tien_phai_nop: 100.5, Thieu_thua: 100.5 }),
      nv({ Hoc_ky: 1, nam_hoc: '2025-2026', So_tien_phai_nop: 10, So_tien_da_nop: 10.5, Thieu_thua: -0.5 }),
      nv({ Hoc_ky: 2, nam_hoc: '2024-2025', So_tien_phai_nop: 1 })
    ]
  });
  assert.deepEqual(terms.map(t => `${t.semester}|${t.schoolYear}`), ['HocKy2|2024-2025', 'HocKy1|2025-2026', 'HocKy2|2025-2026']);
  assert.equal(terms[2].debtTuition, 101);
  assert.equal(terms[1].debtTuition, -1);
  assert.equal(terms[1].paidTuition, 11);
});

test('roundMoney: nửa đơn vị làm tròn ra xa số 0', () => {
  assert.equal(calc.roundMoney(2.5), 3);
  assert.equal(calc.roundMoney(-2.5), -3);
  assert.equal(calc.roundMoney(null), 0);
});

// ───────────── summarizeFinance: tổng toàn khóa + cấn trừ + dung sai ─────────────

test('summarizeFinance: lệch dưới 1.000đ coi là đã nộp đủ (cả nợ lẫn thừa), kỳ lẻ hiển thị "đã cấn trừ"', () => {
  for (const diff of [999, -999, 0, 1, -1]) {
    const { data, summary } = calc.summarizeFinance([term({ totalTuition: 1000000, mustPayTuition: 1000000, paidTuition: 1000000 - diff, debtTuition: diff })]);
    assert.equal(summary.totalDebt, 0, `diff=${diff}`);
    assert.equal(summary.totalSurplus, 0, `diff=${diff}`);
    assert.equal(summary.status, 'completed', `diff=${diff}`);
    assert.equal(summary.netBalance, diff, 'giữ số thô để đối chiếu');
    assert.equal(data[0].rawDebtTuition, diff);
    if (diff > 0) assert.equal(data[0].status, 'offset');
  }
});

test('summarizeFinance: từ 1.000đ trở lên tính là nợ / thừa', () => {
  const debt = calc.summarizeFinance([term({ mustPayTuition: 2000000, totalTuition: 2000000, paidTuition: 1999000, debtTuition: 1000 })]);
  assert.equal(debt.summary.totalDebt, 1000);
  assert.equal(debt.summary.status, 'debt');
  assert.equal(debt.data[0].status, 'debt');
  assert.equal(debt.data[0].debtTuition, 1000);

  const surplus = calc.summarizeFinance([term({ mustPayTuition: 2000000, totalTuition: 2000000, paidTuition: 2001000, debtTuition: -1000 })]);
  assert.equal(surplus.summary.totalSurplus, 1000);
  assert.equal(surplus.summary.status, 'surplus');
  assert.equal(surplus.data[0].status, 'surplus');
});

test('summarizeFinance: cấn trừ liên kỳ — nợ kỳ trước bù bằng tiền thừa kỳ sau', () => {
  const { data, summary } = calc.summarizeFinance([
    term({ semester: 'HocKy1', totalTuition: 5000000, mustPayTuition: 5000000, paidTuition: 3000000, debtTuition: 2000000 }),
    term({ semester: 'HocKy2', totalTuition: 5000000, mustPayTuition: 5000000, paidTuition: 7000000, debtTuition: -2000000 })
  ]);
  assert.equal(summary.totalDebt, 0);
  assert.equal(summary.totalMustPay, 10000000);
  assert.equal(summary.totalPaid, 10000000);
  assert.equal(data[0].status, 'offset');
  assert.equal(data[0].badge, '✓ Đã cấn trừ đủ');
  assert.equal(data[0].debtTuition, 0);
  assert.equal(data[1].status, 'surplus');
  assert.equal(data[1].surplusTuition, 2000000);
});

test('summarizeFinance: nhận bản ghi Sequelize (toJSON) như object thường', () => {
  const plain = term({ totalTuition: 4000000, mustPayTuition: 0, debtTuition: 0 });
  const a = calc.summarizeFinance([{ toJSON: () => ({ ...plain }) }]);
  const b = calc.summarizeFinance([plain]);
  assert.deepEqual(a, b);
  assert.equal(a.data[0].discountTuition, 4000000);
  assert.equal(a.data[0].discountPercent, 100);
});
