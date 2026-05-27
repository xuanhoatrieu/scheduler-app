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
    unique: true,
    validate: {
      notEmpty: true
    }
  },
  encryptedPassword: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('student', 'lecturer'),
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
  }
});

module.exports = User;
