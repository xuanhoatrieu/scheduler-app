const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Curriculum = sequelize.define('Curriculum', {
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
  courseCode: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  credits: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  courseType: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Bắt buộc'
  },
  knowledgeBlock: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Chung'
  }
});

module.exports = Curriculum;
