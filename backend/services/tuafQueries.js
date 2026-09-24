/**
 * TUAF SQL Queries — READ-ONLY
 * 
 * ⚠️ MODULE NÀY CHỈ CHỨA CÂU LỆNH SELECT
 * ⚠️ TUYỆT ĐỐI KHÔNG VIẾT INSERT, UPDATE, DELETE, DROP, ALTER, EXEC
 * ⚠️ MỌI QUERY ĐỀU QUA safeQuery() VỚI PARAMETERIZED INPUTS
 */

const { sql } = require('./namvietConnector');

// ═══════════════════════════════════════
// SECURITY GUARD — Chặn mọi write operation
// ═══════════════════════════════════════

const FORBIDDEN_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|EXEC|EXECUTE|TRUNCATE|CREATE|MERGE)\b/i;

/**
 * Kiểm tra query chỉ chứa SELECT — chặn mọi thao tác ghi
 * @param {string} queryText 
 */
function assertReadOnly(queryText) {
  if (FORBIDDEN_KEYWORDS.test(queryText)) {
    const violation = queryText.match(FORBIDDEN_KEYWORDS)[0];
    console.error(`🚫 [SECURITY] Write operation BLOCKED: "${violation}" detected in query`);
    throw new Error(`SECURITY VIOLATION: Write operation "${violation}" blocked on TUAF SQL Server!`);
  }
}

/**
 * Thực thi query an toàn với parameterized inputs + audit logging
 * @param {sql.ConnectionPool} pool 
 * @param {string} queryText - SQL SELECT query
 * @param {Array} inputs - [{ name, type, value }]
 * @param {Object} context - { username } cho audit log
 * @returns {Promise<sql.IResult>}
 */
async function safeQuery(pool, queryText, inputs = [], context = {}) {
  assertReadOnly(queryText);

  const startTime = Date.now();
  const request = pool.request();

  for (const { name, type, value } of inputs) {
    request.input(name, type, value);
  }

  try {
    const result = await request.query(queryText);
    const duration = Date.now() - startTime;

    // Audit log (không log giá trị params — bảo mật)
    if (duration > 5000) {
      console.warn(`⚠️ [TUAF Query] Slow query (${duration}ms): ${queryText.substring(0, 80)}...`);
    }

    return result;
  } catch (err) {
    console.error(`❌ [TUAF Query] Error: ${err.message} | Query: ${queryText.substring(0, 80)}`);
    throw err;
  }
}

// ═══════════════════════════════════════
// LOOKUP QUERIES — Tìm ID sinh viên / giảng viên
// ═══════════════════════════════════════

/**
 * Tìm ID_sv (UUID) từ mã sinh viên
 * @param {sql.ConnectionPool} pool
 * @param {string} maSv - Mã sinh viên (VD: "dtn24cn04004")
 * @returns {Object|null} { ID_sv, Ho_ten, Ma_lop, Email, EmailTruong }
 */
async function findStudentId(pool, maSv) {
  const result = await safeQuery(pool,
    `SELECT TOP 1 ID_sv, Ma_sv, Ho_ten, Ma_lop, Email, EmailTruong, Nam_nhap_hoc
     FROM STU_HoSoSinhVien
     WHERE UPPER(Ma_sv) = UPPER(@maSv)`,
    [{ name: 'maSv', type: sql.NVarChar(50), value: maSv }],
    { username: maSv }
  );
  return result.recordset[0] || null;
}

/**
 * Lấy thông tin chi tiết sinh viên
 */
async function getStudentInfo(pool, idSv) {
  const result = await safeQuery(pool,
    `SELECT ID_sv, Ma_sv, Ho_ten, Ma_lop, Email, EmailTruong, Nam_nhap_hoc,
            ID_gioi_tinh, Ngay_sinh, Dienthoai_canhan, ID_nganh_ts
     FROM STU_HoSoSinhVien 
     WHERE ID_sv = @idSv`,
    [{ name: 'idSv', type: sql.UniqueIdentifier, value: idSv }],
    { username: 'system' }
  );
  return result.recordset[0] || null;
}

/**
 * Tìm ID_cb (UUID) từ mã cán bộ/giảng viên
 */
async function findLecturerId(pool, maCb) {
  const result = await safeQuery(pool,
    `SELECT TOP 1 ID_cb, Ma_cb, Ho_ten
     FROM HR_LyLich
     WHERE Ma_cb = @maCb`,
    [{ name: 'maCb', type: sql.NVarChar(50), value: maCb }],
    { username: maCb }
  );
  return result.recordset[0] || null;
}

// ═══════════════════════════════════════
// TERM QUERIES — Đợt đăng ký / kỳ học
// ═══════════════════════════════════════

/**
 * Lấy kỳ học hiện tại đang diễn ra (chính quy, loại 1)
 */
async function getCurrentTerm(pool) {
  const result = await safeQuery(pool,
    `SELECT TOP 1 Ky_dang_ky, Hoc_ky, Nam_hoc, Tu_ngay, Den_ngay, Mo_ta_chi_tiet
     FROM PLAN_HocKyDangKy_TC
     WHERE Tu_ngay <= GETDATE() AND Den_ngay >= GETDATE()
     ORDER BY Ky_dang_ky DESC`,
    [],
    { username: 'system' }
  );

  if (result.recordset.length === 0) {
    // Fallback: lấy kỳ gần nhất đã qua
    const fallback = await safeQuery(pool,
      `SELECT TOP 1 Ky_dang_ky, Hoc_ky, Nam_hoc, Tu_ngay, Den_ngay, Mo_ta_chi_tiet
       FROM PLAN_HocKyDangKy_TC
       WHERE Den_ngay <= GETDATE()
       ORDER BY Ky_dang_ky DESC`,
      [],
      { username: 'system' }
    );
    return fallback.recordset[0] || null;
  }

  return result.recordset[0];
}

// ═══════════════════════════════════════
// PER-STUDENT QUERIES — Dùng khi login (1 SV)
// Lưu ý: TKB filter qua Ky_dang_ky, không phải Hoc_ky/Nam_hoc trực tiếp
// ═══════════════════════════════════════

/**
 * Tìm Ky_dang_ky từ Hoc_ky + Nam_hoc
 * Dùng để bridge giữa app format và DB format
 */
async function findKyDangKy(pool, hocKy, namHoc) {
  const result = await safeQuery(pool,
    `SELECT TOP 1 Ky_dang_ky FROM PLAN_HocKyDangKy_TC
     WHERE Hoc_ky = @hocKy AND Nam_hoc = @namHoc
     ORDER BY Ky_dang_ky DESC`,
    [
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: namHoc }
    ],
    { username: 'system' }
  );
  return result.recordset[0]?.Ky_dang_ky || null;
}

/**
 * Trợ giúp tạo biểu thức lọc Hệ Đào Tạo cho SQL Server
 * @param {string} columnName Tên cột chứa mô tả (Mo_ta_chi_tiet hoặc dt.Mo_ta)
 * @param {string} heDaoTao Mã hệ đào tạo (DHCQ, VLVH, DTTX, SDH, CTTT, ALL)
 */
function getTrainingSystemFilter(columnName, heDaoTao = 'DHCQ') {
  const code = String(heDaoTao || 'DHCQ').toUpperCase();
  if (code === 'ALL') return '1=1';
  if (code === 'VLVH') return `(${columnName} LIKE '%VLVH%')`;
  if (code === 'DTTX') return `(${columnName} LIKE '%DTTX%' OR ${columnName} LIKE N'%ĐTTX%')`;
  if (code === 'SDH') return `(${columnName} LIKE N'%SĐH%' OR ${columnName} LIKE '%SDH%' OR ${columnName} LIKE N'%Thạc%' OR ${columnName} LIKE N'%Tiến%')`;
  if (code === 'CTTT') return `(${columnName} LIKE '%CTTT%')`;
  // DHCQ (Đại học chính quy - Mặc định)
  return `(${columnName} LIKE '%DHCQ%' OR ${columnName} LIKE N'%ĐHCQ%' OR (${columnName} NOT LIKE '%VLVH%' AND ${columnName} NOT LIKE N'%ĐTTX%' AND ${columnName} NOT LIKE '%DTTX%' AND ${columnName} NOT LIKE N'%SĐH%' AND ${columnName} NOT LIKE '%SDH%' AND ${columnName} NOT LIKE '%CTTT%'))`;
}

/**
 * Lấy tất cả Ky_dang_ky cho 1 kỳ (có thể nhiều đợt trong cùng 1 HK), hỗ trợ lọc theo hệ đào tạo
 */
async function findAllKyDangKy(pool, hocKy, namHoc, heDaoTao = 'DHCQ') {
  const cleanNamHoc = String(namHoc || '').replace('_', '-');
  const altNamHoc = cleanNamHoc.replace('-', '_');
  const systemFilter = getTrainingSystemFilter('Mo_ta_chi_tiet', heDaoTao);

  const result = await safeQuery(pool,
    `SELECT Ky_dang_ky FROM PLAN_HocKyDangKy_TC
     WHERE Hoc_ky = @hocKy AND (Nam_hoc = @namHoc OR Nam_hoc = @altNamHoc)
       AND ${systemFilter}
     ORDER BY Ky_dang_ky DESC`,
    [
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: cleanNamHoc },
      { name: 'altNamHoc', type: sql.NVarChar(50), value: altNamHoc }
    ],
    { username: 'system' }
  );
  return result.recordset.map(r => r.Ky_dang_ky);
}

/**
 * Lấy TKB của 1 SV trong 1 kỳ
 * Bảng đăng ký: STU_DanhSachLopTinChi
 * Bảng sự kiện: PLAN_SukiensTinChi_TC
 * Bảng phòng: PLAN_PhongHoc
 */
async function getStudentSchedule(pool, idSv, hocKy, namHoc, heDaoTao = 'DHCQ') {
  // Lấy tất cả Ky_dang_ky cho kỳ này theo hệ đào tạo
  const kyDangKys = await findAllKyDangKy(pool, hocKy, namHoc, heDaoTao);
  if (kyDangKys.length === 0) return [];

  // Build IN clause dynamically (safe — values are integers from DB)
  const kyList = kyDangKys.join(',');

  const result = await safeQuery(pool,
    `SELECT
      sk.Thu, sk.Tiet, sk.So_tiet, sk.Tu_ngay, sk.Den_ngay, sk.Tu_tuan, sk.Den_tuan,
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName,
      COALESCE(ll.Ho_ten, '') AS teacherName,
      mtc.So_tin_chi AS credits,
      COALESCE(
        CASE
          WHEN nha.Ten_nha IS NOT NULL AND nha.Ten_nha NOT LIKE '%Nông Lâm%'
            THEN ph.So_phong + ' (' + nha.Ten_nha + ')'
          ELSE ph.So_phong
        END,
        ph.So_phong,
        ''
      ) AS Phong,
      mtc.Ky_dang_ky,
      ltc.ID_lop_tc, ltc.Ten_lop_hp
    FROM STU_DanhSachLopTinChi ds
    JOIN PLAN_LopTinChi_TC ltc ON ds.ID_lop_tc = ltc.ID_lop_tc
    JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
    JOIN dmMonHoc mh ON mtc.ID_mon = mh.ID_mon
    LEFT JOIN PLAN_SukiensTinChi_TC sk ON sk.ID_lop_tc = ltc.ID_lop_tc
    LEFT JOIN dmPhongHoc ph ON sk.ID_phong = ph.ID_phong
    LEFT JOIN dmToaNha nha ON ph.ID_nha = nha.ID_nha
    LEFT JOIN HR_LyLich ll ON COALESCE(sk.ID_cb, ltc.ID_cb) = ll.ID_cb
    WHERE ds.ID_sv = @idSv
      AND ISNULL(ds.Huy_dang_ky, 0) = 0
      AND ISNULL(ltc.Huy_lop, 0) = 0
      AND mtc.Ky_dang_ky IN (${kyList})
    ORDER BY sk.Thu, sk.Tiet`,
    [
      { name: 'idSv', type: sql.NVarChar(50), value: String(idSv) }
    ],
    { username: 'student-schedule' }
  );
  return result.recordset;
}

/**
 * Lấy lịch thi của 1 SV trong 1 kỳ từ phân hệ Tổ chức thi
 * Nối TCT_DotThi_Phong, dmPhongHoc, HR_LyLich để lấy chính xác tên phòng, ca/tiết thi, SBD và giám thị
 */
