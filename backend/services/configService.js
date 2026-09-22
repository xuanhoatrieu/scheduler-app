const SystemConfig = require('../models/SystemConfig');

/**
 * Danh mục cấu hình mặc định ban đầu
 */
const DEFAULT_CONFIGS = [
  // 1. Cấu hình Chung
  {
    key: 'DATA_SOURCE',
    category: 'general',
    label: 'Chế độ Nguồn Dữ Liệu (Data Source)',
    description: 'Chọn "database" (kết nối SQL Server TUAF + NamViet API) hoặc "crawler" (cào trực tiếp từ Portal trường)',
    defaultValue: 'database',
    isSecret: false
  },
  {
    key: 'PORT',
    category: 'general',
    label: 'Cổng Backend API (Port)',
    description: 'Cổng lắng nghe của máy chủ Express (Mặc định: 5000)',
    defaultValue: '5000',
    isSecret: false
  },

  // 2. Cấu hình NamViet Connect API
  {
    key: 'NAMVIET_API_URL',
    category: 'namviet',
    label: 'NamViet API Endpoint',
    description: 'Địa chỉ máy chủ API NamViet Connect để lấy Token & IP động',
    defaultValue: 'http://api.namvietjsc.edu.vn',
    isSecret: false
  },
  {
    key: 'NAMVIET_SECRET_KEY',
    category: 'namviet',
    label: 'NamViet Secret Key',
    description: 'Mã khóa bí mật kết nối API NamViet',
    defaultValue: '888A8CFD-AC0495-4D54-93C9-T2H2I0N4H1995',
    isSecret: true
  },
  {
    key: 'NAMVIET_MA_TRUONG',
    category: 'namviet',
    label: 'Mã Trường NamViet',
    description: 'Mã định danh trường học trên hệ sinh thái NamViet (TUAF)',
    defaultValue: 'TUAF',
    isSecret: false
  },
  {
    key: 'NAMVIET_USERNAME',
    category: 'namviet',
    label: 'Tài Khoản NamViet Connect',
    description: 'Tên người dùng hệ thống đăng ký với NamViet',
    defaultValue: 'xuanh',
    isSecret: false
  },

  // 3. Cấu hình SQL Server TUAF (Fallback / Direct)
  {
    key: 'TUAF_DB_SERVER',
    category: 'database',
    label: 'SQL Server TUAF (IP / Host)',
    description: 'Địa chỉ máy chủ SQL Server TUAF (Mạng nội bộ)',
    defaultValue: process.env.TUAF_DB_SERVER || '',
    isSecret: false
  },
  {
    key: 'TUAF_DB_NAME',
    category: 'database',
    label: 'Tên Database SQL Server',
    description: 'Tên cơ sở dữ liệu trên máy chủ SQL Server',
    defaultValue: process.env.TUAF_DB_NAME || 'ESS_TUAF_NEW_2',
    isSecret: false
  },
  {
    key: 'TUAF_DB_USER',
    category: 'database',
    label: 'Tài Khoản SQL Server',
    description: 'Tên đăng nhập SQL Server TUAF',
    defaultValue: process.env.TUAF_DB_USER || '',
    isSecret: false
  },
  {
    key: 'TUAF_DB_PASSWORD',
    category: 'database',
    label: 'Mật Khẩu SQL Server',
    description: 'Mật khẩu xác thực SQL Server TUAF',
    defaultValue: process.env.TUAF_DB_PASSWORD || '',
    isSecret: true
  },

  // 4. Cấu hình Portal Web (Crawler Mode)
  {
    key: 'PORTAL_STUDENT_URL',
    category: 'crawler',
    label: 'URL Cổng Sinh Viên',
    description: 'Địa chỉ Cổng thông tin đào tạo sinh viên TUAF',
    defaultValue: 'https://sinhvien.tuaf.edu.vn',
    isSecret: false
  },
  {
    key: 'PORTAL_LECTURER_URL',
    category: 'crawler',
    label: 'URL Cổng Giảng Viên',
    description: 'Địa chỉ Cổng thông tin giảng viên TUAF',
    defaultValue: 'https://giangvien.tuaf.edu.vn',
    isSecret: false
  },
  {
    key: 'PORTAL_SSO_URL',
    category: 'crawler',
    label: 'URL Xác Thực SSO',
    description: 'Địa chỉ Cổng xác thực tập trung SSO TUAF',
    defaultValue: 'https://sso.tuaf.edu.vn',
    isSecret: false
  },

  // 5. Cấu hình Cron Job
  {
    key: 'CRON_SCHEDULE_SYNC',
    category: 'cron',
    label: 'Lịch Cron Job Quét Dữ Liệu',
    description: 'Biểu thức Cron quét tự động (Mặc định "0 3 * * *" = 3:00 sáng hàng ngày)',
    defaultValue: '0 3 * * *',
    isSecret: false
  },

  // 6. Cấu hình Email Báo Cáo & SMTP Gateway
  {
    key: 'SMTP_HOST',
    category: 'email',
    label: 'Máy chủ SMTP (SMTP Host)',
    description: 'Địa chỉ máy chủ gửi thư (Mặc định: smtp.gmail.com cho Gmail / Google Workspace)',
    defaultValue: 'smtp.gmail.com',
    isSecret: false
  },
  {
    key: 'SMTP_PORT',
    category: 'email',
    label: 'Cổng SMTP (SMTP Port)',
    description: 'Cổng kết nối gửi thư (465 cho SSL, hoặc 587 cho TLS/STARTTLS)',
    defaultValue: '465',
    isSecret: false
  },
  {
    key: 'SMTP_USER',
    category: 'email',
    label: 'Tài Khoản Email Gửi (SMTP User)',
    description: 'Địa chỉ email dùng để gửi thư thông báo và báo cáo (VD: thanhtra.tuaf@gmail.com hoặc Google Workspace)',
    defaultValue: '',
    isSecret: false
  },
  {
    key: 'SMTP_PASS',
    category: 'email',
    label: 'Mật Khẩu Ứng Dụng Email (SMTP App Password)',
    description: 'Mật khẩu ứng dụng 16 ký tự tạo từ tài khoản Google (Bảo mật -> Xác minh 2 bước -> Mật khẩu ứng dụng)',
    defaultValue: '',
    isSecret: true
  },
  {
    key: 'SMTP_FROM_NAME',
    category: 'email',
    label: 'Tên Người Gửi Hiển Thị (From Name)',
    description: 'Tên cơ quan/đơn vị hiển thị trên hộp thư đến của người nhận',
    defaultValue: 'Thanh Tra Đào Tạo TUAF',
    isSecret: false
  },
  {
    key: 'INSPECTOR_REPORT_EMAILS',
    category: 'email',
    label: 'Danh Sách Email Nhận Báo Cáo (BGH & Lãnh Đạo)',
    description: 'Các địa chỉ email nhận báo cáo tự động, phân cách bằng dấu phẩy (VD: hieutruong@tuaf.edu.vn, bgh@tuaf.edu.vn)',
    defaultValue: '',
    isSecret: false
  }
];

