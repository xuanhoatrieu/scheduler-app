const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * SystemConfig Model — Lưu trữ các tham số cấu hình hệ thống
 * Cho phép chỉnh sửa cấu hình trực tiếp từ Admin Dashboard (Hot-Reload)
 */
const SystemConfig = sequelize.define('SystemConfig', {
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    primaryKey: true,
    comment: 'Tên biến cấu hình (VD: TUAF_DB_SERVER, DATA_SOURCE, ...)'
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '',
    comment: 'Giá trị cấu hình hiện tại'
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'general',
    comment: 'Nhóm phân loại (database, namviet, crawler, general, cron)'
  },
  label: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '',
    comment: 'Tên hiển thị tiếng Việt trên Admin UI'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '',
    comment: 'Mô tả chi tiết và hướng dẫn cấu hình'
  },
  isSecret: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Cờ bảo mật — nếu true thì mask dạng •••••••• trên UI'
  }
});

module.exports = SystemConfig;
