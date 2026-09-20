const ScheduleStrategy = require('./ScheduleStrategy');
const namvietConnector = require('../services/namvietConnector');
const tuafQueries = require('../services/tuafQueries');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const Grade = require('../models/Grade');
const Finance = require('../models/Finance');
const Curriculum = require('../models/Curriculum');
const News = require('../models/News');

/**
 * DatabaseStrategy — Đọc dữ liệu từ SQL Server TUAF và cache vào PostgreSQL
 * 
 * ⚠️ CHỈ ĐỌC (READ-ONLY) từ SQL Server
 * ⚠️ GHI cache vào PostgreSQL nội bộ (giống CrawlerStrategy)
 */
class DatabaseStrategy extends ScheduleStrategy {

  /**
   * Lấy dữ liệu kỳ hiện tại từ SQL Server → cache PG
   * Dùng khi: login, forceSync
   */
  async getSchedule(user, decryptedPassword, options = { semester: '1', schoolYear: '2026' }) {
    console.log(`🔌 [Strategy: Database] Đang đọc dữ liệu cho ${user.username} (Role: ${user.role})...`);

    const pool = await namvietConnector.getPool();

    // 1. Lookup ID trong SQL Server (cache trong user.tuafStudentId)
    let entityId = user.tuafStudentId;
    let svInfo = null;

    if (user.role === 'student' || !user.role || user.role === 'lecturer') {
      if (!entityId) {
        if (user.role === 'lecturer') {
          const gv = await tuafQueries.findLecturerId(pool, user.username);
          if (!gv) throw new Error(`Không tìm thấy giảng viên "${user.username}" trong hệ thống TUAF`);
          entityId = gv.ID_cb;
        } else {
          const sv = await tuafQueries.findStudentId(pool, user.username);
          if (!sv) throw new Error(`Không tìm thấy sinh viên "${user.username}" trong hệ thống TUAF`);
          entityId = sv.ID_sv;
          svInfo = sv;
        }
        // Cache ID để không lookup lại
        user.tuafStudentId = entityId;
      }

      if (!svInfo && user.role !== 'lecturer') {
        svInfo = await tuafQueries.getStudentInfo(pool, entityId);
      }
    }

    // 2. Xác định kỳ học (chuẩn hóa 2026-2027, 2026_2027, 2026)
    const hocKy = parseInt(options.semester || '1') || 1;
    let namHoc;
    const sy = String(options.schoolYear || '2026').replace('_', '-');
    if (sy.includes('-')) {
      namHoc = sy;
    } else {
      const startYr = parseInt(sy) || 2026;
      namHoc = `${startYr}-${startYr + 1}`;
    }
    const formattedSemester = `HocKy${hocKy}`;
    const formattedSchoolYear = namHoc;

    // 3. READ từ SQL Server (parallel cho tốc độ)
    let scheduleList = [];
    let examList = [];
    let gradeList = [];
    let financeRaw = [];
    let drlData = null;

    if (user.role === 'lecturer') {
      const rawSchedules = await tuafQueries.getLecturerSchedule(pool, entityId, hocKy, namHoc);
      const rawExams = await tuafQueries.getLecturerExams(pool, entityId, hocKy, namHoc, rawSchedules);
      scheduleList = this._transformSchedules(rawSchedules, formattedSemester, formattedSchoolYear);
      examList = this._transformLecturerExams(rawExams);
    } else {
      // Student: lấy tất cả data song song
      const [rawSchedules, rawExams, rawGrades, rawFinance, rawDrl] = await Promise.all([
        tuafQueries.getStudentSchedule(pool, entityId, hocKy, namHoc),
        tuafQueries.getStudentExams(pool, entityId, hocKy, namHoc),
        tuafQueries.getStudentGrades(pool, entityId, hocKy, namHoc),
        tuafQueries.getStudentFinance(pool, entityId, hocKy, namHoc),
        tuafQueries.getStudentDRL(pool, entityId, hocKy, namHoc)
      ]);

      scheduleList = this._transformSchedules(rawSchedules, formattedSemester, formattedSchoolYear);
      examList = this._transformStudentExams(rawExams);
      gradeList = this._transformGrades(rawGrades);
      financeRaw = rawFinance;
      drlData = rawDrl;
    }

    // 4. Cache vào PostgreSQL nội bộ
    console.log(`💾 [Strategy: Database] Đang cache vào PostgreSQL cho ${user.username}...`);
    await this._cacheToPostgres(user, formattedSemester, formattedSchoolYear, {
      scheduleList, examList, gradeList, financeRaw, drlData
    });

    // 5. Cập nhật user profile
    const fullName = svInfo ? svInfo.Ho_ten : (user.fullName || user.username);
    const className = svInfo ? (svInfo.Ma_lop || '') : (user.className || '');
    const department = 'TUAF';

    user.fullName = fullName;
    user.className = className;
    user.department = department;
    user.lastSyncedAt = new Date();
    await user.save();

    console.log(`✅ [Strategy: Database] Hoàn tất cho ${user.username}! (${scheduleList.length} TKB, ${gradeList.length} điểm, ${examList.length} thi)`);

    return {
      fullName,
      className,
      department,
      lastSyncedAt: user.lastSyncedAt,
      scheduleList,
      examList,
      gradeList,
      schedules: scheduleList,
      exams: examList,
      grades: gradeList,
      financeData: this._aggregateFinance(financeRaw)
    };
  }

