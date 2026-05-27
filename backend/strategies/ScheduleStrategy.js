/**
 * Interface/Base class cho Strategy Pattern trích xuất dữ liệu Lịch học
 */
class ScheduleStrategy {
  /**
   * Lấy dữ liệu Lịch học, Lịch thi, Điểm, Học phí
   * @param {Object} user - Đối tượng User từ MongoDB Mongoose
   * @param {string} decryptedPassword - Mật khẩu cổng trường đã giải mã
   * @param {Object} options - { semester: string, schoolYear: string }
   * @returns {Object} Đối tượng dữ liệu trọn vẹn
   */
  async getSchedule(user, decryptedPassword, options) {
    throw new Error('Phương thức getSchedule() bắt buộc phải được kế thừa và hiện thực hóa.');
  }
}

module.exports = ScheduleStrategy;
