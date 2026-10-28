const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ServiceRequestLog = sequelize.define(
  'ServiceRequestLog',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    requestId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    actorId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    actorName: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: 'Hệ thống',
    },
    actorRole: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'system',
    },
    action: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    fromStatus: {
      type: DataTypes.STRING(32),
      allowNull: true,
      defaultValue: '',
    },
    toStatus: {
      type: DataTypes.STRING(32),
      allowNull: true,
      defaultValue: '',
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    attachments: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    indexes: [
      { fields: ['requestId', 'createdAt'] },
      { fields: ['action'] },
    ],
  }
);

module.exports = ServiceRequestLog;
