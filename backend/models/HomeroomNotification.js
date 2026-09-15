const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const HomeroomNotification = sequelize.define('HomeroomNotification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  homeroomClass: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Ma lop chu nhiem (VD: TY 54 N01)'
  },
  homeroomTeacherId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'User ID trong he thong app cua GVCN'
  },
  tuafLecturerId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Id_cb tren he thong TUAF cua GVCN'
  },
  scheduleId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  courseName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  sessionDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  periodText: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  room: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  courseTeacherName: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  absentCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  lateCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  excusedCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  studentDetails: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '[]',
    comment: 'JSON array chua danh sach sinh vien vang/muon/phep'
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  indexes: [
    {
      fields: ['homeroomClass', 'sessionDate'],
      name: 'homeroom_notif_class_date_index'
    },
    {
      fields: ['tuafLecturerId'],
      name: 'homeroom_notif_tuaf_lecturer_index'
    },
    {
      fields: ['homeroomTeacherId'],
      name: 'homeroom_notif_teacher_index'
    }
  ]
});

module.exports = HomeroomNotification;