class ConfigService {
  constructor() {
    this.memoryCache = new Map();
  }

  /**
   * Khởi tạo và nạp cấu hình từ DB vào bộ nhớ runtime process.env
   */
  async init() {
    try {
      console.log('⚙️ [ConfigService] Khởi tạo tham số cấu hình hệ thống...');

      for (const item of DEFAULT_CONFIGS) {
        let record = await SystemConfig.findByPk(item.key);
        if (!record) {
          // Lấy giá trị từ process.env hiện tại (nếu có) hoặc defaultValue
          const initialValue = process.env[item.key] || item.defaultValue;
          record = await SystemConfig.create({
            key: item.key,
            value: initialValue,
            category: item.category,
            label: item.label,
            description: item.description,
            isSecret: item.isSecret
          });
        }
        this.memoryCache.set(record.key, record.value);
        process.env[record.key] = record.value;
      }

      console.log(`✅ [ConfigService] Đã nạp ${this.memoryCache.size} tham số cấu hình.`);
    } catch (err) {
      console.error('❌ [ConfigService] Lỗi khi khởi tạo cấu hình:', err.message);
    }
  }

  /**
   * Lấy danh sách toàn bộ cấu hình (che mật khẩu nếu maskSecrets = true)
   */
  async getAll(maskSecrets = true) {
    const records = await SystemConfig.findAll({ order: [['category', 'ASC'], ['key', 'ASC']] });
    return records.map(r => {
      const item = r.toJSON();
      if (maskSecrets && item.isSecret && item.value) {
        item.maskedValue = '••••••••';
      }
      return item;
    });
  }

  /**
   * Lấy giá trị của 1 key
   */
  get(key, fallback = null) {
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key);
    }
    return process.env[key] || fallback;
  }

  /**
   * Cập nhật 1 cấu hình và hot-reload runtime
   */
  async update(key, value) {
    let record = await SystemConfig.findByPk(key);
    if (!record) {
      record = await SystemConfig.create({ key, value });
    } else {
      record.value = value;
      await record.save();
    }

    this.memoryCache.set(key, value);
    process.env[key] = value;

    // Reset pool nếu cấu hình liên quan đến SQL Server / NamViet
    if (key.startsWith('TUAF_DB_') || key.startsWith('NAMVIET_')) {
      try {
        const namvietConnector = require('./namvietConnector');
        await namvietConnector.closePool();
        console.log('🔄 [ConfigService] Đã reset kết nối SQL Server pool cho cấu hình mới.');
      } catch (poolErr) {
        console.warn('⚠️ [ConfigService] Lỗi khi reset pool:', poolErr.message);
      }
    }

    return record;
  }

  /**
   * Cập nhật hàng loạt cấu hình
   */
  async bulkUpdate(updates) {
    const results = [];
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== '••••••••') {
        const updated = await this.update(key, String(value));
        results.push(updated);
      }
    }
    return results;
  }
}

module.exports = new ConfigService();