async function getStudentExams(pool, idSv, hocKy, namHoc, heDaoTao = 'DHCQ') {
  const cleanNamHoc = String(namHoc || '').replace('_', '-');
  const altNamHoc = cleanNamHoc.replace('-', '_');
  const dotThiFilter = getTrainingSystemFilter('dt.Mo_ta', heDaoTao);

  // 1. Thử lấy từ MARK_TochucThiChiTiet_TC kết hợp MARK_ToChucThiPhong_TC & TCT_DotThi_Phong
  const result = await safeQuery(pool,
    `SELECT
      COALESCE(mtp.Ngay_thi, dtp.Ngay_thi, thi.Ngay_thi) AS Ngay_thi,
      0 AS Ca_thi,
      COALESCE(NULLIF(mtp.Gio_thi, ''), NULLIF(thi.Gio_thi, ''), '') AS Gio_thi,
      COALESCE(mtp.Tu_tiet, dtp.Tu_tiet) AS Tu_tiet,
      COALESCE(mtp.So_tiet, dtp.So_tiet, thi.So_tiet, 2) AS So_tiet,
      COALESCE(thi.Hinh_thuc_thi, 1) AS Hinh_thuc,
      COALESCE(thi.Lan_thi, 1) AS Lan_thi,
      COALESCE(thi.Dot_thi, 1) AS Dot_thi,
      CASE 
        WHEN dmph.So_phong IS NOT NULL AND mtp.Ten_phong IS NOT NULL AND dmph.So_phong <> mtp.Ten_phong 
        THEN dmph.So_phong + ' (' + mtp.Ten_phong + ')'
        ELSE COALESCE(dmph.So_phong, mtp.Ten_phong, dtp.Ten_phong, ph.So_phong, '')
      END AS Phong,
      mh.Ky_hieu AS courseCode,
      mh.Ten_mon AS courseName,
      ct.So_bao_danh,
      cb1.Ho_ten AS CbCoiThi1,
      cb2.Ho_ten AS CbCoiThi2
    FROM MARK_TochucThiChiTiet_TC ct
    JOIN MARK_TochucThi_TC thi ON ct.ID_thi = thi.ID_thi
    JOIN dmMonHoc mh ON thi.ID_mon = mh.ID_mon
    LEFT JOIN MARK_ToChucThiPhong_TC mtp ON ct.ID_phong_thi = mtp.ID_phong_thi
    LEFT JOIN TCT_DotThi_Phong dtp ON COALESCE(mtp.ID_dot_thi_phong, ct.ID_phong_thi) = dtp.ID_dot_thi_phong
    LEFT JOIN dmPhongHoc dmph ON COALESCE(mtp.ID_phong, dtp.ID_phong) = dmph.ID_phong
    LEFT JOIN PLAN_PhongHoc ph ON COALESCE(mtp.ID_phong, ct.ID_phong_thi) = ph.ID_phong
    LEFT JOIN HR_LyLich cb1 ON COALESCE(mtp.ID_cb_coi_thi1, dtp.ID_cb_coi_thi1) = cb1.ID_cb
    LEFT JOIN HR_LyLich cb2 ON COALESCE(mtp.ID_cb_coi_thi2, dtp.ID_cb_coi_thi2) = cb2.ID_cb
    WHERE ct.ID_sv = @idSv
      AND thi.Hoc_ky = @hocKy AND (thi.Nam_hoc = @namHoc OR thi.Nam_hoc = @altNamHoc)
    ORDER BY COALESCE(mtp.Ngay_thi, dtp.Ngay_thi, thi.Ngay_thi) ASC, COALESCE(mtp.Tu_tiet, dtp.Tu_tiet) ASC`,
    [
      { name: 'idSv', type: sql.UniqueIdentifier, value: idSv },
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: cleanNamHoc },
      { name: 'altNamHoc', type: sql.NVarChar(50), value: altNamHoc }
    ],
    { username: 'student-exams' }
  );

  if (result.recordset && result.recordset.length > 0) {
    return result.recordset;
  }

  // 2. Fallback: Nếu bảng MARK chưa có, lấy trực tiếp từ TCT_DotThi_ThiSinh (phần mềm xếp lịch thi)
  const fallback = await safeQuery(pool,
    `SELECT
      dtp.Ngay_thi,
      0 AS Ca_thi,
      COALESCE(NULLIF(mtp.Gio_thi, ''), '') AS Gio_thi,
      dtp.Tu_tiet,
      COALESCE(dtp.So_tiet, mtp.So_tiet, 2) AS So_tiet,
      COALESCE(dtm.ID_hinh_thuc, 1) AS Hinh_thuc,
      COALESCE(ts.Lan_thi_diem, dt.Lan_thi, 1) AS Lan_thi,
      1 AS Dot_thi,
      CASE 
        WHEN dmph.So_phong IS NOT NULL AND dtp.Ten_phong IS NOT NULL AND dmph.So_phong <> dtp.Ten_phong 
        THEN dmph.So_phong + ' (' + dtp.Ten_phong + ')'
        ELSE COALESCE(dmph.So_phong, dtp.Ten_phong, '')
      END AS Phong,
      mh.Ky_hieu AS courseCode,
      mh.Ten_mon AS courseName,
      ts.SBD AS So_bao_danh,
      cb1.Ho_ten AS CbCoiThi1,
      cb2.Ho_ten AS CbCoiThi2
    FROM TCT_DotThi_ThiSinh ts
    JOIN TCT_DotThi_Phong dtp ON ts.ID_dot_thi_phong = dtp.ID_dot_thi_phong
    JOIN TCT_DotThi dt ON dtp.ID_dot_thi = dt.ID_dot_thi
    LEFT JOIN MARK_ToChucThiPhong_TC mtp ON dtp.ID_dot_thi_phong = mtp.ID_dot_thi_phong
    LEFT JOIN TCT_DotThi_Mon dtm ON (
      dtm.ID_dot_thi = dt.ID_dot_thi
      AND (
        dtp.ID_mons = CAST(dtm.ID_mon AS VARCHAR)
        OR dtp.ID_mons LIKE '%,' + CAST(dtm.ID_mon AS VARCHAR) + ',%'
        OR dtp.ID_mons LIKE CAST(dtm.ID_mon AS VARCHAR) + ',%'
        OR dtp.ID_mons LIKE '%,' + CAST(dtm.ID_mon AS VARCHAR)
      )
    )
    LEFT JOIN dmMonHoc mh ON dtm.ID_mon = mh.ID_mon
    LEFT JOIN dmPhongHoc dmph ON COALESCE(dtp.ID_phong, mtp.ID_phong) = dmph.ID_phong
    LEFT JOIN HR_LyLich cb1 ON COALESCE(dtp.ID_cb_coi_thi1, mtp.ID_cb_coi_thi1) = cb1.ID_cb
    LEFT JOIN HR_LyLich cb2 ON COALESCE(dtp.ID_cb_coi_thi2, mtp.ID_cb_coi_thi2) = cb2.ID_cb
    WHERE ts.ID_sv = @idSv
      AND dt.Hoc_ky = @hocKy AND (dt.Nam_hoc = @namHoc OR dt.Nam_hoc = @altNamHoc)
      AND ${dotThiFilter}
      AND dtp.Ngay_thi IS NOT NULL
    ORDER BY dtp.Ngay_thi ASC, dtp.Tu_tiet ASC`,
    [
      { name: 'idSv', type: sql.UniqueIdentifier, value: idSv },
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: cleanNamHoc },
      { name: 'altNamHoc', type: sql.NVarChar(50), value: altNamHoc }
    ],
    { username: 'student-exams-tct-fallback' }
  );

  return fallback.recordset || [];
}

/**
 * Lấy lịch thi các môn học phần mà Giảng viên phụ trách trong 1 kỳ
 * CƠ CHẾ: Dựa vào TKB để xác định các môn/lớp giảng viên giảng dạy trong kỳ,
 * sau đó đối chiếu với cơ sở dữ liệu lịch thi để trích xuất lịch thi tương ứng.
 */
async function getLecturerExams(pool, idCb, hocKy, namHoc, knownSchedules = null, heDaoTao = 'DHCQ') {
  const cleanNamHoc = String(namHoc || '').replace('_', '-');
  const altNamHoc = cleanNamHoc.replace('-', '_');
  const dotThiFilter = getTrainingSystemFilter('dt.Mo_ta', heDaoTao);

  // 1. Trích xuất danh sách môn / lớp tín chỉ mà Giảng viên giảng dạy trong kỳ này từ TKB
  const classesMap = new Map();

  if (Array.isArray(knownSchedules) && knownSchedules.length > 0) {
    for (const s of knownSchedules) {
      if (s.ID_lop_tc && !classesMap.has(s.ID_lop_tc)) {
        classesMap.set(s.ID_lop_tc, {
          ID_lop_tc: s.ID_lop_tc,
          Ten_lop_hp: s.Ten_lop_hp || '',
          courseCode: s.courseCode || '',
          courseName: s.courseName || '',
          credits: s.credits || 0,
          ID_mon: s.ID_mon || null
        });
      }
    }
  }

  // Nếu chưa có classes từ knownSchedules, truy vấn từ TKB theo kỳ
  if (classesMap.size === 0) {
    const kyDangKys = await findAllKyDangKy(pool, hocKy, namHoc, heDaoTao);
    if (kyDangKys.length === 0) return [];
    const kyList = kyDangKys.join(',');

    const classRes = await safeQuery(pool,
      `SELECT DISTINCT
        ltc.ID_lop_tc,
        ltc.Ten_lop_hp,
        mtc.ID_mon,
        mh.Ky_hieu AS courseCode,
        mh.Ten_mon AS courseName,
        COALESCE(mtc.So_tin_chi, 0) AS credits
      FROM PLAN_SukiensTinChi_TC sk
      JOIN PLAN_LopTinChi_TC ltc ON sk.ID_lop_tc = ltc.ID_lop_tc
      JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
      JOIN dmMonHoc mh ON mtc.ID_mon = mh.ID_mon
      WHERE COALESCE(sk.ID_cb, ltc.ID_cb) = @idCb
        AND ISNULL(ltc.Huy_lop, 0) = 0
        AND mtc.Ky_dang_ky IN (${kyList})`,
      [{ name: 'idCb', type: sql.NVarChar(50), value: String(idCb) }],
      { username: 'lecturer-tkb-classes' }
    );
    for (const c of (classRes.recordset || [])) {
      if (c.ID_lop_tc && !classesMap.has(c.ID_lop_tc)) {
        classesMap.set(c.ID_lop_tc, c);
      }
    }
  }

  // Nếu giảng viên không có lớp dạy trong kỳ này -> Không có lịch thi
  if (classesMap.size === 0) {
    return [];
  }

  const lopIds = Array.from(classesMap.keys());
  const lopList = lopIds.join(',');

  // 2. Đối chiếu danh sách lớp học phần vào cơ sở dữ liệu lịch thi
  // Query 1: Bảng tổ chức thi theo lớp học phần (TCT_DotThi_Mon & TCT_DotThi_Phong)
  const res1 = await safeQuery(pool,
    `SELECT DISTINCT
      dtm.ID_lop_tc,
      dtp.Ngay_thi,
      dtp.Tu_tiet,
      COALESCE(dtp.So_tiet, 2) AS So_tiet,
      COALESCE(dmph.So_phong, dtp.Ten_phong, ph.So_phong, '') AS Phong,
      COALESCE(dtp.Si_so, 0) AS Si_so,
      COALESCE(dtm.ID_hinh_thuc, 1) AS Hinh_thuc,
      COALESCE(dt.Lan_thi, 1) AS Lan_thi,
      dt.Ten_dot,
      cb1.Ho_ten AS CbCoiThi1,
      cb2.Ho_ten AS CbCoiThi2
    FROM TCT_DotThi_Mon dtm
    JOIN TCT_DotThi dt ON dtm.ID_dot_thi = dt.ID_dot_thi
    JOIN TCT_DotThi_Phong dtp ON (
      dtp.ID_dot_thi = dtm.ID_dot_thi
      AND (
        dtp.ID_lop_tcs = CAST(dtm.ID_lop_tc AS VARCHAR)
        OR dtp.ID_lop_tcs LIKE '%,' + CAST(dtm.ID_lop_tc AS VARCHAR) + ',%'
        OR dtp.ID_lop_tcs LIKE CAST(dtm.ID_lop_tc AS VARCHAR) + ',%'
        OR dtp.ID_lop_tcs LIKE '%,' + CAST(dtm.ID_lop_tc AS VARCHAR)
      )
    )
    LEFT JOIN dmPhongHoc dmph ON dtp.ID_phong = dmph.ID_phong
    LEFT JOIN PLAN_PhongHoc ph ON dtp.ID_phong = ph.ID_phong
    LEFT JOIN HR_LyLich cb1 ON dtp.ID_cb_coi_thi1 = cb1.ID_cb
    LEFT JOIN HR_LyLich cb2 ON dtp.ID_cb_coi_thi2 = cb2.ID_cb
    WHERE dtm.ID_lop_tc IN (${lopList})
      AND dt.Hoc_ky = @hocKy
      AND (dt.Nam_hoc = @namHoc OR dt.Nam_hoc = @altNamHoc)
      AND ${dotThiFilter}
      AND dtp.Ngay_thi IS NOT NULL
    ORDER BY dtp.Ngay_thi ASC, dtp.Tu_tiet ASC`,
    [
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: cleanNamHoc },
      { name: 'altNamHoc', type: sql.NVarChar(50), value: altNamHoc }
    ],
    { username: 'lecturer-exams-by-lop-tc' }
  );

  let rawExams = res1.recordset || [];

  // Query 2: Fallback qua sinh viên của lớp học phần (STU_DanhSachLopTinChi -> TCT_DotThi_ThiSinh -> TCT_DotThi_Phong)
  // RÀNG BUỘC CHẶT CHẼ: Phòng thi bắt buộc phải thuộc đúng môn học ID_mon của lớp
  if (rawExams.length === 0) {
    const res2 = await safeQuery(pool,
      `SELECT DISTINCT
        ds.ID_lop_tc,
        dtp.Ngay_thi,
        dtp.Tu_tiet,
        COALESCE(dtp.So_tiet, 2) AS So_tiet,
        COALESCE(dmph.So_phong, dtp.Ten_phong, '') AS Phong,
        COALESCE(dtp.Si_so, 0) AS Si_so,
        1 AS Hinh_thuc,
        COALESCE(ts.Lan_thi_diem, dt.Lan_thi, 1) AS Lan_thi,
        dt.Ten_dot,
        cb1.Ho_ten AS CbCoiThi1,
        cb2.Ho_ten AS CbCoiThi2
      FROM STU_DanhSachLopTinChi ds
      JOIN PLAN_LopTinChi_TC ltc ON ds.ID_lop_tc = ltc.ID_lop_tc
      JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
      JOIN TCT_DotThi_ThiSinh ts ON ds.ID_sv = ts.ID_sv
      JOIN TCT_DotThi_Phong dtp ON ts.ID_dot_thi_phong = dtp.ID_dot_thi_phong
      JOIN TCT_DotThi dt ON dtp.ID_dot_thi = dt.ID_dot_thi
      JOIN TCT_DotThi_Mon dtm ON (dt.ID_dot_thi = dtm.ID_dot_thi AND dtm.ID_mon = mtc.ID_mon)
      LEFT JOIN dmPhongHoc dmph ON dtp.ID_phong = dmph.ID_phong
      LEFT JOIN HR_LyLich cb1 ON dtp.ID_cb_coi_thi1 = cb1.ID_cb
      LEFT JOIN HR_LyLich cb2 ON dtp.ID_cb_coi_thi2 = cb2.ID_cb
      WHERE ds.ID_lop_tc IN (${lopList})
        AND ISNULL(ds.Huy_dang_ky, 0) = 0
        AND dt.Hoc_ky = @hocKy
        AND (dt.Nam_hoc = @namHoc OR dt.Nam_hoc = @altNamHoc)
        AND ${dotThiFilter}
        AND dtp.Ngay_thi IS NOT NULL
      ORDER BY dtp.Ngay_thi ASC, dtp.Tu_tiet ASC`,
      [
        { name: 'hocKy', type: sql.Int, value: hocKy },
        { name: 'namHoc', type: sql.NVarChar(50), value: cleanNamHoc },
        { name: 'altNamHoc', type: sql.NVarChar(50), value: altNamHoc }
      ],
      { username: 'lecturer-exams-by-students' }
    );
    rawExams = res2.recordset || [];
  }

  // Query 3: Fallback qua phân hệ điểm (STU_DanhSachLopTinChi -> MARK_TochucThiChiTiet_TC -> MARK_TochucThi_TC)
  // RÀNG BUỘC CHẶT CHẼ: Bắt buộc thi.ID_mon = mtc.ID_mon
  if (rawExams.length === 0) {
    const res3 = await safeQuery(pool,
      `SELECT DISTINCT
        ds.ID_lop_tc,
        COALESCE(mtp.Ngay_thi, dtp.Ngay_thi, thi.Ngay_thi) AS Ngay_thi,
        COALESCE(NULLIF(mtp.Gio_thi, ''), NULLIF(thi.Gio_thi, ''), '') AS Gio_thi,
        COALESCE(mtp.Tu_tiet, dtp.Tu_tiet, 1) AS Tu_tiet,
        COALESCE(mtp.So_tiet, dtp.So_tiet, thi.So_tiet, 2) AS So_tiet,
        CASE 
          WHEN dmph.So_phong IS NOT NULL AND mtp.Ten_phong IS NOT NULL AND dmph.So_phong <> mtp.Ten_phong 
          THEN dmph.So_phong + ' (' + mtp.Ten_phong + ')'
          ELSE COALESCE(dmph.So_phong, mtp.Ten_phong, dtp.Ten_phong, ph.So_phong, '')
        END AS Phong,
        COALESCE(mtp.So_sv, dtp.Si_so, 0) AS Si_so,
        COALESCE(thi.Hinh_thuc_thi, 1) AS Hinh_thuc,
        COALESCE(thi.Lan_thi, 1) AS Lan_thi,
        COALESCE(thi.Dot_thi, 1) AS Ten_dot,
        cb1.Ho_ten AS CbCoiThi1,
        cb2.Ho_ten AS CbCoiThi2
      FROM STU_DanhSachLopTinChi ds
      JOIN PLAN_LopTinChi_TC ltc ON ds.ID_lop_tc = ltc.ID_lop_tc
      JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
      JOIN MARK_TochucThiChiTiet_TC ct ON ds.ID_sv = ct.ID_sv
      JOIN MARK_TochucThi_TC thi ON (ct.ID_thi = thi.ID_thi AND thi.ID_mon = mtc.ID_mon)
      LEFT JOIN MARK_ToChucThiPhong_TC mtp ON ct.ID_phong_thi = mtp.ID_phong_thi
      LEFT JOIN TCT_DotThi_Phong dtp ON COALESCE(mtp.ID_dot_thi_phong, ct.ID_phong_thi) = dtp.ID_dot_thi_phong
      LEFT JOIN dmPhongHoc dmph ON COALESCE(mtp.ID_phong, dtp.ID_phong) = dmph.ID_phong
      LEFT JOIN PLAN_PhongHoc ph ON COALESCE(mtp.ID_phong, ct.ID_phong_thi) = ph.ID_phong
      LEFT JOIN HR_LyLich cb1 ON COALESCE(mtp.ID_cb_coi_thi1, dtp.ID_cb_coi_thi1) = cb1.ID_cb
      LEFT JOIN HR_LyLich cb2 ON COALESCE(mtp.ID_cb_coi_thi2, dtp.ID_cb_coi_thi2) = cb2.ID_cb
      WHERE ds.ID_lop_tc IN (${lopList})
        AND ISNULL(ds.Huy_dang_ky, 0) = 0
        AND thi.Hoc_ky = @hocKy
        AND (thi.Nam_hoc = @namHoc OR thi.Nam_hoc = @altNamHoc)
        AND COALESCE(mtp.Ngay_thi, thi.Ngay_thi, dtp.Ngay_thi) IS NOT NULL
      ORDER BY COALESCE(mtp.Ngay_thi, dtp.Ngay_thi, thi.Ngay_thi) ASC, COALESCE(mtp.Tu_tiet, dtp.Tu_tiet, 1) ASC`,
      [
        { name: 'hocKy', type: sql.Int, value: hocKy },
        { name: 'namHoc', type: sql.NVarChar(50), value: cleanNamHoc },
        { name: 'altNamHoc', type: sql.NVarChar(50), value: altNamHoc }
      ],
      { username: 'lecturer-exams-by-mark' }
    );
    rawExams = res3.recordset || [];
  }

  // 3. Ghép nối chính xác thông tin môn và lớp học phần từ TKB và khử trùng lặp
  const seenKey = new Set();
  const finalExams = [];

  for (const r of rawExams) {
    const cls = classesMap.get(r.ID_lop_tc);
    if (!cls) continue;

    const dedupKey = `${cls.ID_lop_tc}_${r.Ngay_thi}_${r.Tu_tiet}_${r.Phong}`;
    if (seenKey.has(dedupKey)) continue;
    seenKey.add(dedupKey);

    finalExams.push({
      courseCode: cls.courseCode || '',
      courseName: cls.courseName || '',
      credits: cls.credits || 0,
      ID_lop_tc: cls.ID_lop_tc,
      Ten_lop_hp: cls.Ten_lop_hp || '',
      Ngay_thi: r.Ngay_thi,
      Tu_tiet: r.Tu_tiet,
      So_tiet: r.So_tiet,
      Phong: r.Phong,
      Si_so: r.Si_so || 0,
      Hinh_thuc: r.Hinh_thuc || 1,
      Lan_thi: r.Lan_thi || 1,
      Ten_dot: r.Ten_dot || '',
      CbCoiThi1: r.CbCoiThi1 || '',
      CbCoiThi2: r.CbCoiThi2 || ''
    });
  }

  return finalExams;
}

