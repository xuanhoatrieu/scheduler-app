const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  encryptedPassword: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('student', 'lecturer', 'inspector', 'admin'),
    allowNull: false
  },
  fullName: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  className: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  department: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  lastSyncedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  tuafStudentId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
    comment: 'ID_sv/ID_cb UUID từ SQL Server TUAF — cache lại để không lookup mỗi lần'
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['username', 'role']
    }
  ]
});

module.exports = User;
