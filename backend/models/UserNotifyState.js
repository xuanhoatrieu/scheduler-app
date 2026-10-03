const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Trạng thái thông báo theo từng tài khoản (do cron cập nhật).
 * scheduleHash: dấu vân tay lịch học + lịch thi kỳ hiện tại.
 * scheduleChangedAt: lần cuối cron phát hiện lịch thay đổi → thiết bị nào chưa đồng bộ
 * lại sau thời điểm này thì lịch nhắc local có thể đã cũ.
 */
const UserNotifyState = sequelize.define('UserNotifyState', {
  userId: {
    type: DataTypes.UUID,
    primaryKey: true
  },
  scheduleHash: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  scheduleChangedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
});

module.exports = UserNotifyState;
