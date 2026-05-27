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
  }
});

module.exports = Exam;
