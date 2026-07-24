const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Attendance = sequelize.define('Attendance', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  scheduleId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  lecturerId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  inspectorId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  checkInTime: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  checkOutTime: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  },
  scheduledStart: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Gio quy dinh bat dau (VD: 07:00)'
  },
  scheduledEnd: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Gio quy dinh ket thuc (VD: 10:45)'
  },
  status: {
    type: DataTypes.ENUM('pending', 'on_time', 'late', 'early_leave', 'absent', 'exempt'),
    allowNull: false,
    defaultValue: 'pending'
  },
  lateMinutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'So phut di muon'
  },
  earlyMinutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'So phut ve som'
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
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
}, {
  indexes: [
    {
      unique: true,
      fields: ['scheduleId', 'date'],
      name: 'unique_schedule_date'
    },
    {
      fields: ['date'],
      name: 'attendance_date_index'
    },
    {
      fields: ['lecturerId'],
      name: 'attendance_lecturer_index'
    }
  ]
});

module.exports = Attendance;
