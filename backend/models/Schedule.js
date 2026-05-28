const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Schedule = sequelize.define('Schedule', {
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
  credits: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  classCode: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  studyTime: {
    type: DataTypes.STRING,
    allowNull: false
  },
  dayOfWeek: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  room: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  teacherName: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  periodText: {
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
  batch: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

module.exports = Schedule;
