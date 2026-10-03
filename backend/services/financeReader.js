/**
 * financeReader — đọc dữ liệu học phí GỐC trực tiếp từ SQL Server TUAF (chỉ đọc) và
 * tính bằng financeCalculator. Dùng chung cho sinh viên và GVCN để số liệu luôn khớp.
 */
const tuafQueries = require('./tuafQueries');
const calc = require('./financeCalculator');

// Thủ tục Nam Việt chỉ nhận 1 ID_sv → chạy song song có giới hạn (pool SQL Server max = 5).
const SP_CONCURRENCY = 4;

const idKey = (id) => String(id || '').toLowerCase();

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Dữ liệu gốc của MỘT sinh viên. strict: lỗi truy vấn → ném lỗi (không tính sai âm thầm). */
async function readStudentFinanceRaw(pool, idSv) {
  const [namViet, receipts, exemptions, summaryTerms] = await Promise.all([
    tuafQueries.getStudentNamVietFinance(pool, idSv, { strict: true }),
    tuafQueries.getAllStudentFinance(pool, idSv),
    tuafQueries.getStudentExemptions(pool, idSv, { strict: true }),
    tuafQueries.getStudentFinanceSummaryByTerm(pool, idSv, { strict: true })
  ]);
  return { namViet, receipts, exemptions, summaryTerms };
}

/** Học phí đầy đủ của MỘT sinh viên: { data: các kỳ, summary: toàn khóa } — cùng dạng /api/finance/all. */
async function getStudentFinanceView(pool, idSv) {
  const terms = calc.buildFinanceTerms(await readStudentFinanceRaw(pool, idSv));
  return calc.summarizeFinance(terms);
}

/** Dữ liệu gốc của cả lớp, tách theo sinh viên: Map<idSv(lowercase), raw>. */
async function readClassFinanceRaw(pool, idLop, studentIds) {
  const ids = [...new Set(studentIds.map(idKey))].filter(Boolean);
  const byStudent = new Map(ids.map(id => [id, { namViet: [], receipts: [], exemptions: [], summaryTerms: [] }]));
  if (ids.length === 0) return byStudent;

  const [receipts, exemptions, summaryTerms] = await Promise.all([
    tuafQueries.getClassReceipts(pool, idLop),
    tuafQueries.getClassExemptions(pool, idLop),
    tuafQueries.getClassFinanceSummaryByTerm(pool, idLop)
  ]);
  const push = (rows, field) => {
    for (const r of rows || []) {
      const bucket = byStudent.get(idKey(r.ID_sv));
      if (bucket) bucket[field].push(r);
    }
  };
  push(receipts, 'receipts');
  push(exemptions, 'exemptions');
  push(summaryTerms, 'summaryTerms');

  const namVietList = await mapWithConcurrency(ids, SP_CONCURRENCY,
    (id) => tuafQueries.getStudentNamVietFinance(pool, id, { strict: true }));
  ids.forEach((id, i) => { byStudent.get(id).namViet = namVietList[i] || []; });
  return byStudent;
}

/** Tổng toàn khóa của một SV → các trường hiển thị trên thẻ danh sách GVCN (giữ nguyên tên trường cũ). */
function toHomeroomCard(student, className, summary) {
  const status = summary.status === 'debt' ? 'debt' : (summary.status === 'surplus' ? 'surplus' : 'settled');
  return {
    studentCode: (student.studentCode || '').trim(),
    studentName: (student.studentName || '').trim(),
    studentClass: className,
    statusId: student.statusId,
    statusName: student.statusName,
    phone: student.phone || '',
    email: student.email || '',
    mustPay: summary.totalMustPay,
    paid: summary.totalPaid,
    exemption: summary.totalDiscount,
    rawBalance: summary.netBalance,
    balance: summary.totalSurplus > 0 ? summary.totalSurplus : summary.totalDebt,
    debtAmount: summary.totalDebt,
    surplusAmount: summary.totalSurplus,
    status,
    statusText: summary.statusText,
    isTermData: true
  };
}

/** Học phí cả lớp chủ nhiệm (dạng phản hồi cũ của /homeroom/:idLop/tuition). */
async function getClassFinanceView(pool, idLop) {
  const { className, classCode, students } = await tuafQueries.getHomeroomStudentsBasic(pool, idLop);
  const raw = await readClassFinanceRaw(pool, idLop, students.map(s => s.ID_sv));

  const summary = {
    totalStudents: students.length,
    debtCount: 0,
    settledCount: 0,
    surplusCount: 0,
    totalDebtAmount: 0,
    totalPaidAmount: 0,
    isTermData: true
  };

  const cards = students.map(s => {
    const { summary: fin } = calc.summarizeFinance(calc.buildFinanceTerms(raw.get(idKey(s.ID_sv))));
    const card = toHomeroomCard(s, className, fin);
    if (card.status === 'debt') {
      summary.debtCount++;
      summary.totalDebtAmount += card.debtAmount;
    } else if (card.status === 'surplus') {
      summary.surplusCount++;
    } else {
      summary.settledCount++;
    }
    summary.totalPaidAmount += card.paid;
    return card;
  });

  return { className, classCode, summary, students: cards, generatedAt: new Date().toISOString() };
}

