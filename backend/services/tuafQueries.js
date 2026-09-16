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
 * Lấy tất cả Ky_dang_ky cho 1 kỳ (có thể nhiều đợt trong cùng 1 HK)
 */
async function findAllKyDangKy(pool, hocKy, namHoc) {
  const cleanNamHoc = String(namHoc || '').replace('_', '-');
  const altNamHoc = cleanNamHoc.replace('-', '_');

  const result = await safeQuery(pool,
    `SELECT Ky_dang_ky FROM PLAN_HocKyDangKy_TC
     WHERE Hoc_ky = @hocKy AND (Nam_hoc = @namHoc OR Nam_hoc = @altNamHoc)
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
async function getStudentSchedule(pool, idSv, hocKy, namHoc) {
  // Lấy tất cả Ky_dang_ky cho kỳ này
  const kyDangKys = await findAllKyDangKy(pool, hocKy, namHoc);
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
 * Lấy lịch thi của 1 SV trong 1 kỳ
 * Bảng: MARK_TochucThi_TC (chứa Ngay_thi, Ca_thi, Phong...) 
 *        + MARK_TochucThiChiTiet_TC (chứa ID_sv)
 */
async function getStudentExams(pool, idSv, hocKy, namHoc) {
  const result = await safeQuery(pool,
    `SELECT
      thi.Ngay_thi, thi.Ca_thi, thi.Hinh_thuc_thi AS Hinh_thuc,
      thi.Lan_thi, thi.Nhom_tiet, thi.So_tiet,
      ph.So_phong AS Phong,
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName,
      ct.So_bao_danh
    FROM MARK_TochucThiChiTiet_TC ct
    JOIN MARK_TochucThi_TC thi ON ct.ID_thi = thi.ID_thi
    JOIN dmMonHoc mh ON thi.ID_mon = mh.ID_mon
    LEFT JOIN PLAN_PhongHoc ph ON ct.ID_phong_thi = ph.ID_phong
    WHERE ct.ID_sv = @idSv
      AND thi.Hoc_ky = @hocKy AND thi.Nam_hoc = @namHoc
    ORDER BY thi.Ngay_thi, thi.Ca_thi`,
    [
      { name: 'idSv', type: sql.UniqueIdentifier, value: idSv },
      { name: 'hocKy', type: sql.Int, value: hocKy },
      { name: 'namHoc', type: sql.NVarChar(50), value: namHoc }
    ],
    { username: 'student-exams' }
  );
  return result.recordset;
}

/**
 * Lấy điểm của 1 SV trong 1 kỳ
 * Bảng: MARK_Diem_TC → MARK_DiemThi_TC (điểm thi) + MARK_DiemThanhPhan_TC (TP)
 */
async function getStudentGrades(pool, idSv, hocKy, namHoc) {
  const result = await safeQuery(pool,
    `SELECT
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName,
      dt.Diem_thi, dt.TBCMH, dt.Diem_chu,
      dt.Lan_hoc, dt.Lan_thi,
      d.Hoc_ky, d.Nam_hoc
    FROM MARK_Diem_TC d
    JOIN dmMonHoc mh ON d.ID_mon = mh.ID_mon
    LEFT JOIN MARK_DiemThi_TC dt ON dt.ID_diem = d.ID_diem
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
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName,
      dt.Diem_thi, dt.TBCMH, dt.Diem_chu,
      dt.Lan_hoc, dt.Lan_thi,
      d.Hoc_ky, d.Nam_hoc
    FROM MARK_Diem_TC d
    JOIN dmMonHoc mh ON d.ID_mon = mh.ID_mon
    LEFT JOIN MARK_DiemThi_TC dt ON dt.ID_diem = d.ID_diem
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
async function getLecturerSchedule(pool, idCb, hocKy, namHoc) {
  const kyDangKys = await findAllKyDangKy(pool, hocKy, namHoc);
  if (kyDangKys.length === 0) return [];
  const kyList = kyDangKys.join(',');

  const result = await safeQuery(pool,
    `SELECT
      sk.Thu, sk.Tiet, sk.So_tiet, sk.Tu_ngay, sk.Den_ngay, sk.Tu_tuan, sk.Den_tuan,
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName,
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
    const balance = hasKy ? (row.kyBalance || 0) : (row.allBalance || 0);

    // QUY TẮC KẾ TOÁN TUAF:
    // Thieu_thua > 0: Sinh viên CÒN THIẾU TIỀN (NỢ)
    // Thieu_thua < 0: Sinh viên NỘP THỪA
    // Thieu_thua = 0: ĐÃ NỘP ĐỦ / KHÔNG NỢ
    let status = 'settled';
    if (balance > 0) {
      status = 'debt'; // Còn nợ
      debtCount++;
      totalDebtAmount += balance;
    } else if (balance < 0) {
      status = 'surplus'; // Nộp thừa
      surplusCount++;
    } else {
      settledCount++;
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
      balance,
      debtAmount: balance > 0 ? balance : 0,
      surplusAmount: balance < 0 ? Math.abs(balance) : 0,
      status,
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
      mh.Ky_hieu AS courseCode, mh.Ten_mon AS courseName,
      dt.Diem_thi, dt.TBCMH, dt.Diem_chu,
      dt.Lan_hoc, dt.Lan_thi,
      d.Hoc_ky, d.Nam_hoc
    FROM MARK_Diem_TC d
    JOIN dmMonHoc mh ON d.ID_mon = mh.ID_mon
    LEFT JOIN MARK_DiemThi_TC dt ON dt.ID_diem = d.ID_diem
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
        ...g, surveyCompleted: true, ID_mon: undefined
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
      Diem_thi: canView ? g.Diem_thi : null,
      TBCMH: canView ? g.TBCMH : null,
      Diem_chu: canView ? g.Diem_chu : null,
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
  getSchoolNews,
  getStudentDRL,
  getStudentCurriculum,
  getLecturerSchedule,
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
  getInspectorClassesByDate
};
