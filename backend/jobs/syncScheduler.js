const cron = require('node-cron');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const Grade = require('../models/Grade');
const Finance = require('../models/Finance');
const { decrypt } = require('../utils/security');
const strategyManager = require('../strategies/StrategyManager');
const { notificationCenter, isPushEnabled } = require('./pushJobs');
const notificationRepo = require('../services/notificationRepo');
const { diffGradeRows, scheduleFingerprint } = require('../services/notificationRules');

/**
 * Hàm thực thi đồng bộ dữ liệu tự động
 * 
 * Database mode: Bulk sync kỳ hiện tại từ SQL Server (5 queries cho toàn trường)
 * Crawler mode:  Cào portal từng user (giữ nguyên logic cũ)
 */
const runDailySync = async () => {
  console.log('⏰ [Cron Job] Bắt đầu đồng bộ dữ liệu tự động từ Database SQL Server...');
  try {
    await runDatabaseBulkSync();
    console.log('⏰ [Cron Job] Đồng bộ dữ liệu SQL Server hoàn thành!');
  } catch (error) {
    console.error('⏰ [Cron Job] Lỗi đồng bộ dữ liệu:', error.message);
  }
};

/**
 * Database Bulk Sync — 5 queries lớn cho toàn trường
 * Chỉ sync KỲ HIỆN TẠI (~71K rows, ~3 phút)
 */
