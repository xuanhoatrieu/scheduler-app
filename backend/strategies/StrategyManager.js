const CrawlerStrategy = require('./CrawlerStrategy');
const DatabaseStrategy = require('./DatabaseStrategy');

/**
 * StrategyManager quản lý và cung cấp Chiến lược lấy dữ liệu thời gian thực
 * 
 * Chế độ:
 *   - 'database' (mặc định): Đọc SQL Server TUAF → cache PostgreSQL
 *   - 'crawler': Cào portal trường → cache PostgreSQL (fallback)
 */
class StrategyManager {
  constructor() {
    this.strategies = {
      crawler: new CrawlerStrategy(),
      database: new DatabaseStrategy()
    };
  }

  /**
   * Lấy chiến lược hoạt động dựa trên biến môi trường DATA_SOURCE
   * @returns {ScheduleStrategy} Đối tượng chiến lược cụ thể
   */
  getStrategy() {
    const mode = process.env.DATA_SOURCE || 'database';
    const strategy = this.strategies[mode.toLowerCase()];
    
    if (!strategy) {
      console.warn(`⚠️ Chế độ DATA_SOURCE="${mode}" không được hỗ trợ. Chuyển sang mặc định "database".`);
      return this.strategies.database;
    }
    
    return strategy;
  }

  /**
   * Lấy CrawlerStrategy cho fallback khi DatabaseStrategy lỗi
   * @returns {CrawlerStrategy}
   */
  getCrawlerStrategy() {
    return this.strategies.crawler;
  }
}

// Singleton pattern
module.exports = new StrategyManager();
