/**
 * Phân quyền giảng viên cho dữ liệu sinh viên (đọc trực tiếp SQL Server mỗi request, không cache):
 *  - requireLecturer:      chỉ tài khoản vai trò 'lecturer'
 *  - requireHomeroomOf:    GVCN HIỆN TẠI của lớp :idLop (STU_Lop.ID_cb, lớp còn SV đang học)
 *  - requireTeachingClass: GV được phân công dạy lớp tín chỉ :idLopTc (admin của app vẫn được xem)
 * Mọi lỗi tra cứu đều từ chối truy cập (fail closed).
 */

// Mã sinh viên TUAF: chữ, số, dấu chấm, gạch ngang, gạch dưới (VD: DTN2453110001, dtn24cn04004)
const STUDENT_CODE_RE = /^[A-Za-z0-9._-]{1,30}$/;
const POSITIVE_INT_RE = /^[1-9][0-9]{0,8}$/;

function parsePositiveInt(value) {
  const s = String(value ?? '');
  return POSITIVE_INT_RE.test(s) ? Number(s) : null;
}

function isValidStudentCode(value) {
  return typeof value === 'string' && STUDENT_CODE_RE.test(value);
}

/**
 * Lấy ID_cb của giảng viên. CHỈ gọi sau khi đã chắc chắn user.role === 'lecturer'
 * (với sinh viên, cột tuafStudentId chứa ID_sv chứ không phải ID_cb).
 */
async function resolveLecturerIdCb(pool, user, findLecturerId) {
  if (user.tuafStudentId) return user.tuafStudentId;
  const cb = await findLecturerId(pool, user.username);
  if (cb && cb.ID_cb) {
    user.tuafStudentId = cb.ID_cb;
    await user.save().catch(() => {});
    return cb.ID_cb;
  }
  return null;
}

const deny = (res, status, message) => res.status(status).json({ success: false, message });

function createLecturerAccess({ getPool, tuafQueries, log = console }) {
  const requireLecturer = (req, res, next) => {
    if (!req.user || req.user.role !== 'lecturer') {
      return deny(res, 403, 'Chức năng chỉ dành cho Giảng viên!');
    }
    return next();
  };

  const requireHomeroomOf = async (req, res, next) => {
    if (!req.user || req.user.role !== 'lecturer') {
      return deny(res, 403, 'Chức năng chỉ dành cho Giảng viên chủ nhiệm!');
    }
    const idLop = parsePositiveInt(req.params.idLop);
    if (!idLop) return deny(res, 400, 'Mã lớp không hợp lệ!');
    try {
      const pool = await getPool();
      const idCb = await resolveLecturerIdCb(pool, req.user, tuafQueries.findLecturerId);
      if (!idCb || !(await tuafQueries.isHomeroomOf(pool, idCb, idLop))) {
        return deny(res, 403, 'Bạn không phải giảng viên chủ nhiệm hiện tại của lớp này!');
      }
      req.homeroom = { pool, idCb, idLop };
      return next();
    } catch (err) {
      log.error('❌ [HomeroomAccess] Lỗi kiểm tra quyền GVCN:', err.message);
      return deny(res, 503, 'Không kiểm tra được quyền truy cập, vui lòng thử lại sau!');
    }
  };

  const requireTeachingClass = async (req, res, next) => {
    const role = req.user && req.user.role;
    if (role !== 'lecturer' && role !== 'admin') {
      return deny(res, 403, 'Quyền truy cập bị từ chối!');
    }
    const idLopTc = parsePositiveInt(req.params.idLopTc);
    if (!idLopTc) return deny(res, 400, 'Mã lớp tín chỉ không hợp lệ!');
    try {
      const pool = await getPool();
      if (role === 'lecturer') {
        const idCb = await resolveLecturerIdCb(pool, req.user, tuafQueries.findLecturerId);
        if (!idCb || !(await tuafQueries.isTeachingClass(pool, idCb, idLopTc))) {
          return deny(res, 403, 'Bạn không được phân công giảng dạy lớp tín chỉ này!');
        }
      }
      req.teaching = { pool, idLopTc };
      return next();
    } catch (err) {
      log.error('❌ [TeachingAccess] Lỗi kiểm tra phân công giảng dạy:', err.message);
      return deny(res, 503, 'Không kiểm tra được quyền truy cập, vui lòng thử lại sau!');
    }
  };

  return { requireLecturer, requireHomeroomOf, requireTeachingClass };
}

module.exports = {
  STUDENT_CODE_RE,
  parsePositiveInt,
  isValidStudentCode,
  resolveLecturerIdCb,
  createLecturerAccess
};