/**
 * Lấy điểm của 1 SV trong 1 kỳ
 * Bảng: MARK_Diem_TC → MARK_DiemThi_TC (điểm thi) + MARK_DiemThanhPhan_TC (TP)
 */
async function getStudentGrades(pool, idSv, hocKy, namHoc) {
  const result = await safeQuery(pool,
    `SELECT
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName, mh.So_hoc_trinh AS credits,
      tp_cc.Diem AS processGrade, tp_gk.Diem AS midtermGrade,
      dt.Diem_thi, dt.TBCMH, dt.Diem_chu, dt.Diem_so AS grade4,
      dt.Lan_hoc, dt.Lan_thi,
      d.Hoc_ky, d.Nam_hoc
    FROM MARK_Diem_TC d
    JOIN dmMonHoc mh ON d.ID_mon = mh.ID_mon
    LEFT JOIN MARK_DiemThi_TC dt ON dt.ID_diem = d.ID_diem
    LEFT JOIN MARK_DiemThanhPhan_TC tp_cc ON tp_cc.ID_diem = d.ID_diem AND tp_cc.ID_thanh_phan = 1
    LEFT JOIN MARK_DiemThanhPhan_TC tp_gk ON tp_gk.ID_diem = d.ID_diem AND tp_gk.ID_thanh_phan = 2
    WHERE d.ID_sv = @idSv
      AND d.Hoc_ky = @hocKy AND d.Nam_hoc = @namHoc
    ORDER BY mh.Ten_mon`,
    [
      { name: 'idSv', type: sql.UniqueIdentifier, value: idSv },
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: namHoc }
    ],
    { username: 'student-grades' }
  );
  return result.recordset;
}

/**
 * Lấy TẤT CẢ điểm của 1 SV (mọi kỳ) — chỉ chạy 1 lần khi sync lịch sử
 */
async function getAllStudentGrades(pool, idSv) {
  const result = await safeQuery(pool,
    `SELECT
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName, mh.So_hoc_trinh AS credits,
      tp_cc.Diem AS processGrade, tp_gk.Diem AS midtermGrade,
      dt.Diem_thi, dt.TBCMH, dt.Diem_chu, dt.Diem_so AS grade4,
      dt.Lan_hoc, dt.Lan_thi,
      d.Hoc_ky, d.Nam_hoc
    FROM MARK_Diem_TC d
    JOIN dmMonHoc mh ON d.ID_mon = mh.ID_mon
    LEFT JOIN MARK_DiemThi_TC dt ON dt.ID_diem = d.ID_diem
    LEFT JOIN MARK_DiemThanhPhan_TC tp_cc ON tp_cc.ID_diem = d.ID_diem AND tp_cc.ID_thanh_phan = 1
    LEFT JOIN MARK_DiemThanhPhan_TC tp_gk ON tp_gk.ID_diem = d.ID_diem AND tp_gk.ID_thanh_phan = 2
    WHERE d.ID_sv = @idSv
    ORDER BY d.Nam_hoc, d.Hoc_ky, mh.Ten_mon`,
    [{ name: 'idSv', type: sql.UniqueIdentifier, value: idSv }],
    { username: 'student-grades-all' }
  );
  return result.recordset;
}

/**
 * Lấy học phí của 1 SV trong 1 kỳ
 * Bảng: ACC_BienLaiThu (có Hoc_ky, Nam_hoc trực tiếp, dùng So_tien)
 */
async function getStudentFinance(pool, idSv, hocKy, namHoc) {
  const result = await safeQuery(pool,
    `SELECT
      bl.ID_bien_lai, bl.So_phieu, bl.Ngay_thu, bl.So_tien,
      bl.Hoc_ky, bl.Nam_hoc, bl.Lan_thu, bl.Ghi_chu, bl.Thu_chi, bl.Noi_dung
    FROM ACC_BienLaiThu bl
    WHERE bl.ID_sv = @idSv
      AND bl.Hoc_ky = @hocKy AND bl.Nam_hoc = @namHoc
      AND ISNULL(bl.Huy_phieu, 0) = 0
      AND bl.So_tien > 0
    ORDER BY bl.Ngay_thu DESC`,
    [
      { name: 'idSv', type: sql.UniqueIdentifier, value: idSv },
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: namHoc }
    ],
    { username: 'student-finance' }
  );
  return result.recordset;
}

/**
 * Lấy TẤT CẢ học phí của 1 SV — chỉ chạy 1 lần
 */
async function getAllStudentFinance(pool, idSv) {
  const result = await safeQuery(pool,
    `SELECT
      bl.ID_bien_lai, bl.So_phieu, bl.Ngay_thu, bl.So_tien,
      bl.Hoc_ky, bl.Nam_hoc, bl.Lan_thu, bl.Ghi_chu, bl.Thu_chi, bl.Noi_dung
    FROM ACC_BienLaiThu bl
    WHERE bl.ID_sv = @idSv
      AND ISNULL(bl.Huy_phieu, 0) = 0
    ORDER BY bl.Nam_hoc, bl.Hoc_ky, bl.Ngay_thu DESC`,
    [{ name: 'idSv', type: sql.UniqueIdentifier, value: idSv }],
    { username: 'student-finance-all' }
  );
  return result.recordset;
}

/**
 * Lấy danh sách miễn giảm học phí của 1 SV (ACC_DanhSachMienGiamHocPhi)
 */
async function getStudentExemptions(pool, idSv) {
  try {
    const result = await safeQuery(pool,
      `SELECT Hoc_ky, Nam_hoc, Phan_tram, So_tien_MG
       FROM ACC_DanhSachMienGiamHocPhi
       WHERE ID_sv = @idSv`,
      [{ name: 'idSv', type: sql.UniqueIdentifier, value: idSv }],
      { username: 'student-exemptions' }
    );
    return result.recordset;
  } catch (e) {
    return [];
  }
}

/**
 * Lấy tổng hợp công nợ học phí theo kỳ của 1 SV (ACC_TongHopCongNoHocPhiTheoKy)
 */
async function getStudentFinanceSummaryByTerm(pool, idSv) {
  try {
    const result = await safeQuery(pool,
      `SELECT Hoc_ky, Nam_hoc, So_tien_phai_nop, So_tien_mien_giam, So_tien_nop, So_tien_da_nop, So_tien_tra_lai, Thieu_thua
       FROM ACC_TongHopCongNoHocPhiTheoKy
       WHERE ID_sv = @idSv`,
      [{ name: 'idSv', type: sql.UniqueIdentifier, value: idSv }],
      { username: 'student-finance-summary-terms' }
    );
    return result.recordset;
  } catch (e) {
    return [];
  }
}