  /**
   * Đồng bộ lịch sử TẤT CẢ kỳ — chỉ chạy 1 lần
   */
  async syncHistory(user, decryptedPassword) {
    if (user.role !== 'student') {
      return { message: 'Chức năng lịch sử hiện chỉ hỗ trợ Sinh viên.' };
    }

    console.log(`📚 [Strategy: Database] Đồng bộ lịch sử cho ${user.username}...`);
    const pool = await namvietConnector.getPool();
    let entityId = user.tuafStudentId;
    if (!entityId) {
      const sv = await tuafQueries.findStudentId(pool, user.username);
      if (!sv) throw new Error(`Không tìm thấy sinh viên "${user.username}" trong hệ thống TUAF`);
      entityId = sv.ID_sv;
      user.tuafStudentId = entityId;
      await user.save();
    }

    // READ tất cả điểm + học phí + CTĐT + Tin tức thông báo + Miễn giảm
    const [rawAllGrades, rawAllFinance, rawCurriculum, rawNews, rawExemptions, rawSummaryTerms] = await Promise.all([
      tuafQueries.getAllStudentGrades(pool, entityId),
      tuafQueries.getAllStudentFinance(pool, entityId),
      tuafQueries.getStudentCurriculum(pool, entityId),
      tuafQueries.getSchoolNews(pool, user.role),
      tuafQueries.getStudentExemptions(pool, entityId),
      tuafQueries.getStudentFinanceSummaryByTerm(pool, entityId)
    ]);

    // Cache Tin Tức Thông Báo từ Nhà trường
    if (rawNews && rawNews.length > 0) {
      for (const item of rawNews) {
        const existing = await News.findOne({ where: { newsId: item.newsId } });
        const newsPayload = {
          newsId: item.newsId,
          title: item.title,
          summary: item.summary,
          content: item.content,
          imageUrl: item.imageUrl,
          postDate: item.postDate,
          targetStudent: item.targetStudent,
          targetLecturer: item.targetLecturer,
          category: item.category
        };
        if (existing) {
          await existing.update(newsPayload);
        } else {
          await News.create(newsPayload);
        }
      }
    }

    // Nhóm điểm theo kỳ và cache
    const gradesByKey = {};
    if (rawAllGrades && rawAllGrades.length > 0) {
      // Xóa TOÀN BỘ điểm cũ của user để loại bỏ triệt để các kỳ ma và môn ma do crawler cũ tạo ra
      await Grade.destroy({ where: { userId: user.id } });

      for (const r of rawAllGrades) {
        const semester = `HocKy${r.Hoc_ky}`;
        const schoolYear = r.Nam_hoc;
        const key = `${semester}|${schoolYear}`;
        if (!gradesByKey[key]) gradesByKey[key] = [];
        gradesByKey[key].push(r);
      }

      for (const [key, grades] of Object.entries(gradesByKey)) {
        const [semester, schoolYear] = key.split('|');
        if (grades.length > 0) {
          const transformed = this._transformGrades(grades);
          await Grade.bulkCreate(transformed.map(g => ({
            ...g, semester, schoolYear, userId: user.id
          })));
        }
      }
    }

    // Nhóm học phí theo kỳ và cache (bao gồm cả biên lai, miễn giảm, và tổng hợp công nợ)
    const financeByKey = {};
    
    // Ghi nhận kỳ từ biên lai
    for (const r of (rawAllFinance || [])) {
      const semester = `HocKy${r.Hoc_ky}`;
      const schoolYear = r.Nam_hoc;
      const key = `${semester}|${schoolYear}`;
      if (!financeByKey[key]) financeByKey[key] = { receipts: [], exemptions: [], summaryTerm: null };
      financeByKey[key].receipts.push(r);
    }

    // Ghi nhận kỳ từ bảng miễn giảm
    for (const r of (rawExemptions || [])) {
      const semester = `HocKy${r.Hoc_ky}`;
      const schoolYear = r.Nam_hoc;
      const key = `${semester}|${schoolYear}`;
      if (!financeByKey[key]) financeByKey[key] = { receipts: [], exemptions: [], summaryTerm: null };
      financeByKey[key].exemptions.push(r);
    }

    // Ghi nhận kỳ từ bảng tổng hợp công nợ
    for (const r of (rawSummaryTerms || [])) {
      const semester = `HocKy${r.Hoc_ky}`;
      const schoolYear = r.Nam_hoc;
      const key = `${semester}|${schoolYear}`;
      if (!financeByKey[key]) financeByKey[key] = { receipts: [], exemptions: [], summaryTerm: null };
      financeByKey[key].summaryTerm = r;
    }

    // Xóa TOÀN BỘ học phí cũ trong cache của user trước khi nạp từ SQL Server
    // để loại bỏ triệt để các kỳ ma do crawler cũ để lại (tương tự như với Grade)
    await Finance.destroy({ where: { userId: user.id } });

    for (const [key, group] of Object.entries(financeByKey)) {
      const [semester, schoolYear] = key.split('|');
      const aggregated = this._aggregateFinanceGroup(group);
      await Finance.create({
        userId: user.id,
        semester,
        schoolYear: schoolYear || '',
        totalTuition: aggregated.totalTuition,
        mustPayTuition: aggregated.mustPayTuition,
        discountTuition: aggregated.discountTuition,
        paidTuition: aggregated.paidTuition,
        refundTuition: aggregated.refundTuition,
        debtTuition: aggregated.debtTuition,
        invoiceDetails: aggregated.invoiceDetails
      });
    }

    // Cache CTĐT (Chỉ lấy các môn phân từ Kỳ 1 đến Kỳ 8)
    const validCurriculum = rawCurriculum || [];
    if (validCurriculum.length > 0) {
      await Curriculum.destroy({ where: { userId: user.id } });
      await Curriculum.bulkCreate(validCurriculum.map(r => ({
        courseName: r.courseName,
        courseCode: r.courseCode || '',
        credits: r.credits || 0,
        courseType: r.isElective ? 'Tự chọn' : 'Bắt buộc',
        semester: r.semester || 1,
        knowledgeBlock: `Học kỳ ${r.semester || 1}`,
        userId: user.id
      })));
    }

    const totalGrades = (rawAllGrades || []).length;
    console.log(`📚 [Strategy: Database] Lịch sử hoàn tất! ${totalGrades} điểm, ${Object.keys(financeByKey).length} kỳ học phí, ${validCurriculum.length} môn CTĐT`);

    return {
      gradesCount: totalGrades,
      financeCount: Object.keys(financeByKey).length,
      curriculumCount: validCurriculum.length,
      semestersCrawled: Object.keys(gradesByKey).length
    };
  }

