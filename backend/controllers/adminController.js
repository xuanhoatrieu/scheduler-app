const os = require('os');
const axios = require('axios');
const sql = require('mssql');
const { sequelize } = require('../config/db');
const configService = require('../services/configService');
const namvietConnector = require('../services/namvietConnector');
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
