const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Finance = sequelize.define('Finance', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  semester: {
    type: DataTypes.STRING,
    allowNull: false
  },
  totalTuition: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  paidTuition: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  debtTuition: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  invoiceDetails: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  }
});

module.exports = Finance;
