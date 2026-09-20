const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Exam = sequelize.define('Exam', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  courseName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  examDate: {
    type: DataTypes.STRING,
    allowNull: false
  },
  examTime: {
    type: DataTypes.STRING,
    allowNull: false
  },
  room: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  seatNumber: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  examFormat: {
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
  },
  role: {
    type: DataTypes.STRING,
    defaultValue: 'student'
  },
  courseCode: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  credits: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  examShift: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  startTime: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  examAttempt: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  examBatch: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  classCode: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  className: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  studentCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  proctors: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  notes: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  trainingSystem: {
    type: DataTypes.STRING,
    defaultValue: 'DHCQ'
  }
});

module.exports = Exam;
