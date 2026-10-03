const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Announcement = require('./Announcement');

/**
 * Hộp thư thông báo của từng người dùng: một dòng / (thông báo, người nhận).
 * Người dùng CHỈ đọc được thông báo có dòng recipient của chính mình.
 */
const AnnouncementRecipient = sequelize.define('AnnouncementRecipient', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  announcementId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  indexes: [
    { unique: true, fields: ['announcementId', 'userId'], name: 'ann_recipient_unique' },
    { fields: ['userId', 'createdAt'], name: 'ann_recipient_user_index' }
  ]
});

AnnouncementRecipient.belongsTo(Announcement, { foreignKey: 'announcementId', as: 'announcement', constraints: false });

module.exports = AnnouncementRecipient;