  // ═══════════════════════════════════════
  // TRANSFORM HELPERS — SQL data → app format
  // ═══════════════════════════════════════

  _transformSchedules(rawRows, semester, schoolYear) {
    return rawRows.map(r => {
      let periodText = '';
      if (r.Tiet != null && r.Tiet >= 0 && r.So_tiet > 0) {
        periodText = `${r.Tiet + 1}-${r.Tiet + r.So_tiet}`;
      } else if (r.So_tiet > 0) {
        periodText = `${r.So_tiet} tiết`;
      }

      // SQL Server TUAF: 0=Thứ 2, 1=Thứ 3, 2=Thứ 4, 3=Thứ 5, 4=Thứ 6, 5=Thứ 7, 6=Chủ Nhật, -1=Chưa xếp
      const dayOfWeek = r.Thu != null && r.Thu >= 0 ? (r.Thu === 6 ? 8 : r.Thu + 2) : 0;

      const dateRangeStr = this._formatDateRange(r.Tu_ngay, r.Den_ngay);

      let batchName = 'Đợt 1';
      if (r.Tu_tuan != null && r.Tu_tuan > 0) {
        if (r.Tu_tuan <= 6) batchName = 'Giai đoạn 1';
        else if (r.Tu_tuan <= 11) batchName = 'Giai đoạn 2';
        else batchName = 'Giai đoạn 3';
      }

      return {
        courseName: r.courseName || '',
        credits: r.credits || 0,
        classCode: r.Ten_lop_hp || r.courseCode || '',
        idLopTc: r.ID_lop_tc || null,
        studyTime: dateRangeStr,
        dayOfWeek,
        room: (r.Phong || '').trim(),
        teacherName: r.teacherName || '',
        periodText,
        semester,
        schoolYear,
        batch: batchName
      };
    });
  }