/**
 * Chuẩn hóa số dư NamViet / TUAF:
 * - Trong CSDL NamViet/TUAF: Số Âm (-) là THỪA TIỀN, Số Dương (+) là THIẾU TIỀN (NỢ)
 * - Tách thành debtAmount (>= 0) và surplusAmount (>= 0) để không bao giờ xuất hiện số âm ra bên ngoài
 */
function parseNamVietBalance(rawThieuThua) {
  const value = Number(rawThieuThua) || 0;
  const isDebt = value > 0;
  const isSurplus = value < 0;
  const isSettled = value === 0;
  const debtAmount = isDebt ? value : 0;
  const surplusAmount = isSurplus ? Math.abs(value) : 0;
  const status = isDebt ? 'debt' : (isSurplus ? 'surplus' : 'completed');
  const statusText = isDebt 
    ? `Còn nợ ${debtAmount.toLocaleString('vi-VN')}đ` 
    : (isSurplus ? `Đang nộp thừa ${surplusAmount.toLocaleString('vi-VN')}đ` : 'Đã nộp đủ');

  return {
    rawBalance: value,
    isDebt,
    isSurplus,
    isSettled,
    debtAmount,
    surplusAmount,
    status,
    statusText
  };
}

/**
 * Lấy tổng hợp công nợ lũy kế toàn khóa của 1 SV (ACC_TongHopCongNoHocPhi)
 */
async function getStudentCumulativeFinance(pool, idSv) {
  try {
    const result = await safeQuery(pool,
      `SELECT TOP 1
        So_tien_phai_nop AS totalTuition,
        So_tien_mien_giam AS discountTuition,
        So_tien_nop AS mustPayTuition,
        So_tien_da_nop AS paidTuition,
        So_tien_tra_lai AS refundTuition,
        Thieu_thua AS balance,
        Ngay_tong_hop AS updatedDate
       FROM ACC_TongHopCongNoHocPhi
       WHERE ID_sv = @idSv`,
      [{ name: 'idSv', type: sql.UniqueIdentifier, value: idSv }],
      { username: 'student-finance-cumulative' }
    );
    const row = result.recordset[0];
    if (!row) return null;

    const normalized = parseNamVietBalance(row.balance);
    return {
      ...row,
      ...normalized
    };
  } catch (e) {
    return null;
  }
}

/**
 * Lấy chi tiết công nợ học phí các kỳ theo chuẩn phần mềm Nam Việt (ACC_TongHopHocPhiSinhVien_HienThi)
 */
async function getStudentNamVietFinance(pool, idSv) {
  try {
    const result = await pool.request()
      .input('ID_sv', sql.UniqueIdentifier, idSv)
      .execute('ACC_TongHopHocPhiSinhVien_HienThi');
    return result.recordset || [];
  } catch (e) {
    return [];
  }
}

/**
 * Lấy danh sách thông báo / tin tức chính thức từ Nhà trường (tblNews)
 */
async function getSchoolNews(pool, role = 'student') {
  const isLecturer = role === 'lecturer';
  const roleFilter = isLecturer ? 'GiaoVien = 1' : 'SinhVien = 1';

  const result = await safeQuery(pool,
    `SELECT TOP 100
      ID AS newsId, Tieu_de AS title, Mieu_ta AS summary, Noi_dung AS content,
      ImageUrl AS imageUrl, PostDate AS postDate, SinhVien AS targetStudent,
      GiaoVien AS targetLecturer, ISNULL(Chuyen_muc, 1) AS category
     FROM tblNews
     WHERE Trang_thai = 1 AND ${roleFilter}
     ORDER BY PostDate DESC`,
    [],
    { username: 'school-news' }
  );

  return result.recordset;
}

/**
 * Lấy điểm rèn luyện của 1 SV trong 1 kỳ
 * Bảng: STU_DiemRenLuyen (cột Diem, ID_loai_rl)
 */
async function getStudentDRL(pool, idSv, hocKy, namHoc) {
  const result = await safeQuery(pool,
    `SELECT Diem, Hoc_ky, Nam_hoc, ID_loai_rl
     FROM STU_DiemRenLuyen
     WHERE ID_sv = @idSv AND Hoc_ky = @hocKy AND Nam_hoc = @namHoc`,
    [
      { name: 'idSv', type: sql.UniqueIdentifier, value: idSv },
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: namHoc }
    ],
    { username: 'student-drl' }
  );
  // Tổng điểm rèn luyện = sum of all Diem entries
  if (result.recordset.length === 0) return null;
  const totalDiem = result.recordset.reduce((sum, r) => sum + (r.Diem || 0), 0);
  return { Diem: totalDiem, Hoc_ky: hocKy, Nam_hoc: namHoc };
}

/**
 * Lấy khung CTĐT theo ngành của SV (Chỉ lấy các môn phân từ Học kỳ 1 đến Học kỳ 8)
 */
async function getStudentCurriculum(pool, idSv) {
  try {
    const result = await safeQuery(pool,
      `SELECT 
        ctd.Ky_thu AS semester,
        ctd.So_hoc_trinh AS credits,
        ctd.Tu_chon AS isElective,
        ctd.Nhom_tu_chon AS electiveGroup,
        kt.Ten_kien_thuc AS knowledgeBlockName,
        mh.Ky_hieu AS courseCode,
        mh.Ten_mon AS courseName
      FROM STU_DanhSach ds
      JOIN STU_Lop l ON ds.ID_lop = l.ID_lop
      JOIN PLAN_ChuongTrinhDaoTao ct ON ct.ID_dt = COALESCE(NULLIF(ds.ID_dt_sv, 0), l.ID_dt)
      JOIN PLAN_ChuongTrinhDaoTaoChiTiet ctd ON ct.ID_dt = ctd.ID_dt
      JOIN dmMonHoc mh ON ctd.ID_mon = mh.ID_mon
      LEFT JOIN PLAN_ChuongTrinhDaoTaoKienThuc kt ON ctd.Kien_thuc = kt.ID_kien_thuc
      WHERE ds.ID_sv = @idSv AND ctd.Ky_thu >= 1 AND ctd.Ky_thu <= 8
      ORDER BY ctd.Ky_thu, ctd.STT_mon, mh.Ten_mon`,
      [{ name: 'idSv', type: sql.NVarChar(100), value: String(idSv) }],
      { username: 'student-curriculum' }
    );
    return result.recordset;
  } catch (e) {
    console.error('❌ [tuafQueries] getStudentCurriculum error:', e.message);
    return [];
  }
}

/**
 * Lấy lịch dạy của GV trong 1 kỳ
 * Bảng: PLAN_SukiensTinChi_TC (thay cho PLAN_BoTri)
 */
async function getLecturerSchedule(pool, idCb, hocKy, namHoc, heDaoTao = 'DHCQ') {
  const kyDangKys = await findAllKyDangKy(pool, hocKy, namHoc, heDaoTao);
  if (kyDangKys.length === 0) return [];
  const kyList = kyDangKys.join(',');

  const result = await safeQuery(pool,
    `SELECT
      sk.Thu, sk.Tiet, sk.So_tiet, sk.Tu_ngay, sk.Den_ngay, sk.Tu_tuan, sk.Den_tuan,
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName,
      mtc.So_tin_chi AS credits,
      mtc.ID_mon,
      COALESCE(
        CASE
          WHEN nha.Ten_nha IS NOT NULL AND nha.Ten_nha NOT LIKE '%Nông Lâm%'
            THEN ph.So_phong + ' (' + nha.Ten_nha + ')'
          ELSE ph.So_phong
        END,
        ph.So_phong,
        ''
      ) AS Phong,
      ltc.ID_lop_tc, ltc.Ten_lop_hp
    FROM PLAN_SukiensTinChi_TC sk
    JOIN PLAN_LopTinChi_TC ltc ON sk.ID_lop_tc = ltc.ID_lop_tc
    JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
    JOIN dmMonHoc mh ON mtc.ID_mon = mh.ID_mon
    LEFT JOIN dmPhongHoc ph ON sk.ID_phong = ph.ID_phong
    LEFT JOIN dmToaNha nha ON ph.ID_nha = nha.ID_nha
    WHERE COALESCE(sk.ID_cb, ltc.ID_cb) = @idCb
      AND ISNULL(ltc.Huy_lop, 0) = 0
      AND mtc.Ky_dang_ky IN (${kyList})
    ORDER BY sk.Thu, sk.Tiet`,
    [
      { name: 'idCb', type: sql.NVarChar(50), value: String(idCb) }
    ],
    { username: 'lecturer-schedule' }
  );
  return result.recordset;
}

/**
 * Lấy danh sách sinh viên đăng ký một lớp tín chỉ (cho Giảng viên học phần điểm danh)
 */
async function getClassStudents(pool, idLopTc) {
  const result = await safeQuery(pool,
    `SELECT
      sv.ID_sv,
      sv.Ma_sv AS studentCode,
      sv.Ho_ten AS studentName,
      COALESCE(l.Ten_lop, l.Ma_lop, sv.Lop, '') AS studentClass,
      l.ID_lop AS idHomeroomLop,
      sv.Ngay_sinh AS dob,
      sv.EmailTruong AS email
    FROM STU_DanhSachLopTinChi ds
    JOIN STU_HoSoSinhVien sv ON ds.ID_sv = sv.ID_sv
    LEFT JOIN (
      SELECT dsl.ID_sv, MAX(dsl.ID_lop) AS ID_lop
      FROM STU_DanhSach dsl
      WHERE ISNULL(dsl.Trang_thai, 0) = 0
      GROUP BY dsl.ID_sv
    ) dsl ON sv.ID_sv = dsl.ID_sv
    LEFT JOIN STU_Lop l ON dsl.ID_lop = l.ID_lop
    WHERE ds.ID_lop_tc = @idLopTc
      AND ISNULL(ds.Huy_dang_ky, 0) = 0
    ORDER BY l.Ten_lop, sv.Ma_sv, sv.Ho_ten`,
    [{ name: 'idLopTc', type: sql.Int, value: idLopTc }],
    { username: 'lecturer-class-students' }
  );
  return (result.recordset || []).map(r => ({
    ...r,
    studentClass: (r.studentClass || '').trim(),
    studentName: (r.studentName || '').trim(),
    studentCode: (r.studentCode || '').trim()
  }));
}

/**
 * Lấy danh sách các lớp mà Giảng viên được phân công làm Chủ nhiệm (GVCN)
 * - Khử nhân bản lớp khi GV phụ trách nhiều năm học
 * - Đếm chính xác sĩ số thực tế và phân loại trạng thái học tập từ STU_DanhSach
 */
async function getHomeroomClasses(pool, idCb, namHoc) {
  const query = `
    WITH AssignedClasses AS (
      SELECT
        l.ID_lop AS idLop,
        COALESCE(l.Ma_lop, '') AS classCode,
        COALESCE(l.Ten_lop, '') AS className,
        l.Khoa_hoc AS cohort,
        l.Nien_khoa AS schoolYearRange,
        MAX(gv.Nam_hoc) AS latestSchoolYear
      FROM STU_GiaoVienChuNghiem gv
      JOIN STU_Lop l ON gv.ID_lop = l.ID_lop
      WHERE (gv.Id_cb = @idCb OR CAST(gv.Id_cb AS nvarchar(50)) = @idCb)
      GROUP BY l.ID_lop, l.Ma_lop, l.Ten_lop, l.Khoa_hoc, l.Nien_khoa
    ),
    ClassStats AS (
      SELECT
        ds.ID_lop,
        COUNT(ds.ID_sv) AS totalStudents,
        SUM(CASE WHEN ds.Trang_thai = 0 THEN 1 ELSE 0 END) AS activeStudents,
        SUM(CASE WHEN ds.Trang_thai = 2 THEN 1 ELSE 0 END) AS leaveStudents,
        SUM(CASE WHEN ds.Trang_thai = 1 THEN 1 ELSE 0 END) AS reservedStudents,
        SUM(CASE WHEN ds.Trang_thai = 3 THEN 1 ELSE 0 END) AS suspendedStudents,
        SUM(CASE WHEN ds.Trang_thai = 4 THEN 1 ELSE 0 END) AS graduatedStudents
      FROM STU_DanhSach ds
      JOIN STU_HoSoSinhVien sv ON ds.ID_sv = sv.ID_sv
      GROUP BY ds.ID_lop
    )
    SELECT
      c.idLop,
      c.classCode,
      c.className,
      c.cohort,
      c.schoolYearRange,
      c.latestSchoolYear AS schoolYear,
      COALESCE(s.totalStudents, 0) AS studentCount,
      COALESCE(s.totalStudents, 0) AS totalStudents,
      COALESCE(s.activeStudents, 0) AS activeStudents,
      COALESCE(s.leaveStudents, 0) AS leaveStudents,
      COALESCE(s.reservedStudents, 0) AS reservedStudents,
      COALESCE(s.suspendedStudents, 0) AS suspendedStudents,
      COALESCE(s.graduatedStudents, 0) AS graduatedStudents
    FROM AssignedClasses c
    LEFT JOIN ClassStats s ON c.idLop = s.ID_lop
    ORDER BY c.cohort DESC, c.className ASC
  `;
  const inputs = [{ name: 'idCb', type: sql.NVarChar(50), value: String(idCb) }];
  const result = await safeQuery(pool, query, inputs, { username: 'homeroom-classes' });
  return result.recordset;
}

/**
 * Theo dõi đăng ký học của sinh viên lớp chủ nhiệm
 * - Đếm số tín chỉ đăng ký
 * - Kiểm tra thiếu môn so với kế hoạch mở TKB cho lớp
 * - Phân loại môn học lại / cải thiện
 * - Hiển thị trạng thái học tập chi tiết (Đang học, Thôi học, Bảo lưu...)
 */
