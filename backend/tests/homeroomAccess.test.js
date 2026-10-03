// Chạy: cd backend && npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createLecturerAccess,
  isValidStudentCode,
  parsePositiveInt,
  resolveLecturerIdCb
} = require('../middleware/requireHomeroom');
const tuafQueries = require('../services/tuafQueries');
const financeReader = require('../services/financeReader');

const silentLog = { error: () => {}, warn: () => {}, log: () => {} };

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(b) { this.body = b; return this; }
  };
}

async function run(mw, req) {
  const res = fakeRes();
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

const lecturer = (extra = {}) => ({ id: 'u-1', username: 'gv01', role: 'lecturer', tuafStudentId: 77, save: async () => {}, ...extra });

function makeAccess({ homeroom = [], teaching = [], throwOn = null, idCbFromDb = null } = {}) {
  const calls = { isHomeroomOf: [], isTeachingClass: [] };
  const queries = {
    findLecturerId: async () => (idCbFromDb ? { ID_cb: idCbFromDb } : null),
    isHomeroomOf: async (pool, idCb, idLop) => {
      calls.isHomeroomOf.push([idCb, idLop]);
      if (throwOn === 'homeroom') throw new Error('SQL timeout');
      return homeroom.some(([cb, lop]) => cb === idCb && lop === idLop);
    },
    isTeachingClass: async (pool, idCb, idLopTc) => {
      calls.isTeachingClass.push([idCb, idLopTc]);
      if (throwOn === 'teaching') throw new Error('SQL timeout');
      return teaching.some(([cb, tc]) => cb === idCb && tc === idLopTc);
    }
  };
  const getPool = async () => {
    if (throwOn === 'pool') throw new Error('ECONNREFUSED');
    return { fake: true };
  };
  return { access: createLecturerAccess({ getPool, tuafQueries: queries, log: silentLog }), calls };
}

// ───────────── Kiểm tra đầu vào ─────────────

test('isValidStudentCode: chỉ nhận mã SV hợp lệ, chặn chuỗi tấn công', () => {
  assert.equal(isValidStudentCode('DTN2453110001'), true);
  assert.equal(isValidStudentCode('dtn24cn04004'), true);
  for (const bad of ["x' OR '1'='1", 'a;DROP TABLE x', '../etc', '', 'A'.repeat(31), 'mã sv', null, 123]) {
    assert.equal(isValidStudentCode(bad), false, String(bad));
  }
});

test('parsePositiveInt: chỉ số nguyên dương thuần', () => {
  assert.equal(parsePositiveInt('123'), 123);
  for (const bad of ['0', '-1', '1.5', '12abc', '1e3', '', undefined, '0123', '9999999999']) {
    assert.equal(parsePositiveInt(bad), null, String(bad));
  }
});

// ───────────── requireHomeroomOf ─────────────

test('requireHomeroomOf: GVCN hiện tại của lớp → cho qua, gắn req.homeroom', async () => {
  const { access } = makeAccess({ homeroom: [[77, 500]] });
  const req = { user: lecturer(), params: { idLop: '500' } };
  const { res, nextCalled } = await run(access.requireHomeroomOf, req);
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual({ idCb: req.homeroom.idCb, idLop: req.homeroom.idLop }, { idCb: 77, idLop: 500 });
});

test('requireHomeroomOf: GV không chủ nhiệm lớp đó → 403', async () => {
  const { access } = makeAccess({ homeroom: [[77, 500]] });
  const { res, nextCalled } = await run(access.requireHomeroomOf, { user: lecturer(), params: { idLop: '501' } });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('requireHomeroomOf: sinh viên (tuafStudentId là ID_sv) bị chặn trước khi tra cứu', async () => {
  const { access, calls } = makeAccess({ homeroom: [[77, 500]] });
  const student = { id: 's-1', username: 'dtn01', role: 'student', tuafStudentId: 77 };
  const { res, nextCalled } = await run(access.requireHomeroomOf, { user: student, params: { idLop: '500' } });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(calls.isHomeroomOf.length, 0);
});

test('requireHomeroomOf: admin của app cũng không xem được học phí SV', async () => {
  const { access } = makeAccess({ homeroom: [[77, 500]] });
  const { res } = await run(access.requireHomeroomOf, { user: lecturer({ role: 'admin' }), params: { idLop: '500' } });
  assert.equal(res.statusCode, 403);
});

test('requireHomeroomOf: mã lớp sai định dạng → 400, không truy vấn', async () => {
  const { access, calls } = makeAccess({ homeroom: [[77, 500]] });
  const { res, nextCalled } = await run(access.requireHomeroomOf, { user: lecturer(), params: { idLop: '500 OR 1=1' } });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(calls.isHomeroomOf.length, 0);
});

test('requireHomeroomOf: lỗi kết nối / truy vấn → 503 (fail closed), không lộ chi tiết lỗi', async () => {
  for (const throwOn of ['pool', 'homeroom']) {
    const { access } = makeAccess({ homeroom: [[77, 500]], throwOn });
    const { res, nextCalled } = await run(access.requireHomeroomOf, { user: lecturer(), params: { idLop: '500' } });
    assert.equal(nextCalled, false, throwOn);
    assert.equal(res.statusCode, 503, throwOn);
    assert.equal(JSON.stringify(res.body).includes('SQL timeout') || JSON.stringify(res.body).includes('ECONNREFUSED'), false);
  }
});

test('requireHomeroomOf: GV chưa liên kết hồ sơ cán bộ → 403', async () => {
  const { access } = makeAccess({ homeroom: [[77, 500]], idCbFromDb: null });
  const { res } = await run(access.requireHomeroomOf, { user: lecturer({ tuafStudentId: null }), params: { idLop: '500' } });
  assert.equal(res.statusCode, 403);
});

test('resolveLecturerIdCb: tra ID_cb theo username khi chưa có và lưu lại', async () => {
  let saved = false;
  const user = lecturer({ tuafStudentId: null, save: async () => { saved = true; } });
  const id = await resolveLecturerIdCb({}, user, async () => ({ ID_cb: 88 }));
  assert.equal(id, 88);
  assert.equal(user.tuafStudentId, 88);
  assert.equal(saved, true);
});

// ───────────── requireTeachingClass ─────────────

test('requireTeachingClass: GV được phân công dạy → qua; không được phân công → 403; SV → 403; admin → qua', async () => {
  const { access, calls } = makeAccess({ teaching: [[77, 9001]] });
  assert.equal((await run(access.requireTeachingClass, { user: lecturer(), params: { idLopTc: '9001' } })).nextCalled, true);
  assert.equal((await run(access.requireTeachingClass, { user: lecturer(), params: { idLopTc: '9002' } })).res.statusCode, 403);
  assert.equal((await run(access.requireTeachingClass, { user: { role: 'student', tuafStudentId: 77 }, params: { idLopTc: '9001' } })).res.statusCode, 403);
  const before = calls.isTeachingClass.length;
  assert.equal((await run(access.requireTeachingClass, { user: { role: 'admin' }, params: { idLopTc: '9002' } })).nextCalled, true);
  assert.equal(calls.isTeachingClass.length, before, 'admin không cần tra phân công');
});

test('requireTeachingClass: mã lớp sai → 400; lỗi tra cứu → 503', async () => {
  const { access } = makeAccess({ teaching: [[77, 9001]], throwOn: 'teaching' });
  assert.equal((await run(access.requireTeachingClass, { user: lecturer(), params: { idLopTc: 'abc' } })).res.statusCode, 400);
  assert.equal((await run(access.requireTeachingClass, { user: lecturer(), params: { idLopTc: '9001' } })).res.statusCode, 503);
});

test('requireLecturer: chỉ vai trò lecturer', async () => {
  const { access } = makeAccess();
  assert.equal((await run(access.requireLecturer, { user: lecturer() })).nextCalled, true);
  assert.equal((await run(access.requireLecturer, { user: { role: 'student' } })).res.statusCode, 403);
  assert.equal((await run(access.requireLecturer, {})).res.statusCode, 403);
});

// ───────────── Số liệu GVCN khớp với màn hình sinh viên ─────────────

const SV_A = 'AAAAAAAA-1111-2222-3333-444444444444';
const SV_B = 'BBBBBBBB-1111-2222-3333-444444444444';
const fixtures = {
  [SV_A.toLowerCase()]: {
    namViet: [
      { Hoc_ky: 1, nam_hoc: '2024-2025', So_tien_phai_nop: 6000000, So_tien_mien_giam: 0, So_tien_da_nop: 4000000, So_tien_tra_lai: 0, Thieu_thua: 2000000 },
      { Hoc_ky: 2, nam_hoc: '2024-2025', So_tien_phai_nop: 6000000, So_tien_mien_giam: 0, So_tien_da_nop: 6000000.4, So_tien_tra_lai: 0, Thieu_thua: -0.4 }
    ],
    receipts: [{ Hoc_ky: 1, Nam_hoc: '2024-2025', Ngay_thu: '2024-09-15', So_tien: 4000000, Thu_chi: true, So_phieu: 'P1' }],
    exemptions: [],
    summaryTerms: []
  },
  [SV_B.toLowerCase()]: {
    namViet: [],
    receipts: [{ Hoc_ky: 1, Nam_hoc: '0-1', Ngay_thu: '2025-10-01', So_tien: 3000000, Thu_chi: true, So_phieu: 'P2' }],
    exemptions: [],
    summaryTerms: [{ Hoc_ky: 1, Nam_hoc: '2025-2026', So_tien_phai_nop: 2500000, So_tien_mien_giam: 0, So_tien_da_nop: 0, So_tien_tra_lai: 0, Thieu_thua: 2500000 }]
  }
};

function stubQueries(t, { namVietThrows = false } = {}) {
  const withId = (field, id) => fixtures[id.toLowerCase()][field].map(r => ({ ...r, ID_sv: id }));
  const stubs = {
    getHomeroomStudentsBasic: async () => ({
      className: 'K56 CNTT', classCode: 'K56CNTT',
      students: [
        { ID_sv: SV_A, studentCode: 'DTN001 ', studentName: 'Nguyễn A', statusId: 0, statusName: 'Đang học' },
        { ID_sv: SV_B, studentCode: 'DTN002', studentName: 'Trần B', statusId: 0, statusName: 'Đang học' }
      ]
    }),
    // Truy vấn theo lớp trả GUID chữ thường, danh sách SV trả GUID chữ hoa → phải vẫn ghép đúng SV
    getClassReceipts: async () => [...withId('receipts', SV_A.toLowerCase()), ...withId('receipts', SV_B.toLowerCase())],
    getClassExemptions: async () => [],
    getClassFinanceSummaryByTerm: async () => [...withId('summaryTerms', SV_A.toLowerCase()), ...withId('summaryTerms', SV_B.toLowerCase())],
    getStudentNamVietFinance: async (pool, id) => {
      if (namVietThrows) throw new Error('SP lỗi');
      return fixtures[String(id).toLowerCase()].namViet;
    },
    getAllStudentFinance: async (pool, id) => fixtures[String(id).toLowerCase()].receipts,
    getStudentExemptions: async () => [],
    getStudentFinanceSummaryByTerm: async (pool, id) => fixtures[String(id).toLowerCase()].summaryTerms
  };
  for (const [name, fn] of Object.entries(stubs)) t.mock.method(tuafQueries, name, fn);
}

test('GVCN: thẻ danh sách lớp khớp đúng tổng toàn khóa ở màn hình sinh viên', async (t) => {
  stubQueries(t);
  const cls = await financeReader.getClassFinanceView({}, 500);
  assert.equal(cls.students.length, 2);
  assert.equal('ID_sv' in cls.students[0], false, 'không lộ ID_sv nội bộ');

  for (const [i, id] of [SV_A, SV_B].entries()) {
    const own = await financeReader.getStudentFinanceView({}, id);
    const card = cls.students[i];
    assert.equal(card.mustPay, own.summary.totalMustPay);
    assert.equal(card.paid, own.summary.totalPaid);
    assert.equal(card.debtAmount, own.summary.totalDebt);
    assert.equal(card.surplusAmount, own.summary.totalSurplus);
    assert.equal(card.rawBalance, own.summary.netBalance);
  }
  // SV A nợ 2.000.000; SV B nộp thừa 500.000 (biên lai mới hơn bảng tổng hợp)
  assert.equal(cls.students[0].status, 'debt');
  assert.equal(cls.students[0].debtAmount, 2000000);
  assert.equal(cls.students[0].studentCode, 'DTN001');
  assert.equal(cls.students[1].status, 'surplus');
  assert.equal(cls.students[1].surplusAmount, 500000);
  assert.deepEqual(
    { debt: cls.summary.debtCount, surplus: cls.summary.surplusCount, settled: cls.summary.settledCount, debtTotal: cls.summary.totalDebtAmount },
    { debt: 1, surplus: 1, settled: 0, debtTotal: 2000000 }
  );
});

test('GVCN: thủ tục Nam Việt lỗi → báo lỗi, không trả số liệu sai', async (t) => {
  stubQueries(t, { namVietThrows: true });
  await assert.rejects(() => financeReader.getClassFinanceView({}, 500));
  await assert.rejects(() => financeReader.getStudentFinanceView({}, SV_A));
});

// ───────────── Bản lưu tạm học phí của sinh viên ─────────────

function fakeFinanceModel(initial = []) {
  const log = [];
  let rows = initial.map(r => ({ ...r }));
  const delay = () => new Promise(r => setTimeout(r, 5));
  return {
    log,
    get rows() { return rows; },
    async findAll() { log.push('find'); await delay(); return rows.map(r => ({ ...r })); },
    async destroy() { log.push('destroy'); await delay(); rows = []; },
    async bulkCreate(list) { log.push('create'); await delay(); rows = list.map(r => ({ ...r })); }
  };
}

const cacheTerm = (paid) => ({ semester: 'HocKy1', schoolYear: '2025-2026', totalTuition: 5000000, mustPayTuition: 5000000, discountTuition: 0, paidTuition: paid, refundTuition: 0, debtTuition: 5000000 - paid, invoiceDetails: [] });

test('replaceFinanceCache: ghi tuần tự theo user, không xen kẽ; bỏ qua khi không đổi', async () => {
  const model = fakeFinanceModel();
  const [a, b] = await Promise.all([
    financeReader.replaceFinanceCache(model, 'u-1', [cacheTerm(1000000)]),
    financeReader.replaceFinanceCache(model, 'u-1', [cacheTerm(2000000)])
  ]);
  assert.deepEqual([a, b], [true, true]);
  assert.deepEqual(model.log, ['find', 'destroy', 'create', 'find', 'destroy', 'create']);
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].paidTuition, 2000000);

  const same = await financeReader.replaceFinanceCache(model, 'u-1', [cacheTerm(2000000)]);
  assert.equal(same, false);
  assert.deepEqual(model.log.slice(6), ['find']);
});

test('replaceFinanceCache: lần ghi lỗi không chặn các lần ghi sau', async () => {
  const model = fakeFinanceModel();
  const broken = { ...model, findAll: async () => { throw new Error('db down'); } };
  await assert.rejects(() => financeReader.replaceFinanceCache(broken, 'u-2', [cacheTerm(1)]));
  assert.equal(await financeReader.replaceFinanceCache(model, 'u-2', [cacheTerm(1)]), true);
});

test('loadOwnFinance: lỗi SQL Server → dùng bản lưu tạm; không phải SV → luôn dùng bản lưu tạm', async () => {
  const cached = [cacheTerm(3000000)];
  const Finance = { findAll: async () => cached };
  const failing = await financeReader.loadOwnFinance(
    { id: 'u-3', role: 'student', tuafStudentId: SV_A },
    { Finance, getPool: async () => { throw new Error('ECONNREFUSED'); }, log: silentLog }
  );
  assert.equal(failing.source, 'cache');
  assert.equal(failing.rows, cached);

  const lect = await financeReader.loadOwnFinance({ id: 'u-4', role: 'lecturer' }, { Finance, getPool: async () => ({}), log: silentLog });
  assert.equal(lect.source, 'cache');
});

test('loadOwnFinance: SV đọc trực tiếp → cùng số liệu với GVCN xem chi tiết', async (t) => {
  stubQueries(t);
  const model = fakeFinanceModel();
  const own = await financeReader.loadOwnFinance(
    { id: 'u-5', role: 'student', tuafStudentId: SV_A },
    { Finance: model, getPool: async () => ({}), log: silentLog }
  );
  assert.equal(own.source, 'live');
  const gvcn = await financeReader.getStudentFinanceView({}, SV_A);
  const { summarizeFinance } = require('../services/financeCalculator');
  assert.deepEqual(summarizeFinance(own.rows), gvcn);
});