  _getStartTimeByPeriod(period) {
    const p = parseInt(period);
    if (!p) return '07:00';
    if (p === 1) return '07:00';
    if (p === 2) return '07:55';
    if (p === 3) return '08:50';
    if (p === 4) return '09:55';
    if (p === 5) return '10:50';
    if (p === 6) return '13:00';
    if (p === 7) return '13:55';
    if (p === 8) return '14:50';
    if (p === 9) return '15:55';
    if (p === 10) return '16:50';
    if (p === 11) return '17:40';
    if (p === 12) return '18:30';
    if (p === 13) return '19:20';
    if (p === 14) return '20:10';
    if (p === 15) return '21:00';
    return '07:00';
  }

  _formatExamFormat(format) {
    if (format === 1 || format === '1') return 'Tự luận';
    if (format === 2 || format === '2') return 'Trắc nghiệm máy';
    if (format === 3 || format === '3') return 'Vấn đáp';
    if (format === 4 || format === '4') return 'Tiểu luận / Đồ án';
    return String(format || 'Thi viết');
  }

  _formatExamTime(tuTiet, soTiet, caThi, gioThi) {
    if (gioThi && String(gioThi).trim()) return String(gioThi).trim();
    if (tuTiet) {
      const startPeriod = parseInt(tuTiet);
      const periodCount = parseInt(soTiet) || 2;
      const endPeriod = startPeriod + periodCount - 1;
      const startTime = this._getStartTimeByPeriod(startPeriod);
      return `Tiết ${startPeriod}-${endPeriod} (${startTime})`;
    }
    if (caThi) return `Ca ${caThi}`;
    return 'Chưa xếp giờ';
  }

  _transformStudentExams(rawRows) {
    return rawRows.map(r => {
      const tuTiet = r.Tu_tiet != null ? parseInt(r.Tu_tiet) : null;
      const soTiet = r.So_tiet != null ? parseInt(r.So_tiet) : 2;
      const startTime = tuTiet ? this._getStartTimeByPeriod(tuTiet) : (r.Gio_thi || '07:00');
      const examShift = r.Ca_thi ? `Ca ${r.Ca_thi}` : (tuTiet ? `Tiết ${tuTiet}-${tuTiet + soTiet - 1}` : '');
      const proctors = [r.CbCoiThi1, r.CbCoiThi2].filter(Boolean).join(', ');

      return {
        role: 'student',
        courseCode: r.courseCode || '',
        courseName: r.courseName || '',
        credits: r.credits ? Number(r.credits) : 0,
        examDate: this._formatDate(r.Ngay_thi),
        examTime: this._formatExamTime(tuTiet, soTiet, r.Ca_thi, r.Gio_thi),
        examShift,
        startTime,
        room: (r.Phong || '').trim(),
        seatNumber: (r.So_bao_danh || '').trim(),
        examFormat: this._formatExamFormat(r.Hinh_thuc),
        examAttempt: r.Lan_thi ? Number(r.Lan_thi) : 1,
        examBatch: r.Dot_thi ? `Đợt ${r.Dot_thi}` : '',
        proctors,
        notes: ''
      };
    });
  }