async function getHomeroomStudentsRegistration(pool, idLop, hocKy, namHoc) {
  // 1. Lấy thông tin lớp
  const classRes = await safeQuery(pool,
    `SELECT ID_lop, Ma_lop, Ten_lop, Khoa_hoc FROM STU_Lop WHERE ID_lop = @idLop`,
    [{ name: 'idLop', type: sql.Int, value: idLop }],
    { username: 'homeroom-class-info' }
  );
  if (classRes.recordset.length === 0) return { className: '', classCode: '', students: [], plannedCourses: [] };

  const classInfo = classRes.recordset[0];
  const className = classInfo.Ten_lop || '';
  const classCode = classInfo.Ma_lop || '';

  // 2. Tìm tất cả kỳ đăng ký
  const kyDangKys = await findAllKyDangKy(pool, hocKy, namHoc);
  if (kyDangKys.length === 0) return { className, classCode, students: [], plannedCourses: [] };
  const kyList = kyDangKys.join(',');

  // 3. Lấy danh sách môn kế hoạch cho lớp trong kỳ này
  const plannedCoursesRes = await safeQuery(pool,
    `SELECT DISTINCT
      mh.ID_mon AS courseId,
      mh.Ky_hieu AS courseCode,
      mh.Ten_mon AS courseName,
      mtc.So_tin_chi AS credits
    FROM PLAN_LopTinChi_TC ltc
    JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
    JOIN dmMonHoc mh ON mtc.ID_mon = mh.ID_mon
    WHERE mtc.Ky_dang_ky IN (${kyList})
      AND ISNULL(ltc.Huy_lop, 0) = 0
      AND (
        (@className != '' AND ltc.Ten_lop_hp LIKE '%' + @className + '%') OR
        (@classCode != '' AND ltc.Ten_lop_hp LIKE '%' + @classCode + '%')
      )`,
    [
      { name: 'className', type: sql.NVarChar(100), value: className },
      { name: 'classCode', type: sql.NVarChar(50), value: classCode }
    ],
    { username: 'homeroom-planned-courses' }
  );
  const plannedCourses = plannedCoursesRes.recordset;

  // 4. Lấy danh sách SV của lớp từ STU_DanhSach (kèm trạng thái học tập)
  const studentsRes = await safeQuery(pool,
    `SELECT
      sv.ID_sv,
      sv.Ma_sv AS studentCode,
      sv.Ho_ten AS studentName,
      @className AS studentClass,
      ds.Trang_thai AS statusId,
      COALESCE(tt.Trang_thai, 'Chưa rõ') AS statusName,
      ds.Active AS isActive,
      ds.Da_tot_nghiep AS isGraduated,
      sv.Dienthoai_canhan AS phone,
      COALESCE(sv.EmailTruong, sv.Email, '') AS email
    FROM STU_DanhSach ds
    JOIN STU_HoSoSinhVien sv ON ds.ID_sv = sv.ID_sv
    LEFT JOIN dmTrangThaiHoc tt ON ds.Trang_thai = tt.ID_tt
    WHERE ds.ID_lop = @idLop
    ORDER BY ds.Trang_thai ASC, sv.Ho_ten ASC`,
    [
      { name: 'idLop', type: sql.Int, value: idLop },
      { name: 'className', type: sql.NVarChar(100), value: className }
    ],
    { username: 'homeroom-students' }
  );
  const students = studentsRes.recordset;
  if (students.length === 0) return { className, classCode, students: [], plannedCourses };

  // 5. Lấy tất cả môn đăng ký của các SV trong kỳ này
  const studentIds = students.map(s => `'${s.ID_sv}'`).join(',');
  const regRes = await safeQuery(pool,
    `SELECT
      ds.ID_sv,
      mh.ID_mon AS courseId,
      mh.Ky_hieu AS courseCode,
      mh.Ten_mon AS courseName,
      mtc.So_tin_chi AS credits,
      ltc.Ten_lop_hp AS classSection
    FROM STU_DanhSachLopTinChi ds
    JOIN PLAN_LopTinChi_TC ltc ON ds.ID_lop_tc = ltc.ID_lop_tc
    JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
    JOIN dmMonHoc mh ON mtc.ID_mon = mh.ID_mon
    WHERE ds.ID_sv IN (${studentIds})
      AND ISNULL(ds.Huy_dang_ky, 0) = 0
      AND ISNULL(ltc.Huy_lop, 0) = 0
      AND mtc.Ky_dang_ky IN (${kyList})`,
    [],
    { username: 'homeroom-student-registrations' }
  );

  // Nhóm môn theo ID_sv (normalized key)
  const regByStudent = {};
  for (const r of regRes.recordset) {
    const key = String(r.ID_sv).toLowerCase();
    if (!regByStudent[key]) regByStudent[key] = [];
    regByStudent[key].push(r);
  }

  // 6. Lấy lịch sử điểm các kỳ trước của các SV để phát hiện môn học lại / cải thiện
  const pastGradesRes = await safeQuery(pool,
    `SELECT DISTINCT d.ID_sv, d.ID_mon AS courseId
    FROM MARK_Diem_TC d
    WHERE d.ID_sv IN (${studentIds})
      AND NOT (d.Hoc_ky = @hocKy AND (d.Nam_hoc = @namHoc OR d.Nam_hoc = REPLACE(@namHoc, '-', '_')))`,
    [
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: String(namHoc || '') }
    ],
    { username: 'homeroom-past-grades' }
  );

  const pastGradesByStudent = {};
  for (const g of pastGradesRes.recordset) {
    const key = String(g.ID_sv).toLowerCase();
    if (!pastGradesByStudent[key]) pastGradesByStudent[key] = new Set();
    pastGradesByStudent[key].add(g.courseId);
  }

  // 7. Tổng hợp kết quả cho từng sinh viên
  const fullStudents = students.map(s => {
    const sId = String(s.ID_sv).toLowerCase();
    const myRegs = regByStudent[sId] || [];
    const myPastCourses = pastGradesByStudent[sId] || new Set();

    let totalCredits = 0;
    const registeredCourses = myRegs.map(r => {
      totalCredits += (r.credits || 0);
      const isRetake = myPastCourses.has(r.courseId);
      return {
        courseId: r.courseId,
        courseCode: r.courseCode,
        courseName: r.courseName,
        credits: r.credits,
        classSection: r.classSection,
        isRetake,
        tag: isRetake ? 'Học lại / Cải thiện' : 'Học lần đầu'
      };
    });

    const myRegisteredCourseIds = new Set(myRegs.map(r => r.courseId));
    const missingPlannedCourses = plannedCourses.filter(p => !myRegisteredCourseIds.has(p.courseId));
    const hasWarning = missingPlannedCourses.length > 0 && s.statusId === 0;

    return {
      studentId: s.ID_sv,
      studentCode: s.studentCode,
      studentName: s.studentName,
      studentClass: s.studentClass,
      statusId: s.statusId,
      statusName: s.statusName,
      phone: s.phone || '',
      email: s.email || '',
      totalCredits,
      registeredCount: registeredCourses.length,
      hasWarning,
      missingPlannedCourses,
      registeredCourses
    };
  });

  return {
    className,
    classCode,
    plannedCourses,
    students: fullStudents
  };
}

/**
 * Theo dõi công nợ học phí của sinh viên lớp chủ nhiệm
 * - Phân loại: Còn nợ, Đã nộp đủ, Nộp thừa tiền
 * - Hiển thị trạng thái học tập chi tiết
 */
async function getHomeroomStudentsFinance(pool, idLop, hocKy, namHoc) {
  const classRes = await safeQuery(pool,
    `SELECT ID_lop, Ma_lop, Ten_lop FROM STU_Lop WHERE ID_lop = @idLop`,
    [{ name: 'idLop', type: sql.Int, value: idLop }],
    { username: 'homeroom-finance-class' }
  );
  if (classRes.recordset.length === 0) return { summary: {}, students: [] };

  const classInfo = classRes.recordset[0];
  const className = classInfo.Ten_lop || '';
  const classCode = classInfo.Ma_lop || '';

  const cleanNamHoc = String(namHoc || '').replace('_', '-');
  const altNamHoc = cleanNamHoc.replace('-', '_');

  const query = `
    SELECT
      sv.Ma_sv AS studentCode,
      sv.Ho_ten AS studentName,
      @className AS studentClass,
      ds.Trang_thai AS statusId,
      COALESCE(tt.Trang_thai, 'Chưa rõ') AS statusName,
      sv.Dienthoai_canhan AS phone,
      COALESCE(sv.EmailTruong, sv.Email, '') AS email,
      -- 1. Lấy theo kỳ cụ thể nếu trường đã chốt sổ kỳ này
      cnKy.So_tien_phai_nop AS kyMustPay,
      cnKy.So_tien_da_nop AS kyPaid,
      cnKy.So_tien_mien_giam AS kyExemption,
      cnKy.Thieu_thua AS kyBalance,
      -- 2. Lấy công nợ tổng hợp lũy kế mới nhất của trường (đến kỳ chốt gần nhất)
      cnAll.So_tien_phai_nop AS allMustPay,
      cnAll.So_tien_da_nop AS allPaid,
      cnAll.So_tien_mien_giam AS allExemption,
      cnAll.Thieu_thua AS allBalance,
      cnAll.Ngay_tong_hop AS allDate
    FROM STU_DanhSach ds
    JOIN STU_HoSoSinhVien sv ON ds.ID_sv = sv.ID_sv
    LEFT JOIN dmTrangThaiHoc tt ON ds.Trang_thai = tt.ID_tt
    LEFT JOIN ACC_TongHopCongNoHocPhiTheoKy cnKy 
      ON cnKy.ID_sv = sv.ID_sv AND cnKy.Hoc_ky = @hocKy AND (cnKy.Nam_hoc = @namHoc OR cnKy.Nam_hoc = @altNamHoc)
    LEFT JOIN ACC_TongHopCongNoHocPhi cnAll 
      ON cnAll.ID_sv = sv.ID_sv
    WHERE ds.ID_lop = @idLop
    ORDER BY ds.Trang_thai ASC, sv.Ho_ten ASC
  `;

  const result = await safeQuery(pool, query, [
    { name: 'idLop', type: sql.Int, value: idLop },
    { name: 'className', type: sql.NVarChar(100), value: className },
    { name: 'hocKy', type: sql.Int, value: hocKy },
    { name: 'namHoc', type: sql.NVarChar(50), value: cleanNamHoc },
    { name: 'altNamHoc', type: sql.NVarChar(50), value: altNamHoc }
  ], { username: 'homeroom-finance-students' });

  let debtCount = 0;
  let settledCount = 0;
  let surplusCount = 0;
  let totalDebtAmount = 0;
  let totalPaidAmount = 0;
  let hasAnyTermData = false;

  const students = result.recordset.map(row => {
    // Nếu có dữ liệu theo kỳ cụ thể thì dùng theo kỳ, nếu kỳ đó trường chưa chốt số liệu thì fallback sang công nợ tổng hợp lũy kế mới nhất
    const hasKy = row.kyMustPay != null;
    if (hasKy) hasAnyTermData = true;

    const mustPay = hasKy ? (row.kyMustPay || 0) : (row.allMustPay || 0);
    const paid = hasKy ? (row.kyPaid || 0) : (row.allPaid || 0);
    const exemption = hasKy ? (row.kyExemption || 0) : (row.allExemption || 0);
    let balance = hasKy ? (row.kyBalance || 0) : (row.allBalance || 0);

    // Chuẩn hóa nợ lũy kế chốt toàn trường (sổ cái chốt của phòng Tài vụ)
    const allNorm = parseNamVietBalance(row.allBalance);
    const kyNorm = parseNamVietBalance(row.kyBalance);

    let status = 'settled';
    let debtAmount = 0;
    let surplusAmount = 0;

    // QUY TẮC KẾ TOÁN BÙ TRỪ TUAF:
    // Nếu bảng tổng hợp công nợ lũy kế toàn trường cnAll ghi nhận sinh viên đã nộp đủ hoặc nộp thừa (allBalance <= 0),
    // thì sinh viên KHÔNG bị coi là nợ dù ở kỳ cũ cnKy chưa kết chuyển bù trừ công nợ.
    if (allNorm.isSettled || allNorm.isSurplus) {
      if (allNorm.isSurplus) {
        status = 'surplus';
        surplusAmount = allNorm.surplusAmount;
        surplusCount++;
      } else {
        status = 'settled';
        settledCount++;
      }
    } else {
      // Toàn khóa sinh viên đang nợ thực tế
      status = 'debt';
      debtAmount = allNorm.debtAmount;
      debtCount++;
      totalDebtAmount += debtAmount;
    }

    totalPaidAmount += paid;

    return {
      studentCode: row.studentCode,
      studentName: row.studentName,
      studentClass: row.studentClass,
      statusId: row.statusId,
      statusName: row.statusName,
      phone: row.phone || '',
      email: row.email || '',
      mustPay,
      paid,
      exemption,
      rawBalance: row.allBalance,
      balance: surplusAmount > 0 ? surplusAmount : debtAmount,
      debtAmount,
      surplusAmount,
      status,
      statusText: allNorm.statusText,
      isTermData: hasKy
    };
  });

  return {
    className,
    classCode,
    summary: {
      totalStudents: students.length,
      debtCount,
      settledCount,
      surplusCount,
      totalDebtAmount,
      totalPaidAmount,
      isTermData: hasAnyTermData
    },
    students
  };
}

// ═══════════════════════════════════════
// BULK QUERIES — Dùng cho Cron 3AM (toàn trường, kỳ hiện tại)
// ═══════════════════════════════════════

/**
 * Bulk TKB toàn trường — 1 query thay vì N queries
 */
