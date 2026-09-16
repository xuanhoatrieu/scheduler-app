const path = require('path');
const os = require('os');
const axios = require('axios');
const sql = require('mssql');
const { sequelize } = require('../config/db');
const configService = require('../services/configService');
const namvietConnector = require('../services/namvietConnector');
const ExcelCurriculumService = require('../services/excelCurriculumService');
const strategyManager = require('../strategies/StrategyManager');
const { decrypt } = require('../utils/security');

const User = require('../models/User');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const Grade = require('../models/Grade');
const Finance = require('../models/Finance');
const Curriculum = require('../models/Curriculum');
const DiemRenLuyen = require('../models/DiemRenLuyen');
const Attendance = require('../models/Attendance');
const News = require('../models/News');
const MasterCurriculum = require('../models/MasterCurriculum');
const tuafQueries = require('../services/tuafQueries');

/**
 * Admin Controller — Quản lý cấu hình, kiểm thử kết nối, giám sát sức khỏe hệ thống
 */
class AdminController {

  /**
   * [GET] /api/admin/configs — Lấy toàn bộ cấu hình hệ thống
   */
  async getConfigs(req, res) {
    try {
      const configs = await configService.getAll(true);
      return res.json({
        success: true,
        data: configs
      });
    } catch (err) {
      console.error('❌ [AdminController] getConfigs error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [PUT] /api/admin/configs — Cập nhật cấu hình và Hot-Reload runtime
   */
  async updateConfigs(req, res) {
    try {
      const { configs } = req.body;
      if (!configs || typeof configs !== 'object') {
        return res.status(400).json({ success: false, message: 'Dữ liệu cấu hình không hợp lệ' });
      }

      await configService.bulkUpdate(configs);
      const updatedList = await configService.getAll(true);

      return res.json({
        success: true,
        message: '✅ Đã lưu và áp dụng cấu hình mới thành công (Hot-Reload)!',
        data: updatedList
      });
    } catch (err) {
      console.error('❌ [AdminController] updateConfigs error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [POST] /api/admin/test-connection — Kiểm thử kết nối tức thời
   */
  async testConnection(req, res) {
    const { target } = req.body;
    const startTime = Date.now();
    try {
      const overrides = { ...(req.body.overrides || {}) };

      // Lọc bỏ các giá trị masked (chứa ký tự •) hoặc chuỗi rỗng
      for (const k in overrides) {
        if (!overrides[k] || typeof overrides[k] !== 'string' || overrides[k].includes('•')) {
          delete overrides[k];
        }
      }

      // 1. Test NamViet Connect API
      if (target === 'namviet') {
        const apiUrl = overrides.NAMVIET_API_URL || configService.get('NAMVIET_API_URL', 'http://api.namvietjsc.edu.vn');
        const secretKey = overrides.NAMVIET_SECRET_KEY || configService.get('NAMVIET_SECRET_KEY', 'NV@#$Tuaf2024');
        const maTruong = overrides.NAMVIET_MA_TRUONG || configService.get('NAMVIET_MA_TRUONG', 'TUAF');
        const username = overrides.NAMVIET_USERNAME || configService.get('NAMVIET_USERNAME', 'namviet');

        const tokenRes = await axios.post(
          `${apiUrl}/API/NAMVIETCONNECT/GETTOKEN`,
          { Ma_truong: maTruong, UserName: username },
          { headers: { 'Content-Type': 'application/json', secretkey: secretKey }, timeout: 8000 }
        );

        if (tokenRes.data.StatusCode !== '0000') {
          return res.json({
            success: false,
            target: 'namviet',
            latencyMs: Date.now() - startTime,
            message: `NamViet GETTOKEN thất bại: ${tokenRes.data.StatusDes || 'Lỗi không xác định'}`
          });
        }

        const token = tokenRes.data.Token;
        const connectRes = await axios.post(
          `${apiUrl}/API/NAMVIETCONNECT/GETCONNECT`,
          { Ma_truong: maTruong, UserName: username, Token: token },
          { headers: { 'Content-Type': 'application/json', secretkey: secretKey }, timeout: 8000 }
        );

        const latencyMs = Date.now() - startTime;
        if (connectRes.data.StatusCode === '0000') {
          return res.json({
            success: true,
            target: 'namviet',
            latencyMs,
            message: `✅ NamViet API hoạt động tốt (${latencyMs}ms)`,
            details: {
              serverIP: connectRes.data.IP,
              database: connectRes.data.Data,
              user: connectRes.data.Username,
              token: token.substring(0, 6) + '...'
            }
          });
        } else {
          return res.json({
            success: false,
            target: 'namviet',
            latencyMs,
            message: `NamViet GETCONNECT thất bại: ${connectRes.data.StatusDes || 'Lỗi'}`
          });
        }
      }

      // 2. Test SQL Server TUAF
      if (target === 'sqlserver') {
        let pool;
        let isDynamic = false;

        // Nếu có override tham số thủ công từ form (chỉ khi có thay đổi thật sự)
        if (overrides.TUAF_DB_SERVER || overrides.TUAF_DB_USER || overrides.TUAF_DB_PASSWORD) {
          const server = overrides.TUAF_DB_SERVER || configService.get('TUAF_DB_SERVER', '10.64.12.100');
          const database = overrides.TUAF_DB_NAME || configService.get('TUAF_DB_NAME', 'ESS_TUAF_NEW_2');
          const user = overrides.TUAF_DB_USER || configService.get('TUAF_DB_USER', 'tuafesspro');
          const password = overrides.TUAF_DB_PASSWORD || configService.get('TUAF_DB_PASSWORD', 'BrAJeSHe9#Lo@T$');

          pool = await new sql.ConnectionPool({
            server,
            user,
            password,
            database,
            port: 1433,
            options: {
              encrypt: false,
              trustServerCertificate: true,
              connectTimeout: 7000,
              requestTimeout: 7000,
              readOnlyIntent: true
            }
          }).connect();
        } else {
          // Tự động kết nối qua namvietConnector (dynamic token -> SQL Server 10.64.12.100)
          pool = await namvietConnector.getPool();
          isDynamic = true;
        }

        const result = await pool.request().query('SELECT @@VERSION AS version, DB_NAME() AS dbName, 1 AS ok');
        if (!isDynamic && pool) {
          await pool.close();
        }

        const latencyMs = Date.now() - startTime;
        const row = result.recordset[0];
        const serverIp = configService.get('TUAF_DB_SERVER', '10.64.12.100');
        const dbName = row.dbName || configService.get('TUAF_DB_NAME', 'ESS_TUAF_NEW_2');

        return res.json({
          success: true,
          target: 'sqlserver',
          latencyMs,
          message: `✅ SQL Server ${serverIp}/${dbName} kết nối thành công (${latencyMs}ms)!`,
          details: {
            server: serverIp,
            dbName: row.dbName,
            status: 'Ready (Connected)',
            connectionType: isDynamic ? 'NamViet Dynamic Pool' : 'Direct SQL Pool',
            version: (row.version || '').split('\n')[0]
          }
        });
      }

      // 3. Test PostgreSQL Local DB
      if (target === 'postgres') {
        await sequelize.authenticate();
        const userCount = await User.count();
        const latencyMs = Date.now() - startTime;
        return res.json({
          success: true,
          target: 'postgres',
          latencyMs,
          message: `✅ PostgreSQL Local Cache hoạt động bình thường (${latencyMs}ms)`,
          details: {
            userCount,
            dialect: sequelize.getDialect()
          }
        });
      }

      // 4. Test Web Portals
      if (target === 'portals') {
        const studentUrl = configService.get('PORTAL_STUDENT_URL', 'https://sinhvien.tuaf.edu.vn');
        const gvUrl = configService.get('PORTAL_LECTURER_URL', 'https://giangvien.tuaf.edu.vn');
        const ssoUrl = configService.get('PORTAL_SSO_URL', 'https://sso.tuaf.edu.vn');

        const [r1, r2, r3] = await Promise.allSettled([
          axios.get(studentUrl, { timeout: 6000, validateStatus: () => true }),
          axios.get(gvUrl, { timeout: 6000, validateStatus: () => true }),
          axios.get(ssoUrl, { timeout: 6000, validateStatus: () => true })
        ]);

        const latencyMs = Date.now() - startTime;
        return res.json({
          success: true,
          target: 'portals',
          latencyMs,
          message: `✅ Đã kiểm tra trạng thái các Cổng Web TUAF (${latencyMs}ms)`,
          details: {
            studentPortal: r1.status === 'fulfilled' ? `HTTP ${r1.value.status}` : 'Mất kết nối',
            lecturerPortal: r2.status === 'fulfilled' ? `HTTP ${r2.value.status}` : 'Mất kết nối',
            ssoPortal: r3.status === 'fulfilled' ? `HTTP ${r3.value.status}` : 'Mất kết nối'
          }
        });
      }

      return res.status(400).json({ success: false, message: 'Mục kiểm thử không hợp lệ' });
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      return res.json({
        success: false,
        target,
        latencyMs,
        message: `❌ Lỗi kết nối (${latencyMs}ms): ${err.message}`
      });
    }
  }

  /**
   * [GET] /api/admin/health — Lấy thông số sức khỏe hệ thống & số lượng bản ghi cache
   */
  async getHealth(req, res) {
    try {
      const memoryUsage = process.memoryUsage();
      const uptimeSec = Math.floor(process.uptime());

      // Đếm số lượng bản ghi trong PostgreSQL
      const [
        userCount,
        scheduleCount,
        examCount,
        gradeCount,
        financeCount,
        curriculumCount,
        drlCount,
        newsCount
      ] = await Promise.all([
        User.count(),
        Schedule.count(),
        Exam.count(),
        Grade.count(),
        Finance.count(),
        Curriculum.count(),
        DiemRenLuyen.count(),
        News.count()
      ]);

      const systemInfo = {
        serverTime: new Date().toISOString(),
        uptime: uptimeSec,
        uptimeFormatted: formatUptime(uptimeSec),
        nodeVersion: process.version,
        platform: `${os.type()} ${os.arch()}`,
        dataSourceMode: configService.get('DATA_SOURCE', 'database'),
        sqlServerIp: configService.get('TUAF_DB_SERVER', '10.64.12.100'),
        memory: {
          rssMb: (memoryUsage.rss / 1024 / 1024).toFixed(1),
          heapUsedMb: (memoryUsage.heapUsed / 1024 / 1024).toFixed(1),
          heapTotalMb: (memoryUsage.heapTotal / 1024 / 1024).toFixed(1)
        },
        counts: {
          users: userCount,
          schedules: scheduleCount,
          exams: examCount,
          grades: gradeCount,
          finances: financeCount,
          curriculums: curriculumCount,
          drl: drlCount,
          news: newsCount
        }
      };

      return res.json({
        success: true,
        data: systemInfo
      });
    } catch (err) {
      console.error('❌ [AdminController] getHealth error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [GET] /api/admin/users/inspect — Tra cứu dữ liệu cache của người dùng
   */
  async inspectUser(req, res) {
    try {
      const { username } = req.query;
      if (!username) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp username' });
      }

      const user = await User.findOne({ where: { username: username.trim() } });
      if (!user) {
        return res.status(404).json({ success: false, message: `Không tìm thấy tài khoản "${username}" trong Database` });
      }

      const [schedules, exams, grades, finance, curriculum] = await Promise.all([
        Schedule.findAll({ where: { userId: user.id }, limit: 50, order: [['dayOfWeek', 'ASC']] }),
        Exam.findAll({ where: { userId: user.id }, limit: 50 }),
        Grade.findAll({ where: { userId: user.id }, limit: 100 }),
        Finance.findOne({ where: { userId: user.id } }),
        Curriculum.findAll({ where: { userId: user.id }, limit: 100 })
      ]);

      return res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            fullName: user.fullName,
            className: user.className,
            department: user.department,
            tuafStudentId: user.tuafStudentId,
            lastSyncedAt: user.lastSyncedAt,
            createdAt: user.createdAt
          },
          summary: {
            totalSchedules: schedules.length,
            totalExams: exams.length,
            totalGrades: grades.length,
            hasFinance: !!finance,
            totalCurriculum: curriculum.length
          },
          schedules,
          exams,
          grades,
          finance
        }
      });
    } catch (err) {
      console.error('❌ [AdminController] inspectUser error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [POST] /api/admin/users/sync — Kích hoạt đồng bộ tức thì cho 1 tài khoản
   */
  async forceSyncUser(req, res) {
    try {
      const { username, semester = '1', schoolYear = '2026', syncHistory = true } = req.body;
      if (!username) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp username' });
      }

      const user = await User.findOne({ where: { username: username.trim() } });
      if (!user) {
        return res.status(404).json({ success: false, message: `Không tìm thấy tài khoản "${username}"` });
      }

      const decryptedPassword = decrypt(user.encryptedPassword);
      const strategy = strategyManager.getStrategy();

      const startTime = Date.now();
      const result = await strategy.getSchedule(user, decryptedPassword, { semester, schoolYear });

      if (syncHistory && typeof strategy.syncHistory === 'function') {
        try {
          await strategy.syncHistory(user, decryptedPassword);
        } catch (e) {
          console.warn('Sync history warning:', e.message);
        }
      }

      const durationMs = Date.now() - startTime;

      return res.json({
        success: true,
        message: `✅ Đồng bộ thành công cho ${user.username} trong ${durationMs}ms`,
        data: {
          durationMs,
          fullName: user.fullName,
          className: user.className,
          lastSyncedAt: user.lastSyncedAt,
          counts: {
            schedules: (result.schedules || []).length,
            exams: (result.exams || []).length,
            grades: (result.grades || []).length
          }
        }
      });
    } catch (err) {
      console.error('❌ [AdminController] forceSyncUser error:', err);
      return res.status(500).json({ success: false, message: `Đồng bộ thất bại: ${err.message}` });
    }
  }

  /**
   * [POST] /api/admin/curriculum/parse-sample — Parse file cndmstk56.xlsx có sẵn trên server
   */
  async parseSampleCurriculum(req, res) {
    try {
      const filePath = path.join(__dirname, '../../cndmstk56.xlsx');
      const data = await ExcelCurriculumService.parseExcel(filePath);
      return res.json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [GET] /api/admin/curriculum/cohorts — Lấy danh sách các khóa học
   */
  async getCohorts(req, res) {
    try {
      let schoolCohorts = [];
      try {
        const pool = await namvietConnector.getPool();
        schoolCohorts = await tuafQueries.getCohorts(pool);
      } catch (e) {
        console.warn('⚠️ [AdminController] Lỗi kết nối SQL Server lấy cohorts:', e.message);
      }

      const dbCohorts = await MasterCurriculum.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('cohort')), 'cohort']],
        raw: true
      });
      const dbCohortList = dbCohorts.map(r => String(r.cohort || '').replace(/^[kK]/, '')).filter(Boolean);

      const allCohortsSet = new Set([...schoolCohorts.map(String), ...dbCohortList]);
      if (allCohortsSet.size === 0) {
        ['58', '57', '56', '55', '54', '53', '52', '51', '50'].forEach(c => allCohortsSet.add(c));
      }

      const sortedCohorts = Array.from(allCohortsSet)
        .map(Number)
        .filter(n => !isNaN(n) && n > 0)
        .sort((a, b) => b - a)
        .map(c => ({
          cohortNum: c,
          cohortCode: `K${c}`,
          label: `Khóa ${c} (K${c})`
        }));

      return res.json({
        success: true,
        data: sortedCohorts
      });
    } catch (err) {
      console.error('❌ [AdminController] getCohorts error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [GET] /api/admin/curriculum/majors — Lấy danh sách ngành của 1 khóa học
   */
  async getMajorsByCohort(req, res) {
    try {
      const cohortRaw = req.query.cohort || '56';
      const cohortNum = parseInt(String(cohortRaw).replace(/^[kK]/, '')) || 56;

      let schoolMajors = [];
      try {
        const pool = await namvietConnector.getPool();
        schoolMajors = await tuafQueries.getMajorsByCohort(pool, cohortNum);
      } catch (e) {
        console.warn('⚠️ [AdminController] Lỗi kết nối SQL Server lấy majors:', e.message);
      }

      // Lấy thêm các ngành đã lưu trong MasterCurriculum
      const savedMajors = await MasterCurriculum.findAll({
        where: {
          cohort: [`K${cohortNum}`, String(cohortNum)]
        },
        attributes: ['majorCode', 'majorName'],
        group: ['majorCode', 'majorName'],
        raw: true
      });

      const savedCodeSet = new Set(savedMajors.map(m => m.majorCode));

      const majorList = schoolMajors.map(m => ({
        idDt: m.idDt,
        cohort: m.cohort,
        majorCode: m.majorCode,
        majorName: m.majorName,
        specializationName: m.specializationName,
        baseMajorName: m.baseMajorName,
        totalCredits: m.totalCredits,
        totalSemesters: m.totalSemesters,
        hasMasterCurriculum: savedCodeSet.has(m.majorCode)
      }));

      // Bổ sung ngành đã có trong MasterCurriculum nếu chưa có trong schoolMajors
      for (const sm of savedMajors) {
        if (!majorList.some(m => m.majorCode === sm.majorCode)) {
          majorList.push({
            idDt: null,
            cohort: cohortNum,
            majorCode: sm.majorCode,
            majorName: sm.majorName,
            specializationName: sm.majorName,
            baseMajorName: sm.majorName,
            totalCredits: 153,
            totalSemesters: 8,
            hasMasterCurriculum: true
          });
        }
      }

      return res.json({
        success: true,
        cohort: `K${cohortNum}`,
        data: majorList
      });
    } catch (err) {
      console.error('❌ [AdminController] getMajorsByCohort error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [POST] /api/admin/curriculum/compare — So sánh danh sách môn với CSDL trường
   */
  async compareCurriculum(req, res) {
    try {
      const { courses, majorCode, cohort, idDt, useSample, filePath: customFilePath } = req.body;
      let courseList = courses;

      if (req.body.fileBase64) {
        const fs = require('fs');
        const uploadDir = path.join(__dirname, '../uploads/curriculum');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const cleanName = (req.body.fileName || 'curriculum.xlsx').replace(/[^a-zA-Z0-9._-]/g, '_');
        const savedFilePath = path.join(uploadDir, `${Date.now()}_${cleanName}`);
        const buffer = Buffer.from(req.body.fileBase64, 'base64');
        fs.writeFileSync(savedFilePath, buffer);

        const parsed = await ExcelCurriculumService.parseExcel(savedFilePath);
        courseList = parsed.courses;
      } else if (useSample || (!courses && !req.file)) {
        const filePath = customFilePath || path.join(__dirname, '../../cndmstk56.xlsx');
        const parsed = await ExcelCurriculumService.parseExcel(filePath);
        courseList = parsed.courses;
      }

      if (!courseList || !Array.isArray(courseList) || courseList.length === 0) {
        return res.status(400).json({ success: false, message: 'Danh sách môn học trống' });
      }

      const cleanCohort = String(cohort || '56').replace(/^[kK]/, '');
      const result = await ExcelCurriculumService.compareWithSchoolDb(courseList, majorCode || '7480201', cleanCohort, idDt);
      return res.json({
        success: true,
        data: result
      });
    } catch (err) {
      console.error('❌ [AdminController] compareCurriculum error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [POST] /api/admin/curriculum/save — Lưu danh sách môn vào MasterCurriculum
   */
  async saveMasterCurriculum(req, res) {
    try {
      const { courses, majorCode, cohort, majorName } = req.body;
      if (!courses || !Array.isArray(courses) || courses.length === 0) {
        return res.status(400).json({ success: false, message: 'Danh sách môn học trống' });
      }

      const cleanCohort = String(cohort || 'K56').startsWith('K') ? String(cohort) : `K${cohort}`;
      const result = await ExcelCurriculumService.saveMasterCurriculum(
        courses,
        majorCode || '7480201',
        cleanCohort,
        majorName || 'Công nghệ và đổi mới sáng tạo'
      );

      return res.json({
        success: true,
        message: `✅ Đã lưu và kích hoạt ${result.count} môn vào Khung chương trình chuẩn (${result.majorCode} - ${result.cohort})!`,
        data: result
      });
    } catch (err) {
      console.error('❌ [AdminController] saveMasterCurriculum error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [GET] /api/admin/curriculum/master — Lấy khung chuẩn đã lưu
   */
  async getMasterCurriculum(req, res) {
    try {
      const majorCode = req.query.majorCode || '7480201';
      const rawCohort = req.query.cohort || 'K56';
      const cleanCohort = rawCohort.startsWith('K') ? rawCohort : `K${rawCohort}`;
      const list = await ExcelCurriculumService.getMasterCurriculum(majorCode, cleanCohort);
      return res.json({
        success: true,
        data: list
      });
    } catch (err) {
      console.error('❌ [AdminController] getMasterCurriculum error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // QUẢN LÝ TÀI KHOẢN THANH TRA (INSPECTOR ACCOUNTS MANAGEMENT)
  // ═══════════════════════════════════════════════════════════════

  /**
   * [GET] /api/admin/inspectors — Lấy danh sách toàn bộ tài khoản thanh tra
   */
  async getInspectors(req, res) {
    try {
      const inspectors = await User.findAll({
        where: { role: 'inspector' },
        attributes: ['id', 'username', 'fullName', 'department', 'className', 'tuafStudentId', 'lastSyncedAt', 'createdAt'],
        order: [['createdAt', 'DESC']]
      });

      return res.json({
        success: true,
        data: inspectors
      });
    } catch (err) {
      console.error('❌ [AdminController] getInspectors error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [POST] /api/admin/inspectors — Thêm mới tài khoản thanh tra
   */
  async createInspector(req, res) {
    try {
      const { encrypt } = require('../utils/security');
      const { username, password, fullName, department } = req.body;

      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Tên đăng nhập và Mật khẩu không được để trống!' });
      }

      const trimmedUsername = username.trim();
      const existing = await User.findOne({
        where: { username: trimmedUsername, role: 'inspector' }
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Tài khoản thanh tra "${trimmedUsername}" đã tồn tại trong hệ thống!`
        });
      }

      // Check if user exists in TUAF SQL Server to attach tuafStudentId if any
      let tuafId = null;
      try {
        const pool = await namvietConnector.getPool();
        const gv = await tuafQueries.findLecturerId(pool, trimmedUsername);
        if (gv) {
          tuafId = gv.ID_cb;
        }
      } catch (_) {}

      const newInspector = await User.create({
        username: trimmedUsername,
        encryptedPassword: encrypt(password),
        role: 'inspector',
        fullName: (fullName && fullName.trim()) || trimmedUsername,
        department: (department && department.trim()) || 'Ban Thanh tra',
        className: '',
        tuafStudentId: tuafId
      });

      return res.json({
        success: true,
        message: `✅ Đã tạo tài khoản thanh tra "${trimmedUsername}" thành công!`,
        data: {
          id: newInspector.id,
          username: newInspector.username,
          fullName: newInspector.fullName,
          department: newInspector.department,
          createdAt: newInspector.createdAt
        }
      });
    } catch (err) {
      console.error('❌ [AdminController] createInspector error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [PUT] /api/admin/inspectors/:id — Cập nhật thông tin tài khoản thanh tra
   */
  async updateInspector(req, res) {
    try {
      const { id } = req.params;
      const { fullName, department } = req.body;

      const inspector = await User.findOne({ where: { id, role: 'inspector' } });
      if (!inspector) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản thanh tra!' });
      }

      if (fullName !== undefined) inspector.fullName = fullName.trim();
      if (department !== undefined) inspector.department = department.trim();

      await inspector.save();

      return res.json({
        success: true,
        message: '✅ Cập nhật thông tin thanh tra thành công!',
        data: {
          id: inspector.id,
          username: inspector.username,
          fullName: inspector.fullName,
          department: inspector.department
        }
      });
    } catch (err) {
      console.error('❌ [AdminController] updateInspector error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [PUT] /api/admin/inspectors/:id/password — Đổi mật khẩu tài khoản thanh tra
   */
  async changeInspectorPassword(req, res) {
    try {
      const { encrypt } = require('../utils/security');
      const { id } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 4 ký tự!' });
      }

      const inspector = await User.findOne({ where: { id, role: 'inspector' } });
      if (!inspector) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản thanh tra!' });
      }

      inspector.encryptedPassword = encrypt(newPassword);
      await inspector.save();

      return res.json({
        success: true,
        message: `✅ Đã đổi mật khẩu cho tài khoản "${inspector.username}" thành công!`
      });
    } catch (err) {
      console.error('❌ [AdminController] changeInspectorPassword error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [DELETE] /api/admin/inspectors/:id — Xóa tài khoản thanh tra
   */
  async deleteInspector(req, res) {
    try {
      const { id } = req.params;
      const inspector = await User.findOne({ where: { id, role: 'inspector' } });
      if (!inspector) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản thanh tra!' });
      }

      const deletedUsername = inspector.username;
      await inspector.destroy();

      return res.json({
        success: true,
        message: `✅ Đã xóa tài khoản thanh tra "${deletedUsername}" thành công!`
      });
    } catch (err) {
      console.error('❌ [AdminController] deleteInspector error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * [GET] /api/admin/inspectors/lookup — Tra cứu thông tin cán bộ từ SQL Server TUAF
   */
  async lookupTuafStaff(req, res) {
    try {
      const { username } = req.query;
      if (!username) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp username để tra cứu' });
      }

      const pool = await namvietConnector.getPool();
      const hrRes = await pool.request()
        .input('username', username.trim())
        .query(`
          SELECT TOP 1 cb.ID_cb, cb.Ma_cb, cb.Ho_ten, cb.Email, cb.Dien_thoai, dv.Ten_dv
          FROM HR_LyLich cb
          LEFT JOIN dmDonViQuanLy dv ON cb.ID_dv = dv.ID_dv
          WHERE cb.Ma_cb = @username OR cb.Email = @username
        `);

      const staff = hrRes.recordset[0] || null;
      if (!staff) {
        return res.json({
          success: false,
          found: false,
          message: `Không tìm thấy cán bộ "${username}" trong cơ sở dữ liệu TUAF`
        });
      }

      const staffData = {
        username: staff.Ma_cb || username,
        fullName: staff.Ho_ten,
        department: staff.Ten_dv || 'Cán bộ TUAF',
        email: staff.Email || '',
        lecturerId: staff.ID_cb
      };

      return res.json({
        success: true,
        found: true,
        data: staffData,
        staff: staffData
      });
    } catch (err) {
      console.error('❌ [AdminController] lookupTuafStaff error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d} ngày`);
  if (h > 0) parts.push(`${h} giờ`);
  if (m > 0) parts.push(`${m} phút`);
  parts.push(`${s} giây`);
  return parts.join(' ');
}

module.exports = new AdminController();