const runDatabaseBulkSync = async () => {
  const namvietConnector = require('../services/namvietConnector');
  const tuafQueries = require('../services/tuafQueries');

  const pool = await namvietConnector.getPool();

  // 1. Xác định kỳ hiện tại
  const term = await tuafQueries.getCurrentTerm(pool);
  if (!term) {
    console.warn('⏰ [Cron] Không xác định được kỳ hiện tại!');
    return;
  }

  const hocKy = term.Hoc_ky;
  const namHoc = term.Nam_hoc;
  const formattedSemester = `HocKy${hocKy}`;
  const formattedSchoolYear = namHoc;

  console.log(`⏰ [Cron] Bulk sync kỳ ${hocKy} năm ${namHoc}...`);

  // 2. Lấy danh sách user đã đăng ký app
  const users = await User.findAll({ where: { role: 'student' } });
  const userMap = {};
  for (const u of users) {
    userMap[u.username] = u;
  }
  console.log(`⏰ [Cron] ${users.length} sinh viên đã đăng ký app.`);

  // 3. Bulk queries (5 queries lớn thay vì N × 5 queries nhỏ)
  console.log('⏰ [Cron] Đang query SQL Server (bulk)...');
  const [allSchedules, allExams, allGrades, allFinance, allDRL] = await Promise.all([
    tuafQueries.bulkSchedules(pool, hocKy, namHoc),
    tuafQueries.bulkExams(pool, hocKy, namHoc),
    tuafQueries.bulkGrades(pool, hocKy, namHoc),
    tuafQueries.bulkFinance(pool, hocKy, namHoc),
    tuafQueries.bulkDRL(pool, hocKy, namHoc)
  ]);

  console.log(`⏰ [Cron] SQL Server trả về: ${allSchedules.length} TKB, ${allExams.length} thi, ${allGrades.length} điểm, ${allFinance.length} học phí, ${allDRL.length} ĐRL`);

  // 4. Nhóm theo Ma_sv
  const groupByMaSv = (rows) => {
    const map = {};
    for (const r of rows) {
      if (!map[r.Ma_sv]) map[r.Ma_sv] = [];
      map[r.Ma_sv].push(r);
    }
    return map;
  };

  const schedulesByUser = groupByMaSv(allSchedules);
  const examsByUser = groupByMaSv(allExams);
  const gradesByUser = groupByMaSv(allGrades);
  const financeByUser = groupByMaSv(allFinance);
  const drlByUser = groupByMaSv(allDRL);

  // 5. Cache vào PG cho từng user đã đăng ký
  const strategy = strategyManager.getStrategy();
  let syncedCount = 0;
  const pushOn = isPushEnabled();
  const runAt = new Date();
  let gradeNotified = 0;
  let scheduleChanged = 0;

  // SQL Server trả RỖNG cho cả trường gần như chắc chắn là lỗi truy vấn / dữ liệu chưa mở:
  // giữ nguyên cache cũ, không so sánh → tránh xóa lịch của mọi người rồi hôm sau báo "điểm mới" hàng loạt.
  const keepSchedules = allSchedules.length === 0;
  const keepExams = allExams.length === 0;
  const keepGrades = allGrades.length === 0;
  if (keepSchedules || keepExams || keepGrades) {
    console.warn(`⏰ [Cron] SQL Server trả rỗng toàn trường (TKB=${allSchedules.length}, thi=${allExams.length}, điểm=${allGrades.length}) → giữ nguyên cache phần rỗng.`);
  }

  for (const [maSv, user] of Object.entries(userMap)) {
    try {
      const userSchedules = schedulesByUser[maSv] || [];
      const userExams = examsByUser[maSv] || [];
      const userGrades = gradesByUser[maSv] || [];
      const userFinance = financeByUser[maSv] || [];

      // Transform + cache
      const scheduleList = userSchedules.map(r => ({
        courseName: r.courseName || '',
        credits: r.credits || 0,
        classCode: r.courseCode || '',
        studyTime: strategy._formatDateRange ? strategy._formatDateRange(r.Tu_ngay, r.Den_ngay) : '',
        dayOfWeek: r.Thu != null && r.Thu >= 0 ? (r.Thu === 6 ? 8 : r.Thu + 2) : 0,
        room: r.Phong || '',
        teacherName: r.teacherName || '',
        periodText: (r.Tiet != null && r.Tiet >= 0 && r.So_tiet > 0) ? `${r.Tiet + 1}-${r.Tiet + r.So_tiet}` : (r.So_tiet > 0 ? `${r.So_tiet} tiết` : ''),
        semester: formattedSemester,
        schoolYear: formattedSchoolYear,
        batch: 'Dothoc1',
        userId: user.id
      }));

      // Cache schedule
      if (!keepSchedules) {
        await Schedule.destroy({ where: { userId: user.id, semester: formattedSemester, schoolYear: formattedSchoolYear } });
        if (scheduleList.length > 0) await Schedule.bulkCreate(scheduleList);
      }

      // Cache exams
      const examList = userExams.map(r => ({
        courseName: r.courseName || '',
        examDate: r.Ngay_thi ? new Date(r.Ngay_thi).toLocaleDateString('vi-VN') : '',
        examTime: r.Ca_thi ? `Ca ${r.Ca_thi}` : '',
        room: r.Phong || '',
        seatNumber: r.So_bao_danh || '',
        examFormat: r.Hinh_thuc || '',
        semester: formattedSemester,
        schoolYear: formattedSchoolYear,
        userId: user.id
      }));
      if (!keepExams) {
        await Exam.destroy({ where: { userId: user.id, semester: formattedSemester, schoolYear: formattedSchoolYear } });
        if (examList.length > 0) await Exam.bulkCreate(examList);
      }

      // Lịch học / lịch thi đổi → ghi nhận thời điểm đổi (máy nào chưa cập nhật lại sẽ nhận bản tin sáng dự phòng)
      if (pushOn && !keepSchedules && !keepExams) {
        try {
          const changed = await notificationRepo.updateScheduleHash(user.id, scheduleFingerprint(scheduleList, examList), runAt);
          if (changed) scheduleChanged++;
        } catch (e) {
          console.warn(`⏰ [Cron] Lỗi lưu dấu vân tay lịch ${maSv}: ${e.message}`);
        }
      }

      // Cache grades
      if (!keepGrades) {
        const newGradeRows = userGrades.map(r => {
          const totalGrade10 = r.TBCMH != null ? Math.round(r.TBCMH * 100) / 100 : null;
          const converted = strategy._convertGrade ? strategy._convertGrade(totalGrade10) : { totalGrade4: null, letterGrade: null };
          const grade4Raw = r.grade4 != null ? Number(r.grade4) : (r.Diem_so != null ? Number(r.Diem_so) : null);
          const totalGrade4 = grade4Raw !== null ? grade4Raw : converted.totalGrade4;
          const credits = r.credits != null ? Number(r.credits) : (r.So_hoc_trinh != null ? Number(r.So_hoc_trinh) : 0);

          return {
            courseName: r.courseName || '',
            courseCode: r.courseCode || '',
            credits,
            processGrade: null,
            midtermGrade: null,
            finalGrade: r.Diem_thi != null ? Math.round(r.Diem_thi * 100) / 100 : null,
            totalGrade10,
            totalGrade4,
            letterGrade: r.Diem_chu || converted.letterGrade,
            retakeCount: r.Lan_hoc || 1,
            examAttempt: r.Lan_thi || 1,
            semester: formattedSemester,
            schoolYear: formattedSchoolYear,
            userId: user.id
          };
        });

        // Đọc điểm cũ TRƯỚC khi ghi đè để phát hiện điểm mới / điểm thay đổi
        let gradeEvents = [];
        if (pushOn) {
          try {
            const oldGrades = await Grade.findAll({
              where: { userId: user.id, semester: formattedSemester, schoolYear: formattedSchoolYear },
              raw: true
            });
            // Tài khoản chưa từng được cron đồng bộ → chỉ lập mốc, không báo
            gradeEvents = diffGradeRows(oldGrades, newGradeRows, { hasBaseline: !!user.lastSyncedAt }).events;
          } catch (e) {
            console.warn(`⏰ [Cron] Lỗi so điểm ${maSv}: ${e.message}`);
          }
        }

        await Grade.destroy({ where: { userId: user.id, semester: formattedSemester, schoolYear: formattedSchoolYear } });
        if (newGradeRows.length > 0) await Grade.bulkCreate(newGradeRows);

        if (gradeEvents.length > 0) {
          try {
            if (await notificationCenter.enqueueGradeEvents(user.id, gradeEvents, runAt)) gradeNotified++;
          } catch (e) {
            console.warn(`⏰ [Cron] Lỗi xếp thông báo điểm ${maSv}: ${e.message}`);
          }
        }
      }

      // Cache finance
      if (userFinance.length > 0) {
        const totalPaid = userFinance.reduce((s, r) => s + (r.So_tien || 0), 0);
        await Finance.destroy({ where: { userId: user.id, semester: formattedSemester, schoolYear: formattedSchoolYear } });
        await Finance.create({
          userId: user.id,
          semester: formattedSemester,
          schoolYear: formattedSchoolYear,
          totalTuition: totalPaid,
          mustPayTuition: totalPaid,
          discountTuition: 0,
          paidTuition: totalPaid,
          debtTuition: 0,
          invoiceDetails: userFinance.map(r => ({
            invoiceNo: r.So_phieu || '',
            date: r.Ngay_thu ? new Date(r.Ngay_thu).toLocaleDateString('vi-VN') : '',
            amount: r.So_tien || 0,
            description: r.Noi_dung || ''
          }))
        });
      }

      user.lastSyncedAt = new Date();
      await user.save();
      syncedCount++;
    } catch (userErr) {
      console.warn(`⏰ [Cron] Lỗi cache cho ${maSv}: ${userErr.message}`);
    }
  }

  console.log(`⏰ [Cron] Bulk sync hoàn tất: ${syncedCount}/${users.length} SV.`);

  // Push ẩn cho MỌI thiết bị đang hoạt động (SV + GV): app thức dậy, tải dữ liệu mới nhất,
  // lập lại lịch nhắc local (tuần tới tiết/thứ khác, đổi phòng... đều được cập nhật).
  if (pushOn) {
    try {
      const syncQueued = await notificationCenter.enqueueDailySync(await notificationRepo.activeDeviceUserIds(), new Date());
      console.log(`🔔 [Cron] Điểm mới: ${gradeNotified} SV • Lịch đổi: ${scheduleChanged} SV • Push cập nhật lịch nhắc: ${syncQueued} tài khoản.`);
    } catch (e) {
      console.warn('🔔 [Cron] Lỗi xếp push cập nhật lịch nhắc:', e.message);
    }
  }

  // Đóng pool sau cron (để không giữ kết nối liên tục)
  await namvietConnector.closePool();
};

/**
 * Crawler Sync — Giữ nguyên logic cũ, dùng làm fallback
/**
 * Khởi tạo dịch vụ Cron
 */
const initCronJob = () => {
  const cronSchedule = process.env.CRON_SCHEDULE || '0 3 * * *';
  
  // Chạy theo giờ Việt Nam (container thường để UTC → nếu không khai báo, "3h" sẽ là 10h sáng VN)
  cron.schedule(cronSchedule, () => {
    runDailySync();
  }, { timezone: 'Asia/Ho_Chi_Minh' });
  
  console.log(`📅 [Cron Service] Đã thiết lập lịch đồng bộ SQL Server: "${cronSchedule}"`);
};

module.exports = {
  initCronJob,
  runDailySync
};