async function bulkSchedules(pool, hocKy, namHoc) {
  const kyDangKys = await findAllKyDangKy(pool, hocKy, namHoc);
  if (kyDangKys.length === 0) return [];
  const kyList = kyDangKys.join(',');

  const result = await safeQuery(pool,
    `SELECT
      sv.Ma_sv,
      sk.Thu, sk.Tiet, sk.So_tiet, sk.Tu_ngay, sk.Den_ngay, sk.Tu_tuan, sk.Den_tuan,
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName,
      ll.Ho_ten AS teacherName,
      mtc.So_tin_chi AS credits,
      COALESCE(
        CASE
          WHEN nha.Ten_nha IS NOT NULL AND nha.Ten_nha NOT LIKE '%Nông Lâm%'
            THEN ph.So_phong + ' (' + nha.Ten_nha + ')'
          ELSE ph.So_phong
        END,
        ph.So_phong,
        ''
      ) AS Phong
    FROM PLAN_SukiensTinChi_TC sk
    JOIN PLAN_LopTinChi_TC ltc ON sk.ID_lop_tc = ltc.ID_lop_tc
    JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
    JOIN dmMonHoc mh ON mtc.ID_mon = mh.ID_mon
    LEFT JOIN dmPhongHoc ph ON sk.ID_phong = ph.ID_phong
    LEFT JOIN dmToaNha nha ON ph.ID_nha = nha.ID_nha
    LEFT JOIN HR_LyLich ll ON COALESCE(sk.ID_cb, ltc.ID_cb) = ll.ID_cb
    JOIN STU_DanhSachLopTinChi ds ON ds.ID_lop_tc = ltc.ID_lop_tc
    JOIN STU_HoSoSinhVien sv ON ds.ID_sv = sv.ID_sv
    WHERE ISNULL(ds.Huy_dang_ky, 0) = 0
      AND ISNULL(ltc.Huy_lop, 0) = 0
      AND mtc.Ky_dang_ky IN (${kyList})
    ORDER BY sv.Ma_sv, sk.Thu, sk.Tiet`,
    [],
    { username: 'cron-bulk-schedules' }
  );
  return result.recordset;
}

/**
 * Bulk lịch thi toàn trường
 */
async function bulkExams(pool, hocKy, namHoc) {
  const result = await safeQuery(pool,
    `SELECT
      sv.Ma_sv,
      thi.Ngay_thi, thi.Ca_thi, thi.Hinh_thuc_thi AS Hinh_thuc,
      thi.Lan_thi, thi.So_tiet,
      ph.So_phong AS Phong,
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName,
      ct.So_bao_danh
    FROM MARK_TochucThiChiTiet_TC ct
    JOIN MARK_TochucThi_TC thi ON ct.ID_thi = thi.ID_thi
    JOIN dmMonHoc mh ON thi.ID_mon = mh.ID_mon
    JOIN STU_HoSoSinhVien sv ON ct.ID_sv = sv.ID_sv
    LEFT JOIN PLAN_PhongHoc ph ON ct.ID_phong_thi = ph.ID_phong
    WHERE thi.Hoc_ky = @hocKy AND thi.Nam_hoc = @namHoc
    ORDER BY sv.Ma_sv, thi.Ngay_thi`,
    [
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: namHoc }
    ],
    { username: 'cron-bulk-exams' }
  );
  return result.recordset;
}

/**
 * Bulk điểm toàn trường — kỳ hiện tại
 */
async function bulkGrades(pool, hocKy, namHoc) {
  const result = await safeQuery(pool,
    `SELECT
      sv.Ma_sv,
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName,
      dt.Diem_thi, dt.TBCMH, dt.Diem_chu,
      dt.Lan_hoc, dt.Lan_thi
    FROM MARK_Diem_TC d
    JOIN STU_HoSoSinhVien sv ON d.ID_sv = sv.ID_sv
    JOIN dmMonHoc mh ON d.ID_mon = mh.ID_mon
    LEFT JOIN MARK_DiemThi_TC dt ON dt.ID_diem = d.ID_diem
    WHERE d.Hoc_ky = @hocKy AND d.Nam_hoc = @namHoc
    ORDER BY sv.Ma_sv, mh.Ten_mon`,
    [
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: namHoc }
    ],
    { username: 'cron-bulk-grades' }
  );
  return result.recordset;
}

/**
 * Bulk học phí toàn trường — kỳ hiện tại
 */
async function bulkFinance(pool, hocKy, namHoc) {
  const result = await safeQuery(pool,
    `SELECT
      sv.Ma_sv,
      bl.So_phieu, bl.Ngay_thu, bl.So_tien,
      bl.Lan_thu, bl.Thu_chi, bl.Noi_dung
    FROM ACC_BienLaiThu bl
    JOIN STU_HoSoSinhVien sv ON bl.ID_sv = sv.ID_sv
    WHERE bl.Hoc_ky = @hocKy AND bl.Nam_hoc = @namHoc
      AND ISNULL(bl.Huy_phieu, 0) = 0
      AND bl.So_tien > 0
    ORDER BY sv.Ma_sv, bl.Ngay_thu DESC`,
    [
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: namHoc }
    ],
    { username: 'cron-bulk-finance' }
  );
  return result.recordset;
}

/**
 * Bulk điểm rèn luyện toàn trường — kỳ hiện tại
 */
async function bulkDRL(pool, hocKy, namHoc) {
  const result = await safeQuery(pool,
    `SELECT
      sv.Ma_sv,
      SUM(drl.Diem) AS Diem
    FROM STU_DiemRenLuyen drl
    JOIN STU_HoSoSinhVien sv ON drl.ID_sv = sv.ID_sv
    WHERE drl.Hoc_ky = @hocKy AND drl.Nam_hoc = @namHoc
    GROUP BY sv.Ma_sv
    ORDER BY sv.Ma_sv`,
    [
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: namHoc }
    ],
    { username: 'cron-bulk-drl' }
  );
  return result.recordset;
}

// ═══════════════════════════════════════
// SURVEY (KHẢO SÁT) QUERIES
// ═══════════════════════════════════════

/**
 * Lấy danh sách ID_mon mà SV đã khảo sát trong năm học
 * Bảng: QLDG_KetQua_MonSinhVien{year} (tên động theo năm)
 * Logic: SV KS theo ID_lop_tc → map về ID_mon qua PLAN chain
 * 
 * @returns {Set<string>} Set of ID_mon (as string) đã khảo sát
 */
