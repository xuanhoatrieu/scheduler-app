const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Model Điểm Rèn Luyện — Cache từ SQL Server bảng STU_DiemRenLuyen
 */
const DiemRenLuyen = sequelize.define('DiemRenLuyen', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  score: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null
  },
  classification: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  semester: {
    type: DataTypes.STRING,
    allowNull: false
  },
  schoolYear: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

module.exports = DiemRenLuyen;
