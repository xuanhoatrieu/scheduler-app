const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Hàng đợi thông báo (transactional outbox).
 * Cron chỉ GHI sự kiện vào đây; worker đọc ra và gửi qua Expo Push.
 * dedupeKey UNIQUE → một sự kiện chỉ được gửi đúng một lần dù cron chạy lại.
 */
const NotificationOutbox = sequelize.define('NotificationOutbox', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  dedupeKey: {
    type: DataTypes.STRING(200),
    allowNull: false,
    unique: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  kind: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'grade | sync | digest | announcement'
  },
  silent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'true = push ẩn chỉ để app tự cập nhật lịch nhắc local'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  data: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '{}'
  },
  targetTokens: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON mảng token cụ thể; null = mọi thiết bị đang hoạt động của user'
  },
  status: {
    type: DataTypes.STRING(12),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'pending | sent | skipped | dead'
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  notBefore: {
    type: DataTypes.DATE,
    allowNull: false
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  lastError: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  sentAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  tickets: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON [{ id, token }] để đọc receipt'
  },
  receiptsCheckedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  indexes: [
    { fields: ['status', 'notBefore'], name: 'notif_outbox_status_time_index' },
    { fields: ['userId'], name: 'notif_outbox_user_index' }
  ]
});

module.exports = NotificationOutbox;