async function getStudentSurveyedCourses(pool, idSv, namHoc) {
  // Build dynamic table name: "2025-2026" → "QLDG_KetQua_MonSinhVien2025_2026"
  const tableName = `QLDG_KetQua_MonSinhVien${namHoc.replace('-', '_')}`;
  
  // Kiểm tra bảng tồn tại (tránh lỗi nếu chưa tạo bảng cho năm đó)
  const tableCheck = await safeQuery(pool,
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tableName`,
    [{ name: 'tableName', type: sql.NVarChar(200), value: tableName }],
    { username: 'survey-check' }
  );
  
  if (tableCheck.recordset.length === 0) {
    console.warn(`⚠️ [Survey] Bảng ${tableName} chưa tồn tại`);
    return new Set(); // Trả về empty → tất cả môn được hiện điểm (không có KS)
  }
  
  // Lấy ID_lop_tc đã KS → map về ID_mon
  const result = await safeQuery(pool,
    `SELECT DISTINCT mtc.ID_mon
     FROM ${tableName} kq
     JOIN PLAN_LopTinChi_TC ltc ON kq.ID_lop_tc = ltc.ID_lop_tc
     JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
     WHERE kq.ID_sv = @idSv`,
    [{ name: 'idSv', type: sql.UniqueIdentifier, value: idSv }],
    { username: 'survey-courses' }
  );
  
  return new Set(result.recordset.map(r => String(r.ID_mon)));
}

/**
 * Lấy danh sách ID_mon được miễn khảo sát
 * Bảng: QLDG_MonKhongDanhGia
 */
async function getExemptCourseIds(pool) {
  const result = await safeQuery(pool,
    `SELECT ID_mon FROM QLDG_MonKhongDanhGia`,
    [],
    { username: 'survey-exempt' }
  );
  return new Set(result.recordset.map(r => String(r.ID_mon)));
}

/**
 * Kiểm tra đợt khảo sát có đang active không
 * Bảng: QLDG_PhamViDanhGia (LoaiDanhGia_ID=14 = KS môn học)
 */
async function isSurveyActive(pool) {
  const result = await safeQuery(pool,
    `SELECT TOP 1 ID, Ten_dot_danh_gia, Tu_ngay, Den_ngay
     FROM QLDG_PhamViDanhGia
     WHERE QLDG_LoaiDanhGia_ID = 14 AND isActive = 1
       AND (NotCheckTime = 1 OR (Tu_ngay <= GETDATE() AND Den_ngay >= GETDATE()))
     ORDER BY ID DESC`,
    [],
    { username: 'survey-active' }
  );
  return result.recordset[0] || null;
}

/**
 * Lấy điểm + trạng thái khảo sát cho 1 SV
 * Chỉ trả về điểm của môn đã KS hoặc miễn KS
 * Môn chưa KS → trả về info nhưng ẩn điểm
 */
async function getStudentGradesWithSurvey(pool, idSv, hocKy, namHoc) {
  // 1. Lấy toàn bộ điểm
  const gradesResult = await safeQuery(pool,
    `SELECT
      d.ID_mon,
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName, mh.So_hoc_trinh AS credits,
      tp_cc.Diem AS processGrade, tp_gk.Diem AS midtermGrade,
      dt.Diem_thi, dt.TBCMH, dt.Diem_chu, dt.Diem_so AS grade4,
      dt.Lan_hoc, dt.Lan_thi,
      d.Hoc_ky, d.Nam_hoc
    FROM MARK_Diem_TC d
    JOIN dmMonHoc mh ON d.ID_mon = mh.ID_mon
    LEFT JOIN MARK_DiemThi_TC dt ON dt.ID_diem = d.ID_diem
    LEFT JOIN MARK_DiemThanhPhan_TC tp_cc ON tp_cc.ID_diem = d.ID_diem AND tp_cc.ID_thanh_phan = 1
    LEFT JOIN MARK_DiemThanhPhan_TC tp_gk ON tp_gk.ID_diem = d.ID_diem AND tp_gk.ID_thanh_phan = 2
    WHERE d.ID_sv = @idSv
      AND d.Hoc_ky = @hocKy AND d.Nam_hoc = @namHoc
    ORDER BY mh.Ten_mon`,
    [
      { name: 'idSv', type: sql.UniqueIdentifier, value: idSv },
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: namHoc }
    ],
    { username: 'student-grades-survey' }
  );

  // 2. Check đợt KS có active không
  const surveyDot = await isSurveyActive(pool);
  
  // Nếu không có đợt KS active → hiện hết
  if (!surveyDot) {
    return {
      grades: gradesResult.recordset.map(g => ({
        ...g,
        credits: g.credits != null ? Number(g.credits) : 0,
        grade4: g.grade4 != null ? Number(g.grade4) : null,
        surveyCompleted: true,
        ID_mon: undefined
      })),
      surveyActive: false,
      surveyInfo: null,
      stats: { total: gradesResult.recordset.length, visible: gradesResult.recordset.length, hidden: 0 }
    };
  }

  // 3. Lấy môn đã KS + môn miễn KS
  const [surveyedIds, exemptIds] = await Promise.all([
    getStudentSurveyedCourses(pool, idSv, namHoc),
    getExemptCourseIds(pool)
  ]);

  // 4. Filter: môn đã KS hoặc miễn KS → hiện điểm, còn lại → ẩn
  const grades = gradesResult.recordset.map(g => {
    const idMon = String(g.ID_mon);
    const surveyed = surveyedIds.has(idMon);
    const exempt = exemptIds.has(idMon);
    const canView = surveyed || exempt;

    return {
      courseCode: g.courseCode,
      courseName: g.courseName,
      credits: g.credits != null ? Number(g.credits) : 0,
      Diem_thi: canView ? g.Diem_thi : null,
      TBCMH: canView ? g.TBCMH : null,
      Diem_chu: canView ? g.Diem_chu : null,
      grade4: canView ? (g.grade4 != null ? Number(g.grade4) : null) : null,
      Lan_hoc: g.Lan_hoc,
      Lan_thi: g.Lan_thi,
      Hoc_ky: g.Hoc_ky,
      Nam_hoc: g.Nam_hoc,
      surveyCompleted: canView,
      surveyExempt: exempt
    };
  });

  const visible = grades.filter(g => g.surveyCompleted).length;

  return {
    grades,
    surveyActive: true,
    surveyInfo: {
      name: surveyDot.Ten_dot_danh_gia,
      deadline: surveyDot.Den_ngay
    },
    stats: {
      total: grades.length,
      visible,
      hidden: grades.length - visible
    }
  };
}

/**
 * Lấy danh sách các Khóa học có CTĐT trong CSDL trường
 */
async function getCohorts(pool) {
  try {
    const result = await safeQuery(pool,
      `SELECT DISTINCT Khoa_hoc AS cohort
       FROM PLAN_ChuongTrinhDaoTao
       WHERE Khoa_hoc IS NOT NULL AND Khoa_hoc > 0
       ORDER BY Khoa_hoc DESC`,
      [],
      { username: 'admin-curriculum' }
    );
    return result.recordset.map(r => r.cohort);
  } catch (e) {
    console.error('❌ [tuafQueries] getCohorts error:', e.message);
    return [58, 57, 56, 55, 54, 53, 52, 51, 50];
  }
}

/**
 * Lấy danh sách các Ngành / Chuyên ngành đào tạo của 1 Khóa học
 */
async function getMajorsByCohort(pool, cohort) {
  try {
    const result = await safeQuery(pool,
      `SELECT DISTINCT
         ct.ID_dt AS idDt,
         ct.Khoa_hoc AS cohort,
         ct.ID_chuyen_nganh AS idChuyenNganh,
         ct.So_hoc_trinh AS totalCredits,
         ct.So_ky_hoc AS totalSemesters,
         COALESCE(cn.Ma_chuyen_nganh, n.Ma_nganh, CAST(ct.ID_dt AS VARCHAR)) AS majorCode,
         COALESCE(cn.Chuyen_nganh, n.Ten_nganh, 'Ngành ' + CAST(ct.ID_dt AS VARCHAR)) AS majorName,
         cn.Chuyen_nganh AS specializationName,
         n.Ten_nganh AS baseMajorName
       FROM PLAN_ChuongTrinhDaoTao ct
       LEFT JOIN dmChuyenNganh cn ON ct.ID_chuyen_nganh = cn.ID_chuyen_nganh
       LEFT JOIN dmNganh n ON cn.ID_nganh = n.ID_nganh
       WHERE ct.Khoa_hoc = @cohort
       ORDER BY majorName`,
      [{ name: 'cohort', type: sql.Int, value: parseInt(cohort) || 56 }],
      { username: 'admin-curriculum' }
    );
    return result.recordset;
  } catch (e) {
    console.error('❌ [tuafQueries] getMajorsByCohort error:', e.message);
    return [];
  }
}

/**
 * Lấy danh sách toàn bộ các lớp học phần diễn ra trong ngày trên toàn trường (phục vụ Thanh tra đào tạo)
 * @param {sql.ConnectionPool} pool
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {number} thuSql - 0=Thứ 2 .. 6=Chủ Nhật
 */
async function getInspectorClassesByDate(pool, dateStr, thuSql) {
  try {
    const result = await safeQuery(pool,
      `SELECT
        sk.ID AS scheduleEventId,
        sk.Thu,
        sk.Tiet AS startPeriod,
        sk.So_tiet AS periodCount,
        sk.Tu_ngay AS fromDate,
        sk.Den_ngay AS toDate,
        sk.Tu_tuan AS fromWeek,
        sk.Den_tuan AS toWeek,
        mh.Ky_hieu AS courseCode,
        mh.Ten_mon AS courseName,
        mtc.So_tin_chi AS credits,
        COALESCE(
          CASE
            WHEN nha.Ten_nha IS NOT NULL AND nha.Ten_nha NOT LIKE '%Nông Lâm%'
              THEN LTRIM(RTRIM(REPLACE(REPLACE(ph.So_phong, CHAR(13), ''), CHAR(10), ''))) + ' (' + LTRIM(RTRIM(nha.Ten_nha)) + ')'
            ELSE LTRIM(RTRIM(REPLACE(REPLACE(ph.So_phong, CHAR(13), ''), CHAR(10), '')))
          END,
          LTRIM(RTRIM(REPLACE(REPLACE(ph.So_phong, CHAR(13), ''), CHAR(10), ''))),
          ''
        ) AS room,
        ltc.ID_lop_tc AS idLopTc,
        ltc.Ten_lop_hp AS classCode,
        COALESCE(cb.Ho_ten, 'Chưa phân công') AS teacherName,
        COALESCE(sk.ID_cb, ltc.ID_cb) AS lecturerId
      FROM PLAN_SukiensTinChi_TC sk
      JOIN PLAN_LopTinChi_TC ltc ON sk.ID_lop_tc = ltc.ID_lop_tc
      JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
      JOIN dmMonHoc mh ON mtc.ID_mon = mh.ID_mon
      LEFT JOIN dmPhongHoc ph ON sk.ID_phong = ph.ID_phong
      LEFT JOIN dmToaNha nha ON ph.ID_nha = nha.ID_nha
      LEFT JOIN HR_LyLich cb ON cb.ID_cb = COALESCE(sk.ID_cb, ltc.ID_cb)
      WHERE sk.Thu = @thuSql
        AND sk.Tu_ngay <= @targetDate AND sk.Den_ngay >= @targetDate
        AND ISNULL(ltc.Huy_lop, 0) = 0
      ORDER BY sk.Tiet ASC, ltc.Ten_lop_hp ASC`,
      [
        { name: 'thuSql', type: sql.Int, value: thuSql },
        { name: 'targetDate', type: sql.Date, value: dateStr }
      ],
      { username: 'inspector-classes-by-date' }
    );
    return (result.recordset || []).map(r => ({
      ...r,
      room: (r.room || '').replace(/[\r\n]+/g, '').trim(),
      teacherName: (r.teacherName || 'Chưa phân công').replace(/[\r\n]+/g, '').trim(),
      classCode: (r.classCode || '').replace(/[\r\n]+/g, '').trim(),
      courseName: (r.courseName || '').replace(/[\r\n]+/g, '').trim()
    }));
  } catch (e) {
    console.error('❌ [tuafQueries] getInspectorClassesByDate error:', e.message);
    return [];
  }
}

/**
 * Lấy tóm tắt CTĐT của SV (Tổng số tín chỉ yêu cầu tốt nghiệp, số kỳ)
 */
async function getStudentCurriculumSummary(pool, idSv) {
  try {
    const result = await safeQuery(pool,
      `SELECT TOP 1 
         ct.ID_dt,
         ct.So_hoc_trinh AS totalCredits,
         ct.So_ky_hoc AS totalSemesters,
         cn.Ma_chuyen_nganh AS majorCode,
         cn.Chuyen_nganh AS majorName
       FROM STU_DanhSach ds
       JOIN STU_Lop l ON ds.ID_lop = l.ID_lop
       JOIN PLAN_ChuongTrinhDaoTao ct ON ct.ID_dt = COALESCE(NULLIF(ds.ID_dt_sv, 0), l.ID_dt)
       LEFT JOIN dmChuyenNganh cn ON ct.ID_chuyen_nganh = cn.ID_chuyen_nganh
       WHERE ds.ID_sv = @idSv`,
      [{ name: 'idSv', type: sql.NVarChar(100), value: String(idSv) }],
      { username: 'student-curriculum-summary' }
    );
    return result.recordset[0] || null;
  } catch (e) {
    console.error('❌ [tuafQueries] getStudentCurriculumSummary error:', e.message);
    return null;
  }
}

/**
 * Lấy dữ liệu thanh toán giờ giảng / duyệt tiền giảng của giảng viên
 * Ưu tiên: bảng TG_Sukien_TC_DuyetTienGiang (dữ liệu chính thức từ cổng giangvien.tuaf.edu.vn)
 * Fallback: nếu chưa có quyết toán đợt duyệt, tính toán ước tính theo TKB thực tế
 */
async function getLecturerTeachingPayment(pool, idCb, hocKy, namHoc) {
  try {
    const inputs = [
      { name: 'idCb', type: sql.NVarChar(100), value: String(idCb) }
    ];

    let whereClause = 'tg.ID_cb = @idCb';
    if (hocKy) {
      inputs.push({ name: 'hocKy', type: sql.Int, value: parseInt(hocKy, 10) });
      whereClause += ' AND tg.Hoc_ky = @hocKy';
    }
    if (namHoc) {
      inputs.push({ name: 'namHocPattern', type: sql.NVarChar(50), value: `%${namHoc}%` });
      whereClause += ' AND tg.Nam_hoc LIKE @namHocPattern';
    }

    const officialQuery = `
      SELECT 
        tg.ID,
        tg.ID_lop_tc,
        tg.ID_cb,
        COALESCE(tg.Ten_mon, mh.Ten_mon, ltc.Ten_lop_hp) AS Ten_mon,
        COALESCE(tg.Ma_lop_hp, ltc.Ten_lop_hp, mh.Ky_hieu) AS Ma_lop_hp,
        COALESCE(tg.So_tin_chi, mtc.So_tin_chi, 0) AS So_tin_chi,
        COALESCE(tg.So_sv, 0) AS So_sv,
        COALESCE(tg.Tong_tiet_da_xep_lich, 0) AS Tong_tiet_da_xep_lich,
        COALESCE(tg.So_gio_quy_doi, tg.Tong_tiet_da_xep_lich, 0) AS So_gio_quy_doi,
        ISNULL(tg.hesolopdong, 1) AS hesolopdong,
        ISNULL(tg.hesoChucDanh, 1) AS hesoChucDanh,
        ISNULL(tg.hesoTH, 1) AS hesoTH,
        ISNULL(tg.hesoCLC, 1) AS hesoCLC,
        ISNULL(tg.hesoDuongXa, 1) AS hesoDuongXa,
        ISNULL(tg.hesoKhacLT, 1) AS hesoKhacLT,
        ISNULL(tg.hesoKhacTH, 1) AS hesoKhacTH,
        tg.CheckDuyet,
        tg.Date_duyet,
        tg.CheckDuyetKhoa,
        tg.Date_duyetKhoa,
        tg.CheckDuyetBM,
        tg.Date_duyetBM,
        tg.CB_xac_nhan,
        tg.Date_CB_xac_nhan,
        tg.Ghi_chu,
        tg.BoMon_phanhoi,
        tg.Khoa_phanhoi,
        tg.DaoTao_phanhoi,
        tg.Hoc_ky,
        tg.Nam_hoc,
        1 AS isOfficial
      FROM TG_Sukien_TC_DuyetTienGiang tg
      LEFT JOIN PLAN_LopTinChi_TC ltc ON tg.ID_lop_tc = ltc.ID_lop_tc
      LEFT JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
      LEFT JOIN dmMonHoc mh ON mtc.ID_mon = mh.ID_mon
      WHERE ${whereClause}
      ORDER BY tg.Hoc_ky DESC, tg.ID_lop_tc`;

    const officialRes = await safeQuery(pool, officialQuery, inputs, { username: 'lecturer-teaching-payment' });

    if (officialRes.recordset && officialRes.recordset.length > 0) {
      return officialRes.recordset;
    }

    // Fallback: Nếu kỳ này chưa có quyết toán trong TG_Sukien_TC_DuyetTienGiang, thống kê từ TKB thực tế
    const fallbackInputs = [
      { name: 'idCb', type: sql.NVarChar(100), value: String(idCb) }
    ];
    let fallbackWhere = 'COALESCE(sk.ID_cb, ltc.ID_cb) = @idCb AND ISNULL(ltc.Huy_lop, 0) = 0';
    if (hocKy && namHoc) {
      const kyDangKys = await findAllKyDangKy(pool, hocKy, namHoc, 'ALL');
      if (kyDangKys.length > 0) {
        fallbackWhere += ` AND mtc.Ky_dang_ky IN (${kyDangKys.join(',')})`;
      }
    }

    const fallbackQuery = `
      SELECT 
        ltc.ID_lop_tc,
        @idCb AS ID_cb,
        mh.Ten_mon,
        ltc.Ten_lop_hp AS Ma_lop_hp,
        ISNULL(mtc.So_tin_chi, 0) AS So_tin_chi,
        (SELECT COUNT(DISTINCT ds.ID_sv) FROM STU_DanhSachLopTinChi ds WHERE ds.ID_lop_tc = ltc.ID_lop_tc AND ISNULL(ds.Huy_dang_ky, 0) = 0) AS So_sv,
        SUM(ISNULL(sk.So_tiet, 0)) AS Tong_tiet_da_xep_lich,
        SUM(ISNULL(sk.So_tiet, 0)) AS So_gio_quy_doi,
        1 AS hesolopdong,
        1 AS hesoChucDanh,
        1 AS hesoTH,
        1 AS hesoCLC,
        1 AS hesoDuongXa,
        1 AS hesoKhacLT,
        1 AS hesoKhacTH,
        0 AS CheckDuyet,
        NULL AS Date_duyet,
        0 AS CheckDuyetKhoa,
        NULL AS Date_duyetKhoa,
        0 AS CheckDuyetBM,
        NULL AS Date_duyetBM,
        0 AS CB_xac_nhan,
        NULL AS Date_CB_xac_nhan,
        N'Ước tính theo thời khóa biểu thực tế (Chưa có quyết toán đợt duyệt từ Phòng Đào tạo)' AS Ghi_chu,
        NULL AS BoMon_phanhoi,
        NULL AS Khoa_phanhoi,
        NULL AS DaoTao_phanhoi,
        ${hocKy ? parseInt(hocKy, 10) : 1} AS Hoc_ky,
        '${namHoc || ''}' AS Nam_hoc,
        0 AS isOfficial
      FROM PLAN_LopTinChi_TC ltc
      JOIN PLAN_SukiensTinChi_TC sk ON sk.ID_lop_tc = ltc.ID_lop_tc
      JOIN PLAN_MonTinChi_TC mtc ON ltc.ID_mon_tc = mtc.ID_mon_tc
      JOIN dmMonHoc mh ON mtc.ID_mon = mh.ID_mon
      WHERE ${fallbackWhere}
      GROUP BY ltc.ID_lop_tc, mh.Ten_mon, ltc.Ten_lop_hp, mtc.So_tin_chi
      ORDER BY mh.Ten_mon`;

    const fallbackRes = await safeQuery(pool, fallbackQuery, fallbackInputs, { username: 'lecturer-payment-estimate' });
    return fallbackRes.recordset || [];
  } catch (e) {
    console.error('❌ [tuafQueries] getLecturerTeachingPayment error:', e.message);
    return [];
  }
}

/**
 * Lấy toàn bộ tổng hợp thanh toán giảng dạy theo Năm học (gồm HK1, HK2, Công việc khác & Quyết toán)
 * Tích hợp trực tiếp 3 Stored Procedures chính thức của cổng Giảng viên TUAF
 */
async function getLecturerYearlyTeachingSummary(pool, idCb, schoolYear = '2025-2026') {
  try {
    const formattedId = String(idCb).trim();

    // 1. Lấy dữ liệu tổng hợp vượt giờ / quyết toán năm từ p_KLGD_TongHopVuotGio_Get
    let tongHopRow = null;
    try {
      const thReq = pool.request()
        .input('IdCanBo', sql.NVarChar(50), formattedId)
        .input('NamHoc', sql.NVarChar(50), schoolYear)
        .input('IdDonVi', sql.Int, null)
        .input('Start', sql.Int, 0)
        .input('Length', sql.Int, 10)
        .output('recordsTotal', sql.Int, 0);
      const thRes = await thReq.execute('p_KLGD_TongHopVuotGio_Get');
      if (thRes.recordset && thRes.recordset.length > 0) {
        tongHopRow = thRes.recordset[0];
      }
    } catch (errTh) {
      console.warn('⚠️ [tuafQueries] p_KLGD_TongHopVuotGio_Get error:', errTh.message);
    }

    // 2. Lấy chi tiết các lớp học phần giảng dạy trong năm từ p_KLGD_ThongTinGioGiang_Get
    let rawClasses = [];
    try {
      const teachReq = pool.request()
        .input('HocKy', sql.Int, 0) // 0: Lấy cả HK1 và HK2
        .input('NamHoc', sql.NVarChar(50), schoolYear)
        .input('DotHoc', sql.Int, 0)
        .input('IdCanBo', sql.NVarChar(50), formattedId)
        .input('IdHe', sql.Int, null)
        .input('Start', sql.Int, 0)
        .input('Length', sql.Int, 200)
        .output('recordsTotal', sql.Int, 0);
      const teachRes = await teachReq.execute('p_KLGD_ThongTinGioGiang_Get');
      if (teachRes.recordset && teachRes.recordset.length > 0) {
        rawClasses = teachRes.recordset;
      }
    } catch (errTeach) {
      console.warn('⚠️ [tuafQueries] p_KLGD_ThongTinGioGiang_Get error:', errTeach.message);
    }

    // 3. Lấy chi tiết công việc khác từ p_KLGD_DuyetCongViecKhac_Get
    let rawOtherTasks = [];
    try {
      const cvkReq = pool.request()
        .input('IdCanBo', sql.NVarChar(50), formattedId)
        .input('HocKy', sql.Int, 0)
        .input('NamHoc', sql.NVarChar(50), schoolYear)
        .input('TenCV', sql.NVarChar(50), null)
        .input('LoaiCV', sql.NVarChar(50), null)
        .input('Start', sql.Int, 0)
        .input('Length', sql.Int, 100)
        .output('recordsTotal', sql.Int, 0);
      const cvkRes = await cvkReq.execute('p_KLGD_DuyetCongViecKhac_Get');
      if (cvkRes.recordset && cvkRes.recordset.length > 0) {
        rawOtherTasks = cvkRes.recordset;
      }
    } catch (errCvk) {
      console.warn('⚠️ [tuafQueries] p_KLGD_DuyetCongViecKhac_Get error:', errCvk.message);
    }

    // Nếu chưa có lớp trong bảng duyệt chính thức của năm đó, kích hoạt Fallback từ TKB
    let isOfficial = true;
    if (rawClasses.length === 0) {
      isOfficial = false;
      const hk1ClassesFallback = await getLecturerTeachingPayment(pool, formattedId, 1, schoolYear);
      const hk2ClassesFallback = await getLecturerTeachingPayment(pool, formattedId, 2, schoolYear);
      rawClasses = [
        ...hk1ClassesFallback.map(c => ({
          IdLopTC: c.ID_lop_tc,
          KyHieu: c.Ma_lop_hp,
          TenLop: c.Ten_mon,
          TenLopHP: c.Ma_lop_hp,
          HocKy: 1,
          NamHoc: schoolYear,
          SoTinChi: c.So_tin_chi,
          SoSinhVien: c.So_sv,
          TongTietDaXepLich: c.Tong_tiet_da_xep_lich,
          SoGioQuyDoi: c.So_gio_quy_doi,
          HeSoSiSo: c.hesolopdong || 1,
          Level: c.CheckDuyet ? 3 : 0,
          LoaiLop: 'Lý thuyết'
        })),
        ...hk2ClassesFallback.map(c => ({
          IdLopTC: c.ID_lop_tc,
          KyHieu: c.Ma_lop_hp,
          TenLop: c.Ten_mon,
          TenLopHP: c.Ma_lop_hp,
          HocKy: 2,
          NamHoc: schoolYear,
          SoTinChi: c.So_tin_chi,
          SoSinhVien: c.So_sv,
          TongTietDaXepLich: c.Tong_tiet_da_xep_lich,
          SoGioQuyDoi: c.So_gio_quy_doi,
          HeSoSiSo: c.hesolopdong || 1,
          Level: c.CheckDuyet ? 3 : 0,
          LoaiLop: 'Lý thuyết'
        }))
      ];
    }

    // Chuẩn hóa danh sách lớp học phần
    const formatClassItem = (c) => {
      const level = Number(c.Level) || 0;
      let statusText = 'Chưa duyệt';
      if (level >= 3) statusText = 'Đào tạo đã duyệt';
      else if (level === 2) statusText = 'Khoa đã duyệt';
      else if (level === 1) statusText = 'Bộ môn đã duyệt';

      return {
        id: c.ID || c.IdLopTC || Math.random().toString(),
        idLopTc: c.IdLopTC,
        courseCode: c.KyHieu || '',
        courseName: c.TenLop || c.TenMon || 'Học phần',
        classCode: c.TenLopHP || c.TenLop || '',
        credits: Number(c.SoTinChi) || 0,
        studentCount: Number(c.SoSinhVien) || 0,
        scheduledPeriods: Number(c.TongTietDaXepLich) || Number(c.TongTietDaXepLG) || 0,
        convertedHours: Number(c.SoGioQuyDoi) || 0,
        classCoefficient: Number(c.HeSoSiSo) || 1,
        courseCoefficient: Number(c.He_so_mon) || 1,
        educationType: c.TenHe || '',
        classType: c.LoaiLop || 'Lý thuyết',
        semester: Number(c.HocKy) || 1,
        schoolYear: c.NamHoc || schoolYear,
        approvalLevel: level,
        approvalStatusText: statusText,
        feedback: c.NoiDung || null
      };
    };

    const formattedClasses = rawClasses.map(formatClassItem);

    // Tách bạch theo Học kỳ 1 và Học kỳ 2
    const semester1Classes = formattedClasses.filter(c => c.semester === 1);
    const semester2Classes = formattedClasses.filter(c => c.semester === 2);
    const otherSemesterClasses = formattedClasses.filter(c => c.semester !== 1 && c.semester !== 2);

    const calcGroupSummary = (arr) => ({
      totalClasses: arr.length,
      totalCredits: arr.reduce((sum, item) => sum + item.credits, 0),
      totalPeriods: Math.round(arr.reduce((sum, item) => sum + item.scheduledPeriods, 0) * 10) / 10,
      totalConvertedHours: Math.round(arr.reduce((sum, item) => sum + item.convertedHours, 0) * 100) / 100
    });

    const summaryHK1 = calcGroupSummary(semester1Classes);
    const summaryHK2 = calcGroupSummary(semester2Classes);

    // Chuẩn hóa công việc khác
    const formattedOtherTasks = rawOtherTasks.map((t) => {
      const level = Number(t.Level) || 0;
      return {
        id: t.Id || Math.random().toString(),
        taskName: t.TenCongViec || 'Công việc chuyên môn',
        taskType: t.LoaiCongViec || 'Hoạt động đào tạo',
        semester: Number(t.HocKy) || 1,
        schoolYear: t.NamHoc || schoolYear,
        studentCount: Number(t.SoSinhVien) || 0,
        unit: t.DonViTinh || 'Giờ',
        baseHours: Math.round((Number(t.GioGoc) || 0) * 100) / 100,
        coefficient: Number(t.HeSo) || 1,
        convertedHours: Math.round((Number(t.GioQuyDoi) || 0) * 100) / 100,
        approvalLevel: level,
        approvalStatusText: level >= 2 ? 'Đã duyệt' : 'Chờ duyệt',
        createdDate: t.strCreatedDate || ''
      };
    });

    // 4. Xây dựng Bảng Quyết Toán Năm Học (Cộng trừ tất cả để ra con số cuối cùng)
    const totalTeachingHours = Math.round((summaryHK1.totalConvertedHours + summaryHK2.totalConvertedHours + 
      otherSemesterClasses.reduce((s, c) => s + c.convertedHours, 0)) * 100) / 100;
    const totalOtherTaskHours = Math.round(formattedOtherTasks.reduce((s, t) => s + t.convertedHours, 0) * 100) / 100;

    let standardHours = 300;
    let exemptHours = 0;
    let exemptPositionHours = 0;
    let exemptMaternityHours = 0;
    let homeroomHours = 0;
    let excessHours = 0;
    let unitPrice = 50000;
    let lecturerTitle = '';
    let academicDegree = '';
    let position = '';
    let department = '';

    if (tongHopRow) {
      standardHours = Number(tongHopRow.GioGDChuan) || 300;
      exemptPositionHours = Number(tongHopRow.SoGioGiamChucVu) || 0;
      exemptMaternityHours = Number(tongHopRow.GioThaiSan) || 0;
      homeroomHours = Number(tongHopRow.GioGVCN) || 0;
      exemptHours = Number(tongHopRow.SoGioDuocGiam) || (exemptPositionHours + exemptMaternityHours + homeroomHours);
      excessHours = Number(tongHopRow.SoGioVuot) || 0;
      unitPrice = Number(tongHopRow.DonGia || tongHopRow.DonGiaDaoTao) || 50000;
      lecturerTitle = tongHopRow.ChucDanh || '';
      academicDegree = tongHopRow.TrinhDo || '';
      position = tongHopRow.ChucVu || '';
      department = tongHopRow.TenDonVi || tongHopRow.Ten_khoa || '';
    } else {
      // Tính toán công thức chuẩn: (Tổng dạy + CV khác) - (Định mức chuẩn - Miễn giảm)
      excessHours = Math.round(((totalTeachingHours + totalOtherTaskHours) - (standardHours - exemptHours)) * 100) / 100;
    }

    const totalPerformedHours = Math.round((totalTeachingHours + totalOtherTaskHours) * 100) / 100;
    const requiredHoursAfterExempt = Math.max(0, Math.round((standardHours - exemptHours) * 100) / 100);
    const estimatedAmount = Math.max(0, Math.round(excessHours * unitPrice));

    const finalSummary = {
      schoolYear,
      isOfficial: isOfficial && (tongHopRow !== null),
      lecturer: {
        name: tongHopRow ? tongHopRow.HoTen : '',
        code: tongHopRow ? tongHopRow.MaCB : '',
        title: lecturerTitle,
        degree: academicDegree,
        position,
        department
      },
      // Các chỉ số quyết toán tài chính (cộng trừ để ra con số cuối cùng)
      settlement: {
        standardHours,              // Định mức giờ giảng chuẩn (A)
        exemptHours,                // Số giờ được miễn giảm (B)
        exemptBreakdown: {
          position: exemptPositionHours,
          maternity: exemptMaternityHours,
          homeroom: homeroomHours
        },
        requiredHoursAfterExempt,   // Định mức phải thực hiện sau giảm (A - B)
        totalTeachingHours,         // Khối lượng giờ giảng dạy thực hiện (C = HK1 + HK2)
        totalOtherTaskHours,        // Khối lượng giờ công việc khác thực hiện (D)
        totalPerformedHours,        // Tổng giờ thực hiện cả năm (E = C + D)
        excessHours,                // Số giờ vượt định mức đề nghị thanh toán (F = E - (A - B))
        unitPrice,                  // Đơn giá thù lao (VNĐ/giờ)
        estimatedAmount,            // Thành tiền dự kiến (F * đơn giá)
        canPayment: excessHours > 0
      }
    };

    return {
      schoolYear,
      summary: finalSummary,
      teaching: {
        semester1: {
          summary: summaryHK1,
          classes: semester1Classes
        },
        semester2: {
          summary: summaryHK2,
          classes: semester2Classes
        },
        otherSemesters: otherSemesterClasses
      },
      otherTasks: {
        totalTasks: formattedOtherTasks.length,
        totalConvertedHours: totalOtherTaskHours,
        tasks: formattedOtherTasks
      }
    };
  } catch (err) {
    console.error('❌ [tuafQueries] getLecturerYearlyTeachingSummary error:', err.message);
    throw err;
  }
}

module.exports = {
  findStudentId,
  getStudentInfo,
  findLecturerId,
  getCurrentTerm,
  findKyDangKy,
  findAllKyDangKy,
  getStudentSchedule,
  getStudentExams,
  getStudentGrades,
  getAllStudentGrades,
  getStudentFinance,
  getAllStudentFinance,
  getStudentExemptions,
  getStudentFinanceSummaryByTerm,
  getStudentCumulativeFinance,
  getStudentNamVietFinance,
  getSchoolNews,
  getStudentDRL,
  getStudentCurriculum,
  getStudentCurriculumSummary,
  getLecturerSchedule,
  getLecturerExams,
  getLecturerTeachingPayment,
  getLecturerYearlyTeachingSummary,
  getStudentSurveyedCourses,
  getExemptCourseIds,
  isSurveyActive,
  getStudentGradesWithSurvey,
  bulkSchedules,
  bulkExams,
  bulkGrades,
  bulkFinance,
  bulkDRL,
  getCohorts,
  getMajorsByCohort,
  getClassStudents,
  getHomeroomClasses,
  getHomeroomStudentsRegistration,
  getHomeroomStudentsFinance,
  parseNamVietBalance,
  getInspectorClassesByDate
};

