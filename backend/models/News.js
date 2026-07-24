const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const News = sequelize.define('News', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  newsId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  postDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  targetStudent: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  targetLecturer: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  category: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

module.exports = News;