// ───────────── Sinh viên tự xem: đọc trực tiếp, bản lưu tạm PostgreSQL chỉ để dự phòng ─────────────

// Ghi lại bản lưu tạm theo từng user một cách tuần tự (tránh 2 request cùng xóa/ghi gây trùng bản ghi).
const cacheLocks = new Map();

function sameTerms(cachedRows, terms) {
  if (cachedRows.length !== terms.length) return false;
  const pick = (t) => JSON.stringify([t.semester, t.schoolYear, t.totalTuition, t.mustPayTuition, t.discountTuition,
    t.paidTuition, t.refundTuition, t.debtTuition, t.invoiceDetails || []]);
  const a = calc.sortTermsAsc(cachedRows.map(r => (typeof r.toJSON === 'function' ? r.toJSON() : r))).map(pick);
  const b = calc.sortTermsAsc(terms).map(pick);
  return a.every((v, i) => v === b[i]);
}

/**
 * Thay toàn bộ bản lưu tạm học phí của user bằng terms (tuần tự theo user, bỏ qua nếu không đổi).
 * TODO(security): khóa này chỉ có hiệu lực trong 1 tiến trình; nếu chạy nhiều instance cần khóa ở DB.
 */
function replaceFinanceCache(FinanceModel, userId, terms) {
  const prev = cacheLocks.get(userId) || Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    const existing = await FinanceModel.findAll({ where: { userId } });
    if (sameTerms(existing, terms)) return false;
    await FinanceModel.destroy({ where: { userId } });
    if (terms.length > 0) {
      await FinanceModel.bulkCreate(terms.map(t => ({ ...t, userId })));
    }
    return true;
  });
  const tracked = run.catch(() => {}).finally(() => {
    if (cacheLocks.get(userId) === tracked) cacheLocks.delete(userId);
  });
  cacheLocks.set(userId, tracked);
  return run;
}

/**
 * Học phí của chính người đang đăng nhập.
 * - Sinh viên: đọc trực tiếp SQL Server → tính → cập nhật bản lưu tạm (nền).
 * - Lỗi kết nối / không phải SV: dùng bản lưu tạm PostgreSQL.
 * @returns {Promise<{rows: object[], source: 'live'|'cache', updatedAt: string|null}>}
 */
async function loadOwnFinance(user, deps = {}) {
  const Finance = deps.Finance || require('../models/Finance');
  const getPool = deps.getPool || require('./namvietConnector').getPool;
  const log = deps.log || console;

  if (user.role === 'student') {
    try {
      const pool = await getPool();
      let idSv = user.tuafStudentId;
      if (!idSv) {
        const sv = await tuafQueries.findStudentId(pool, user.username);
        if (!sv) throw new Error('Không tìm thấy hồ sơ sinh viên trên hệ thống đào tạo');
        idSv = sv.ID_sv;
        user.tuafStudentId = idSv;
        await user.save().catch(() => {});
      }
      const rows = calc.buildFinanceTerms(await readStudentFinanceRaw(pool, idSv));
      replaceFinanceCache(Finance, user.id, rows)
        .catch(err => log.warn('⚠️ [Finance] Không cập nhật được bản lưu tạm:', err.message));
      return { rows, source: 'live', updatedAt: new Date().toISOString() };
    } catch (err) {
      log.warn('⚠️ [Finance] Đọc trực tiếp SQL Server lỗi, dùng bản lưu tạm:', err.message);
    }
  }

  const rows = await Finance.findAll({
    where: { userId: user.id },
    order: [['schoolYear', 'ASC'], ['semester', 'ASC']]
  });
  return { rows, source: 'cache', updatedAt: user.lastSyncedAt ? new Date(user.lastSyncedAt).toISOString() : null };
}

module.exports = {
  SP_CONCURRENCY,
  mapWithConcurrency,
  readStudentFinanceRaw,
  getStudentFinanceView,
  readClassFinanceRaw,
  toHomeroomCard,
  getClassFinanceView,
  replaceFinanceCache,
  loadOwnFinance
};
