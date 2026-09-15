const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const StudentAttendance = sequelize.define('StudentAttendance', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  scheduleId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  classCode: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  courseName: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  studentCode: {
    type: DataTypes.STRING,
    allowNull: false
  },
  studentName: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  studentClass: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  status: {
    type: DataTypes.ENUM('present', 'absent', 'late', 'excused'),
    allowNull: false,
    defaultValue: 'present'
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: ''
  },
  lecturerId: {
    type: DataTypes.UUID,
    allowNull: false
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['scheduleId', 'date', 'studentCode'],
      name: 'unique_schedule_date_student'
    },
    {
      fields: ['studentClass', 'date'],
      name: 'student_attendance_class_date_index'
    },
    {
      fields: ['date'],
      name: 'student_attendance_date_index'
    },
    {
      fields: ['lecturerId'],
      name: 'student_attendance_lecturer_index'
    }
  ]
});

module.exports = StudentAttendance;
