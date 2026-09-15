const path = require('path');
const { execFile } = require('child_process');
const namvietConnector = require('./namvietConnector');
const sql = require('mssql');
const MasterCurriculum = require('../models/MasterCurriculum');

/**
 * Service xử lý parse Excel, đối soát với CSDL SQL Server trường và lưu MasterCurriculum
 */
class ExcelCurriculumService {

  /**
   * Gọi script Python để parse file Excel CTĐT
   */
  static parseExcel(filePath) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, 'parsers', 'parse_excel_curriculum.py');
      execFile('python3', [scriptPath, filePath], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(`Lỗi khi parse file Excel: ${stderr || err.message}`));
        }
        try {
          const data = JSON.parse(stdout);
          if (data.error) {
            return reject(new Error(data.error));
          }
          resolve(data);
        } catch (e) {
          reject(new Error(`Không thể phân tích dữ liệu JSON trả về từ parser: ${e.message}`));
        }
      });
    });
  }

  /**
   * So sánh danh sách môn từ Excel với CSDL SQL Server của Nhà trường
   */
  static async compareWithSchoolDb(excelCourses, majorCode = '7480201', cohort = '56', idDt = null) {
    let pool = null;
    let schoolCtdtCourses = [];
    let schoolAllSubjects = [];
    let dbConnected = false;

    const parsedCohort = parseInt(cohort) || 56;
    const parsedIdDt = idDt ? parseInt(idDt) : null;

    try {
      pool = await namvietConnector.getPool();
      dbConnected = true;

      // 1. Tìm CTĐT của ngành & khóa trong CSDL trường
      const req = pool.request();
      req.input('khoaHoc', sql.Int, parsedCohort);

      let queryCondition = '';
      if (parsedIdDt) {
        req.input('idDt', sql.Int, parsedIdDt);
        queryCondition = 'WHERE ct.ID_dt = @idDt';
      } else {
        req.input('majorCode', sql.NVarChar(50), String(majorCode).trim());
        queryCondition = `WHERE ct.Khoa_hoc = @khoaHoc AND (
          cn.Ma_chuyen_nganh = @majorCode OR n.Ma_nganh = @majorCode
          OR ct.ID_chuyen_nganh = 126 OR ct.ID_dt = 1044
        )`;
      }

      const ctdtRes = await req.query(`
        SELECT 
          ct.ID_dt, ct.Khoa_hoc, ct.So_hoc_trinh AS Tong_SHT,
          ctd.Ky_thu AS schoolSemester,
          ctd.So_hoc_trinh AS schoolCredits,
          ctd.Ly_thuyet AS schoolTheory,
          ctd.Thuc_hanh AS schoolPractice,
          ctd.Tu_chon AS isElective,
          mh.Ky_hieu AS schoolCourseCode,
          mh.Ten_mon AS schoolCourseName
        FROM PLAN_ChuongTrinhDaoTao ct
        JOIN PLAN_ChuongTrinhDaoTaoChiTiet ctd ON ct.ID_dt = ctd.ID_dt
        JOIN dmMonHoc mh ON ctd.ID_mon = mh.ID_mon
        LEFT JOIN dmChuyenNganh cn ON ct.ID_chuyen_nganh = cn.ID_chuyen_nganh
        LEFT JOIN dmNganh n ON cn.ID_nganh = n.ID_nganh
        ${queryCondition}
        ORDER BY ctd.Ky_thu, mh.Ten_mon
      `);
      schoolCtdtCourses = ctdtRes.recordset;

      // 2. Lấy danh mục môn học trong dmMonHoc để đối chiếu
      const allMhRes = await pool.request().query(`
        SELECT ID_mon, Ky_hieu AS courseCode, Ten_mon AS courseName, So_hoc_trinh AS credits
        FROM dmMonHoc
      `);
      schoolAllSubjects = allMhRes.recordset;
    } catch (err) {
      console.warn('⚠️ [ExcelCurriculumService] Không kết nối được SQL Server trường, đối soát offline:', err.message);
    }

    // Tạo Map tra cứu từ CSDL trường
    const schoolMapByCode = new Map();
    const schoolMapByName = new Map();
    for (const sc of schoolCtdtCourses) {
      if (sc.schoolCourseCode) schoolMapByCode.set(sc.schoolCourseCode.toUpperCase().trim(), sc);
      if (sc.schoolCourseName) schoolMapByName.set(sc.schoolCourseName.toLowerCase().trim(), sc);
    }

    const allSubjectMap = new Map();
    for (const sub of schoolAllSubjects) {
      if (sub.courseCode) allSubjectMap.set(sub.courseCode.toUpperCase().trim(), sub);
    }

    // Thống kê phân kỳ tín chỉ từ CSDL trường (lấy từ Kỳ 1 trở đi, Kỳ 0 là kho tự chọn dự phòng)
    const semesterCredits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    const semesterCourseCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    let reserveCredits = 0;
    let reserveCount = 0;
    const reserveCourses = [];

    for (const sc of schoolCtdtCourses) {
      const sem = sc.schoolSemester;
      const cr = sc.schoolCredits || 0;
      if (sem !== null && sem !== undefined && sem >= 1) {
        semesterCredits[sem] = (semesterCredits[sem] || 0) + cr;
        semesterCourseCounts[sem] = (semesterCourseCounts[sem] || 0) + 1;
      } else if (sem === 0) {
        reserveCredits += cr;
        reserveCount++;
        reserveCourses.push({
          code: sc.schoolCourseCode,
          name: sc.schoolCourseName,
          credits: cr
        });
      }
    }

    const totalScheduledCredits = Object.values(semesterCredits).reduce((a, b) => a + b, 0);
    // Tính chuẩn tích lũy tốt nghiệp từ Excel (không tính các môn điều kiện như GDTC, GDQP...)
    const excelGraduationCredits = excelCourses
      ? excelCourses.filter(c => !c.isCondition).reduce((s, c) => s + (c.credits || 0), 0)
      : 153;
    const totalGraduationCredits = excelGraduationCredits > 0 ? excelGraduationCredits : 153;
    const isDeficient = totalScheduledCredits < totalGraduationCredits;
    const deficitCredits = isDeficient ? (totalGraduationCredits - totalScheduledCredits) : 0;
    const deficitWarning = isDeficient 
      ? `Tổng tín chỉ đã phân kỳ (từ Kỳ 1 trở đi) trên phần mềm đào tạo hiện là ${totalScheduledCredits}/${totalGraduationCredits} TC (còn thiếu ${deficitCredits} TC so với chuẩn tốt nghiệp). Kỳ 0 đang chứa ${reserveCount} môn tự chọn dự phòng (${reserveCredits} TC). Vui lòng kiểm tra phần mềm quản lý đào tạo!`
      : null;

    const comparisonList = [];
    const matchedSchoolCodes = new Set();
    let matchedCount = 0;
    let mismatchCount = 0;
    let missingCount = 0;

    // So sánh từng môn trong Excel với trường: chỉ so sai khác về mã môn, tên môn, số tín chỉ, lý thuyết, thực hành
    for (const ec of excelCourses) {
      const codeKey = (ec.courseCode || '').toUpperCase().trim();
      const nameKey = (ec.courseName || '').toLowerCase().trim();

      const sc = schoolMapByCode.get(codeKey) || schoolMapByName.get(nameKey);
      const diffs = [];
      let status = 'matched';

      if (sc) {
        matchedSchoolCodes.add(sc.schoolCourseCode.toUpperCase().trim());

        // 1. So sánh mã môn
        if (codeKey !== sc.schoolCourseCode.toUpperCase().trim()) {
          diffs.push(`Mã môn khác: Excel "${ec.courseCode}" vs Trường "${sc.schoolCourseCode}"`);
        }

        // 2. So sánh tên môn (bỏ khoảng trắng thừa)
        if (ec.courseName.replace(/\s+/g, ' ').toLowerCase() !== sc.schoolCourseName.replace(/\s+/g, ' ').toLowerCase()) {
          diffs.push(`Tên môn khác: Excel "${ec.courseName}" vs Trường "${sc.schoolCourseName}"`);
        }

        // 3. So sánh số tín chỉ
        if (ec.credits !== sc.schoolCredits) {
          diffs.push(`Số TC lệch: Excel ${ec.credits} vs Trường ${sc.schoolCredits}`);
        }

        // 4. So sánh lý thuyết
        if (sc.schoolTheory !== null && sc.schoolTheory !== undefined && ec.theoryHours !== sc.schoolTheory && (ec.theoryHours > 0 || sc.schoolTheory > 0)) {
          diffs.push(`Lý thuyết lệch: Excel ${ec.theoryHours} vs Trường ${sc.schoolTheory} tiết`);
        }

        // 5. So sánh thực hành
        if (sc.schoolPractice !== null && sc.schoolPractice !== undefined && ec.practiceHours !== sc.schoolPractice && (ec.practiceHours > 0 || sc.schoolPractice > 0)) {
          diffs.push(`Thực hành lệch: Excel ${ec.practiceHours} vs Trường ${sc.schoolPractice} tiết`);
        }

        if (diffs.length > 0) {
          status = 'mismatch';
          mismatchCount++;
        } else {
          matchedCount++;
        }

        // Phân kỳ lấy theo phần mềm trường: Kỳ 1-8 hoặc Kỳ 0 (Tự chọn dự phòng)
        const effectiveSemester = sc.schoolSemester >= 1 ? sc.schoolSemester : (sc.schoolSemester === 0 ? 0 : ec.semester);
        const isElectiveReserve = sc.schoolSemester === 0;

        comparisonList.push({
          courseCode: ec.courseCode,
          courseName: ec.courseName,
          courseNameEn: ec.courseNameEn || '',
          credits: ec.credits,
          theoryHours: ec.theoryHours,
          practiceHours: ec.practiceHours,
          semester: effectiveSemester,
          excelSemester: ec.excelSemester, // Cột B trong Khung CTĐT của Excel
          semesterText: isElectiveReserve ? 'Tự chọn dự phòng (Kỳ 0)' : `Kỳ ${effectiveSemester}`,
          isElectiveReserve,
          blockCode: ec.subBlockCode || ec.blockCode,
          majorBlockCode: ec.majorBlockCode || 'I',
          majorBlockName: ec.majorBlockName || ec.blockName || 'Khối kiến thức giáo dục đại cương',
          subBlockCode: ec.subBlockCode || 'I.1',
          blockName: ec.majorBlockName || ec.blockName,
          subBlockName: ec.subBlockName,
          courseType: ec.courseType,
          isElective: ec.isElective || isElectiveReserve,
          isCondition: ec.isCondition,
          // Thông tin trường
          schoolCourseCode: sc.schoolCourseCode,
          schoolCourseName: sc.schoolCourseName,
          schoolCredits: sc.schoolCredits,
          schoolSemester: sc.schoolSemester,
          schoolTheory: sc.schoolTheory,
          schoolPractice: sc.schoolPractice,
          status,
          diffs
        });
      } else {
        // Môn thiếu trên trường
        const existsInGeneral = allSubjectMap.has(codeKey);
        status = 'missing';
        missingCount++;
        diffs.push(existsInGeneral 
          ? 'Đã có trong danh mục môn chung nhưng chưa được gán vào CTĐT của ngành' 
          : 'Chưa có mã môn trên hệ thống trường');

        comparisonList.push({
          courseCode: ec.courseCode,
          courseName: ec.courseName,
          courseNameEn: ec.courseNameEn || '',
          credits: ec.credits,
          theoryHours: ec.theoryHours,
          practiceHours: ec.practiceHours,
          semester: ec.semester,
          excelSemester: ec.excelSemester, // Cột B trong Khung CTĐT của Excel
          semesterText: `Kỳ ${ec.semester || '?'} (Theo Excel)`,
          isElectiveReserve: false,
          blockCode: ec.subBlockCode || ec.blockCode,
          majorBlockCode: ec.majorBlockCode || 'I',
          majorBlockName: ec.majorBlockName || ec.blockName || 'Khối kiến thức giáo dục đại cương',
          subBlockCode: ec.subBlockCode || 'I.1',
          blockName: ec.majorBlockName || ec.blockName,
          subBlockName: ec.subBlockName,
          courseType: ec.courseType,
          isElective: ec.isElective,
          isCondition: ec.isCondition,
          schoolCourseCode: null,
          schoolCourseName: null,
          schoolCredits: null,
          schoolSemester: null,
          schoolTheory: null,
          schoolPractice: null,
          status,
          diffs
        });
      }
    }

    // Các môn có trên trường nhưng không có trong Excel
    const extraInSchool = [];
    for (const sc of schoolCtdtCourses) {
      if (!matchedSchoolCodes.has(sc.schoolCourseCode.toUpperCase().trim())) {
        extraInSchool.push({
          schoolCourseCode: sc.schoolCourseCode,
          schoolCourseName: sc.schoolCourseName,
          schoolCredits: sc.schoolCredits,
          schoolSemester: sc.schoolSemester,
          status: 'extra_in_school',
          diffs: ['Môn có trên hệ thống trường nhưng không có trong Khung chuẩn Excel']
        });
      }
    }

    return {
      dbConnected,
      summary: {
        totalExcelCourses: excelCourses.length,
        matchedCount,
        mismatchCount,
        missingCount,
        extraInSchoolCount: extraInSchool.length,
        totalGraduationCredits,
        conditionCredits: excelCourses.filter(c => c.isCondition).reduce((s, c) => s + (c.credits || 0), 0)
      },
      semesterSummary: {
        totalScheduledCredits,
        totalGraduationCredits,
        isDeficient,
        deficitCredits,
        deficitWarning,
        semesterCredits,
        semesterCourseCounts,
        reserveCredits,
        reserveCount,
        reserveCourses
      },
      comparison: comparisonList,
      extraInSchool
    };
  }

  /**
   * Lưu khung chuẩn vào MasterCurriculum
   */
  static async saveMasterCurriculum(courses, majorCode = '7480201', cohort = 'K56', majorName = 'Công nghệ và đổi mới sáng tạo') {
    // 1. Xóa khung cũ của ngành & khóa nếu có
    await MasterCurriculum.destroy({
      where: { majorCode, cohort }
    });

    // 2. Chèn mới danh sách môn chuẩn
    const recordsToInsert = courses.map((c, idx) => ({
      majorCode,
      majorName,
      cohort,
      stt: c.stt || idx + 1,
      courseCode: c.courseCode,
      courseName: c.courseName,
      courseNameEn: c.courseNameEn || '',
      credits: c.credits || 0,
      theoryHours: c.theoryHours || 0,
      practiceHours: c.practiceHours || 0,
      semester: c.semester !== undefined && c.semester !== null ? c.semester : 1,
      excelSemester: c.excelSemester !== undefined ? c.excelSemester : null,
      majorBlockCode: c.majorBlockCode || c.blockCode || 'I',
      majorBlockName: c.majorBlockName || c.blockName || 'I. Khối kiến thức giáo dục đại cương',
      subBlockCode: c.subBlockCode || '',
      subBlockName: c.subBlockName || '',
      blockCode: c.blockCode || c.subBlockCode || 'I',
      blockName: c.blockName || c.majorBlockName || 'Khối kiến thức giáo dục đại cương',
      courseType: c.courseType || (c.isCondition ? 'Điều kiện' : (c.isElective ? 'Tự chọn' : 'Bắt buộc')),
      isElective: Boolean(c.isElective),
      electiveGroup: c.electiveGroup || '',
      isCondition: Boolean(c.isCondition),
      isActive: true
    }));

    const created = await MasterCurriculum.bulkCreate(recordsToInsert);
    return {
      success: true,
      count: created.length,
      majorCode,
      cohort
    };
  }

  /**
   * Lấy khung chuẩn đã lưu
   */
  static async getMasterCurriculum(majorCode = '7480201', cohort = 'K56') {
    return MasterCurriculum.findAll({
      where: { majorCode, cohort, isActive: true },
      order: [['semester', 'ASC'], ['stt', 'ASC'], ['courseName', 'ASC']]
    });
  }
}

module.exports = ExcelCurriculumService;