  _transformLecturerExams(rawRows) {
    return rawRows.map(r => {
      const tuTiet = r.Tu_tiet != null ? parseInt(r.Tu_tiet) : null;
      const soTiet = r.So_tiet != null ? parseInt(r.So_tiet) : 2;
      const startTime = tuTiet ? this._getStartTimeByPeriod(tuTiet) : '07:00';
      const examShift = r.Ca_thi ? `Ca ${r.Ca_thi}` : (tuTiet ? `Tiết ${tuTiet}-${tuTiet + soTiet - 1}` : '');
      const proctors = [r.CbCoiThi1, r.CbCoiThi2].filter(Boolean).join(', ');

      return {
        role: 'lecturer',
        courseCode: r.courseCode || '',
        courseName: r.courseName || '',
        credits: r.credits ? Number(r.credits) : 0,
        classCode: r.ID_lop_tc ? String(r.ID_lop_tc) : '',
        className: r.Ten_lop_hp || '',
        examDate: this._formatDate(r.Ngay_thi),
        examTime: this._formatExamTime(tuTiet, soTiet, r.Ca_thi),
        examShift,
        startTime,
        room: (r.Phong || '').trim(),
        seatNumber: '',
        studentCount: r.Si_so ? Number(r.Si_so) : 0,
        examFormat: this._formatExamFormat(r.Hinh_thuc),
        examAttempt: r.Lan_thi ? Number(r.Lan_thi) : 1,
        examBatch: r.Ten_dot ? `Đợt ${r.Ten_dot}` : '',
        proctors,
        notes: ''
      };
    });
  }

  _transformExams(rawRows) {
    return this._transformStudentExams(rawRows);
  }

  _transformGrades(rawRows) {
    return rawRows.map(r => {
      // Query trả về: Diem_thi, TBCMH, Diem_chu, Diem_so / grade4, credits / So_hoc_trinh
      const totalGrade10 = r.TBCMH != null ? Math.round(r.TBCMH * 100) / 100 : null;
      const converted = this._convertGrade(totalGrade10);
      
      const grade4Raw = r.grade4 != null ? Number(r.grade4) : (r.Diem_so != null ? Number(r.Diem_so) : null);
      const totalGrade4 = grade4Raw !== null ? grade4Raw : converted.totalGrade4;
      const letterGrade = r.Diem_chu ? r.Diem_chu.trim() : converted.letterGrade;
      const credits = r.credits != null ? Number(r.credits) : (r.So_hoc_trinh != null ? Number(r.So_hoc_trinh) : 0);

      return {
        courseName: r.courseName || '',
        courseCode: r.courseCode || '',
        credits,
        processGrade: r.processGrade != null ? Math.round(r.processGrade * 100) / 100 : null,
        midtermGrade: r.midtermGrade != null ? Math.round(r.midtermGrade * 100) / 100 : null,
        finalGrade: r.Diem_thi != null ? Math.round(r.Diem_thi * 100) / 100 : null,
        totalGrade10,
        totalGrade4,
        letterGrade,
        retakeCount: r.Lan_hoc || 1,
        examAttempt: r.Lan_thi || 1
      };
    });
  }

  /**
   * Quy đổi điểm hệ 10 → hệ 4 + letter grade
   */
  _convertGrade(totalGrade10) {
    if (totalGrade10 == null) return { totalGrade4: null, letterGrade: null };
    if (totalGrade10 >= 9.0) return { totalGrade4: 4.0, letterGrade: 'A+' };
    if (totalGrade10 >= 8.5) return { totalGrade4: 3.7, letterGrade: 'A' };
    if (totalGrade10 >= 8.0) return { totalGrade4: 3.5, letterGrade: 'B+' };
    if (totalGrade10 >= 7.0) return { totalGrade4: 3.0, letterGrade: 'B' };
    if (totalGrade10 >= 6.5) return { totalGrade4: 2.5, letterGrade: 'C+' };
    if (totalGrade10 >= 5.5) return { totalGrade4: 2.0, letterGrade: 'C' };
    if (totalGrade10 >= 5.0) return { totalGrade4: 1.5, letterGrade: 'D+' };
    if (totalGrade10 >= 4.0) return { totalGrade4: 1.0, letterGrade: 'D' };
    return { totalGrade4: 0, letterGrade: 'F' };
  }

