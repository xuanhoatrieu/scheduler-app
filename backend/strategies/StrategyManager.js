const DatabaseStrategy = require('./DatabaseStrategy');

/**
 * StrategyManager quản lý và cung cấp Chiến lược lấy dữ liệu thời gian thực
 * 
 * Chế độ:
 *   - 'database' (duy nhất): Đọc SQL Server TUAF → cache PostgreSQL
 *   - Crawler web đã được tắt hoàn toàn theo yêu cầu hệ thống
 */
class StrategyManager {
  constructor() {
    this.strategies = {
      database: new DatabaseStrategy(),
      crawler: new DatabaseStrategy() // Đã vô hiệu hóa crawler web
    };
  }

  /**
   * Lấy chiến lược hoạt động — LUÔN dùng DatabaseStrategy (đọc SQL Server TUAF)
   * @returns {DatabaseStrategy}
   */
  getStrategy() {
    return this.strategies.database;
  }

  /**
   * Lấy DatabaseStrategy để đọc trực tiếp SQL Server
   * @returns {DatabaseStrategy}
   */
  getDatabaseStrategy() {
    return this.strategies.database;
  }

  /**
   * getCrawlerStrategy — Phương án crawler web đã tắt, luôn chuyển tiếp sang DatabaseStrategy
   * @returns {DatabaseStrategy}
   */
  getCrawlerStrategy() {
    console.warn('⚠️ [StrategyManager] Phương án crawler web đã tắt hoàn toàn. Đang sử dụng DatabaseStrategy.');
    return this.strategies.database;
  }
}

// Singleton pattern
module.exports = new StrategyManager();

