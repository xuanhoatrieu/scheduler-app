const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Grade = sequelize.define('Grade', {
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
  processGrade: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null
  },
  midtermGrade: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null
  },
  finalGrade: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null
  },
  totalGrade10: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null
  },
  totalGrade4: {
    type: DataTypes.FLOAT,
    allowNull: true,
    defaultValue: null
  },
  letterGrade: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null
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

module.exports = Grade;