  /**
   * Gom nhóm biên lai, miễn giảm, và công nợ tổng hợp thành đối tượng chi tiết
   */
  _aggregateFinanceGroup(group) {
    const { receipts = [], exemptions = [], summaryTerm = null } = group || {};

    let totalTuition = summaryTerm ? summaryTerm.So_tien_phai_nop : 0;
    let discountTuition = summaryTerm ? summaryTerm.So_tien_mien_giam : 0;
    let paidTuition = summaryTerm ? summaryTerm.So_tien_da_nop : 0;
    let refundTuition = summaryTerm ? summaryTerm.So_tien_tra_lai : 0;
    let debtTuition = summaryTerm ? summaryTerm.Thieu_thua : 0;

    // Nếu không có summaryTerm, tính toán từ exemptions và receipts
    if (!summaryTerm) {
      for (const r of receipts) {
        const isRefund = r.Thu_chi === false || (r.Noi_dung && r.Noi_dung.toLowerCase().includes('hoàn'));
        if (isRefund) {
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

      if (debtTuition !== 0) {
        debtTuition = Math.max(0, totalTuition - discountTuition - paidTuition + refundTuition);
      }
    } else {
      // Nếu có summaryTerm nhưng So_tien_mien_giam = 0 và Thieu_thua = 0, kiểm tra nếu là miễn giảm 100%
      if (discountTuition === 0 && debtTuition === 0 && paidTuition === 0 && totalTuition > 0) {
        discountTuition = totalTuition;
      }
    }

    const mustPayTuition = Math.max(0, totalTuition - discountTuition);

    const invoiceDetails = receipts.map(r => {
      const isRefund = r.Thu_chi === false || (r.Noi_dung && r.Noi_dung.toLowerCase().includes('hoàn'));
      return {
        invoiceNo: r.So_phieu || '',
        date: this._formatDate(r.Ngay_thu),
        amount: Math.abs(r.So_tien || 0),
        round: r.Lan_thu || 1,
        description: r.Noi_dung || '',
        isRefund: Boolean(isRefund)
      };
    });

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

  _aggregateFinance(records) {
    return this._aggregateFinanceGroup({ receipts: records || [], exemptions: [], summaryTerm: null });
  }

  // ═══════════════════════════════════════
  // CACHE TO POSTGRESQL — Giống CrawlerStrategy
  // ═══════════════════════════════════════

  async _cacheToPostgres(user, semester, schoolYear, data) {
    const { scheduleList, examList, gradeList, financeRaw, drlData } = data;

    // A. TKB
    await Schedule.destroy({ where: { userId: user.id, semester, schoolYear } });
    if (scheduleList.length > 0) {
      await Schedule.bulkCreate(scheduleList.map(item => ({ ...item, userId: user.id })));
    }

    // B. Lịch thi
    await Exam.destroy({ where: { userId: user.id, semester, schoolYear } });
    if (examList.length > 0) {
      await Exam.bulkCreate(examList.map(item => ({
        ...item, semester, schoolYear, userId: user.id
      })));
    }

    // C. Điểm
    await Grade.destroy({ where: { userId: user.id, semester, schoolYear } });
    if (gradeList.length > 0) {
      await Grade.bulkCreate(gradeList.map(item => ({
        ...item, semester, schoolYear, userId: user.id
      })));
    }

    // D. Học phí
    const financeData = this._aggregateFinance(financeRaw);
    if (financeRaw && financeRaw.length > 0) {
      await Finance.destroy({ where: { userId: user.id, semester, schoolYear } });
      await Finance.create({
        userId: user.id,
        semester,
        schoolYear,
        totalTuition: financeData.totalTuition,
        mustPayTuition: financeData.mustPayTuition || 0,
        discountTuition: financeData.discountTuition || 0,
        paidTuition: financeData.paidTuition,
        debtTuition: financeData.debtTuition,
        refundTuition: financeData.refundTuition || 0,
        invoiceDetails: financeData.invoiceDetails
      });
    }

    // E. Điểm rèn luyện
    if (drlData) {
      const DiemRenLuyen = require('../models/DiemRenLuyen');
      await DiemRenLuyen.destroy({ where: { userId: user.id, semester, schoolYear } });
      await DiemRenLuyen.create({
        userId: user.id,
        semester,
        schoolYear,
        score: drlData.Diem || 0,
        classification: ''
      });
    }
  }

  // ═══════════════════════════════════════
  // DATE FORMATTING HELPERS
  // ═══════════════════════════════════════

  _formatDate(dateVal) {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  _formatDateRange(from, to) {
    const f = this._formatDate(from);
    const t = this._formatDate(to);
    if (!f && !t) return '';
    if (f && t) return `${f.substring(0, 5)} - ${t.substring(0, 5)}`;
    return f || t;
  }
}

module.exports = DatabaseStrategy;
