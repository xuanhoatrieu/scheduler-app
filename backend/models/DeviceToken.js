const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Thiết bị nhận push (Expo Push Token).
 * Mỗi token chỉ thuộc về ĐÚNG MỘT tài khoản (username + vai trò) tại một thời điểm:
 * đăng nhập tài khoản khác trên cùng máy → token được chuyển sang tài khoản mới;
 * đăng xuất → xóa token → tài khoản cũ không còn gửi được thông báo tới máy này.
 */
const DeviceToken = sequelize.define('DeviceToken', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  token: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  platform: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'unknown'
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'false khi Expo báo DeviceNotRegistered (gỡ app / thu hồi quyền)'
  },
  lastSeenAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  remindersSyncedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Lần cuối app lập lại lịch nhắc local thành công (dùng để quyết định có cần gửi bản tin sáng dự phòng)'
  }
}, {
  indexes: [
    { fields: ['userId'], name: 'device_tokens_user_index' }
  ]
});

module.exports = DeviceToken;
