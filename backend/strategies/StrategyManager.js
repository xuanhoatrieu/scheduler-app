const CrawlerStrategy = require('./CrawlerStrategy');
const ApiStrategy = require('./ApiStrategy');

/**
 * StrategyManager quản lý và cung cấp Chiến lược lấy dữ liệu thời gian thực
 */
class StrategyManager {
  constructor() {
    this.strategies = {
      crawler: new CrawlerStrategy(),
      api: new ApiStrategy()
    };
  }

  /**
   * Lấy chiến lược hoạt động dựa trên biến môi trường DATA_SOURCE
   * @returns {ScheduleStrategy} Đối tượng chiến lược cụ thể
   */
  getStrategy() {
    const mode = process.env.DATA_SOURCE || 'crawler';
    const strategy = this.strategies[mode.toLowerCase()];
    
    if (!strategy) {
      console.warn(`⚠️ Chế độ DATA_SOURCE="${mode}" không được hỗ trợ. Chuyển sang mặc định "crawler".`);
      return this.strategies.crawler;
    }
    
    return strategy;
  }
}

// Singleton pattern
module.exports = new StrategyManager();
