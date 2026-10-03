const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Thông báo do Admin gửi (toàn trường / khóa / lớp / giảng viên / tài khoản cụ thể).
 * Người nhận cụ thể nằm ở AnnouncementRecipient; push đi qua NotificationOutbox (kind=announcement).
 */
const Announcement = sequelize.define('Announcement', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  senderLabel: {
    type: DataTypes.STRING(60),
    allowNull: false,
    defaultValue: 'Nhà trường'
  },
  audienceType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'all | students | lecturers | cohorts | classes | users'
  },
  audience: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '{}',
    comment: 'JSON tham số đối tượng nhận đã chuẩn hóa'
  },
  audienceLabel: {
    type: DataTypes.STRING(300),
    allowNull: false,
    defaultValue: ''
  },
  recipientCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  deviceUserCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Số người nhận có thiết bị đang bật push lúc gửi'
  },
  urgent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'true = gửi ngay cả trong giờ yên lặng 22:00–06:30'
  },
  createdByIp: {
    type: DataTypes.STRING(64),
    allowNull: true
  }
}, {
  indexes: [
    { fields: ['createdAt'], name: 'announcement_created_index' }
  ]
});

module.exports = Announcement;
