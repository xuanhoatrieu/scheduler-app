const ScheduleStrategy = require('./ScheduleStrategy');
const namvietConnector = require('../services/namvietConnector');
const tuafQueries = require('../services/tuafQueries');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const Grade = require('../models/Grade');
const Finance = require('../models/Finance');
const Curriculum = require('../models/Curriculum');
const News = require('../models/News');
const { aggregateFinanceGroup, buildFinanceTerms } = require('../services/financeCalculator');
const { replaceFinanceCache } = require('../services/financeReader');

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
    const defaultSys = user.role === 'student' ? 'ALL' : 'DHCQ';
    const trainingSystem = String(options.trainingSystem || options.heDaoTao || defaultSys).toUpperCase();

    // 3. READ từ SQL Server (parallel cho tốc độ)
    let scheduleList = [];
    let examList = [];
    let gradeList = [];
    let financeRaw = [];
    let drlData = null;

    if (user.role === 'lecturer') {
      const rawSchedules = await tuafQueries.getLecturerSchedule(pool, entityId, hocKy, namHoc, trainingSystem);
      const rawExams = await tuafQueries.getLecturerExams(pool, entityId, hocKy, namHoc, rawSchedules, trainingSystem);
      scheduleList = this._transformSchedules(rawSchedules, formattedSemester, formattedSchoolYear, trainingSystem);
      examList = this._transformLecturerExams(rawExams, trainingSystem);
    } else {
      // Student: lấy tất cả data song song
      const [rawSchedules, rawExams, rawGrades, rawFinance, rawDrl] = await Promise.all([
        tuafQueries.getStudentSchedule(pool, entityId, hocKy, namHoc, trainingSystem),
        tuafQueries.getStudentExams(pool, entityId, hocKy, namHoc, trainingSystem),
        tuafQueries.getStudentGrades(pool, entityId, hocKy, namHoc),
        tuafQueries.getStudentFinance(pool, entityId, hocKy, namHoc),
        tuafQueries.getStudentDRL(pool, entityId, hocKy, namHoc)
      ]);

      scheduleList = this._transformSchedules(rawSchedules, formattedSemester, formattedSchoolYear, trainingSystem);
      examList = this._transformStudentExams(rawExams, trainingSystem);
      gradeList = this._transformGrades(rawGrades);
      financeRaw = rawFinance;
      drlData = rawDrl;
    }

    // 4. Cache vào PostgreSQL nội bộ
    console.log(`💾 [Strategy: Database] Đang cache vào PostgreSQL cho ${user.username} (hệ: ${trainingSystem})...`);
    await this._cacheToPostgres(user, formattedSemester, formattedSchoolYear, {
      scheduleList, examList, gradeList, financeRaw, drlData
    }, trainingSystem);

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

    // READ tất cả điểm + học phí + CTĐT + Tin tức thông báo + Miễn giảm + Công nợ Nam Việt + Công nợ lũy kế
    const [rawAllGrades, rawAllFinance, rawCurriculum, rawNews, rawExemptions, rawSummaryTerms, rawNamVietFinance, rawCumulative] = await Promise.all([
      tuafQueries.getAllStudentGrades(pool, entityId),
      tuafQueries.getAllStudentFinance(pool, entityId),
      tuafQueries.getStudentCurriculum(pool, entityId),
      tuafQueries.getSchoolNews(pool, user.role),
      tuafQueries.getStudentExemptions(pool, entityId),
      tuafQueries.getStudentFinanceSummaryByTerm(pool, entityId),
      tuafQueries.getStudentNamVietFinance(pool, entityId),
      tuafQueries.getStudentCumulativeFinance(pool, entityId)
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

    // Chia kỳ + gộp kỳ bằng hàm tính DÙNG CHUNG (services/financeCalculator) để SV và GVCN luôn cùng con số.
    // Thay TOÀN BỘ bản lưu tạm học phí của user (loại bỏ kỳ ma do crawler cũ), tuần tự theo user
    // để không trùng bản ghi khi có request đọc trực tiếp chạy song song.
    const financeTerms = buildFinanceTerms({
      namViet: rawNamVietFinance,
      receipts: rawAllFinance,
      exemptions: rawExemptions,
      summaryTerms: rawSummaryTerms
    });
    await replaceFinanceCache(Finance, user.id, financeTerms);

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
    console.log(`📚 [Strategy: Database] Lịch sử hoàn tất! ${totalGrades} điểm, ${financeTerms.length} kỳ học phí, ${validCurriculum.length} môn CTĐT`);

    return {
      gradesCount: totalGrades,
      financeCount: financeTerms.length,
      curriculumCount: validCurriculum.length,
      semestersCrawled: Object.keys(gradesByKey).length
    };
  }

  // ═══════════════════════════════════════
  // TRANSFORM HELPERS — SQL data → app format
  // ═══════════════════════════════════════

  _transformSchedules(rawRows, semester, schoolYear, trainingSystem = 'DHCQ') {
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
        batch: batchName,
        trainingSystem: trainingSystem || 'DHCQ'
      };
    });
  }

  _getStartTimeByPeriod(period) {
    const p = parseInt(period);
    if (p === 0 || p === 1 || isNaN(p)) return '07:00';
    if (p === 2) return '07:55';
    if (p === 3) return '08:50';
    if (p === 4) return '09:55';
    if (p === 5) return '10:50';
    if (p === 6) return '13:15';
    if (p === 7) return '14:10';
    if (p === 8) return '15:15';
    if (p === 9) return '16:10';
    if (p === 10) return '17:05';
    if (p === 11) return '18:00';
    if (p === 12) return '18:50';
    if (p === 13) return '19:40';
    if (p === 14) return '20:30';
    if (p === 15) return '21:15';
    return '07:00';
  }

  _getExamStartTime(gioThi, tuTiet) {
    if (gioThi) {
      const m = String(gioThi).match(/(\d{1,2})\s*giờ\s*(\d{0,2})/i);
      if (m) {
        const h = String(m[1]).padStart(2, '0');
        const min = String(m[2] || '00').padStart(2, '0');
        return `${h}:${min}`;
      }
      const timeMatch = String(gioThi).match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        return `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}`;
      }
    }
    const t = tuTiet != null && !isNaN(parseInt(tuTiet)) ? parseInt(tuTiet) : null;
    const EXAM_PERIOD_MAP = {
      0: '07:00', 1: '07:30', 2: '08:00', 3: '08:30', 4: '09:00',
      5: '09:30', 6: '10:00', 7: '10:30', 8: '11:00', 9: '11:30',
      10: '13:00', 11: '13:30', 12: '14:00', 13: '14:30', 14: '15:00',
      15: '15:30', 16: '16:00', 17: '16:30', 18: '17:00', 19: '17:30',
      20: '18:00', 21: '18:30', 22: '19:00',
      25: '07:00', 26: '09:30', 27: '13:30',
      31: '07:30', 34: '09:05', 37: '10:40',
      40: '13:00', 41: '13:30', 43: '14:35', 44: '15:05',
      46: '16:10', 47: '16:40', 49: '17:40',
      59: '08:30', 60: '09:00', 61: '09:30', 62: '10:00',
      63: '10:30', 64: '11:00', 65: '11:30', 66: '12:00',
      68: '13:00', 69: '13:30', 70: '14:00', 71: '14:30',
      72: '15:00', 73: '15:30', 74: '16:00', 75: '16:30'
    };
    if (t !== null && EXAM_PERIOD_MAP[t]) {
      return EXAM_PERIOD_MAP[t];
    }
    if (t !== null) {
      return this._getStartTimeByPeriod(t);
    }
    return '07:00';
  }

  _calculateExamEndTime(startTime, durationMinutes = 60) {
    if (!startTime || typeof startTime !== 'string') return '';
    const parts = startTime.split(':');
    if (parts.length !== 2) return '';
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return '';
    const totalMinutes = h * 60 + m + (parseInt(durationMinutes, 10) || 60);
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  _getExamDurationMinutes(soPhutThi, examFormatName) {
    if (soPhutThi && !isNaN(parseInt(soPhutThi)) && parseInt(soPhutThi) > 0) {
      return parseInt(soPhutThi);
    }
    if (examFormatName) {
      const match = String(examFormatName).match(/(\d+)\s*p/i);
      if (match) return parseInt(match[1]);
    }
    return 60;
  }

  _formatExamShift(startTime, caThi) {
    if (caThi) return `Ca ${caThi}`;
    if (startTime) {
      const h = parseInt(startTime.split(':')[0], 10);
      if (!isNaN(h)) {
        if (h < 12) return 'Ca Sáng';
        if (h < 18) return 'Ca Chiều';
        return 'Ca Tối';
      }
    }
    return '';
  }

  _formatExamFormat(format) {
    const map = {
      1: 'Thi viết 60p',
      2: 'Thi viết 90p',
      3: 'Trắc nghiệm máy',
      4: 'Trắc nghiệm viết',
      5: 'Bài tiểu luận',
      6: 'Vấn đáp',
      7: 'Bài tập lớn',
      8: 'Vấn đáp máy',
      9: 'Video clip',
      10: 'Báo cáo',
      11: 'Thuyết trình',
      12: 'Thực hành máy',
      13: 'Trắc nghiệm + Viết',
      14: 'Lý thuyết + Thực hành',
      15: 'Thi viết 120p'
    };
    return map[format] || map[String(format)] || String(format || 'Thi viết');
  }

  _formatExamTime(startTime, durationMinutes = 60, caThi = null) {
    if (startTime) {
      const endTime = this._calculateExamEndTime(startTime, durationMinutes);
      return endTime ? `${startTime} - ${endTime} (${durationMinutes}p)` : startTime;
    }
    if (caThi) return `Ca ${caThi}`;
    return 'Chưa xếp giờ';
  }

  _transformStudentExams(rawRows, trainingSystem = 'DHCQ') {
    return rawRows.map(r => {
      const examFormat = this._formatExamFormat(r.Hinh_thuc);
      const durationMinutes = this._getExamDurationMinutes(r.So_phut_thi, examFormat);
      const tuTiet = r.Tu_tiet != null ? parseInt(r.Tu_tiet) : null;
      const startTime = this._getExamStartTime(r.Gio_thi, tuTiet);
      const examShift = this._formatExamShift(startTime, r.Ca_thi);
      const examTime = this._formatExamTime(startTime, durationMinutes, r.Ca_thi);
      const proctors = [r.CbCoiThi1, r.CbCoiThi2].filter(Boolean).join(', ');

      return {
        role: 'student',
        trainingSystem,
        idDotThiPhong: r.idDotThiPhong || null,
        courseCode: r.courseCode || '',
        courseName: r.courseName || '',
        credits: r.credits ? Number(r.credits) : 0,
        examDate: this._formatDate(r.Ngay_thi),
        examTime,
        examShift,
        startTime,
        room: (r.Phong || '').trim(),
        seatNumber: (r.So_bao_danh || '').trim(),
        examFormat,
        examAttempt: r.Lan_thi ? Number(r.Lan_thi) : 1,
        examBatch: r.Dot_thi ? `Đợt ${r.Dot_thi}` : '',
        proctors,
        notes: ''
      };
    });
  }

  _transformLecturerExams(rawRows, trainingSystem = 'DHCQ') {
    return rawRows.map(r => {
      const examFormat = this._formatExamFormat(r.Hinh_thuc);
      const durationMinutes = this._getExamDurationMinutes(r.So_phut_thi, examFormat);
      const tuTiet = r.Tu_tiet != null ? parseInt(r.Tu_tiet) : null;
      const startTime = this._getExamStartTime(r.Gio_thi, tuTiet);
      const examShift = this._formatExamShift(startTime, r.Ca_thi);
      const examTime = this._formatExamTime(startTime, durationMinutes, r.Ca_thi);
      const proctors = [r.CbCoiThi1, r.CbCoiThi2].filter(Boolean).join(', ');

      return {
        role: 'lecturer',
        trainingSystem,
        idDotThiPhong: r.idDotThiPhong || null,
        courseCode: r.courseCode || '',
        courseName: r.courseName || '',
        credits: r.credits ? Number(r.credits) : 0,
        classCode: r.ID_lop_tc ? String(r.ID_lop_tc) : '',
        className: r.Ten_lop_hp || '',
        examDate: this._formatDate(r.Ngay_thi),
        examTime,
        examShift,
        startTime,
        room: (r.Phong || '').trim(),
        seatNumber: '',
        studentCount: r.Si_so ? Number(r.Si_so) : 0,
        examFormat,
        examAttempt: r.Lan_thi ? Number(r.Lan_thi) : 1,
        examBatch: r.Ten_dot ? `Đợt ${r.Ten_dot}` : '',
        proctors,
        notes: ''
      };
    });
  }

  _transformExams(rawRows, trainingSystem = 'DHCQ') {
    return this._transformStudentExams(rawRows, trainingSystem);
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
    return aggregateFinanceGroup(group);
  }

  _aggregateFinance(records) {
    return this._aggregateFinanceGroup({ receipts: records || [], exemptions: [], summaryTerm: null });
  }

  // ═══════════════════════════════════════
  // CACHE TO POSTGRESQL — Giống CrawlerStrategy
  // ═══════════════════════════════════════

  async _cacheToPostgres(user, semester, schoolYear, data, trainingSystem = 'DHCQ') {
    const { scheduleList, examList, gradeList, financeRaw, drlData } = data;

    // A. TKB: Xóa cache cũ của đúng user, semester, schoolYear VÀ trainingSystem
    const scheduleWhere = { userId: user.id, semester, schoolYear };
    if (trainingSystem && trainingSystem !== 'ALL') {
      scheduleWhere.trainingSystem = trainingSystem;
    }
    await Schedule.destroy({ where: scheduleWhere });
    if (scheduleList.length > 0) {
      await Schedule.bulkCreate(scheduleList.map(item => ({
        ...item,
        userId: user.id,
        trainingSystem: item.trainingSystem || trainingSystem
      })));
    }

    // B. Lịch thi: Xóa cache cũ của đúng user, semester, schoolYear VÀ trainingSystem
    const examWhere = { userId: user.id, semester, schoolYear };
    if (trainingSystem && trainingSystem !== 'ALL') {
      examWhere.trainingSystem = trainingSystem;
    }
    await Exam.destroy({ where: examWhere });
    if (examList.length > 0) {
      await Exam.bulkCreate(examList.map(item => ({
        ...item,
        semester,
        schoolYear,
        userId: user.id,
        trainingSystem: item.trainingSystem || trainingSystem
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
