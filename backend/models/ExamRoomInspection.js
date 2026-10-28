const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ExamRoomInspection = sequelize.define('ExamRoomInspection', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  roomKey: {
    type: DataTypes.STRING(150),
    allowNull: false,
    comment: 'Khóa định danh phòng thi trong ngày (idDotThiPhong hoặc date_room_time_course)'
  },
  idDotThiPhong: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null
  },
  idPhongThi: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null
  },
  examDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  examTime: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: ''
  },
  courseCode: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: ''
  },
  courseName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: ''
  },
  room: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: ''
  },
  proctor1: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: ''
  },
  proctor2: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: ''
  },
  // normal=Bình thường, proctor_late=CBCT đi muộn, proctor_changed=Đổi CBCT, proctor_absent=Vắng CBCT, other_issue=Sự vụ khác
  status: {
    type: DataTypes.ENUM('pending', 'normal', 'proctor_late', 'proctor_changed', 'proctor_absent', 'other_issue'),
    allowNull: false,
    defaultValue: 'normal'
  },
  lateMinutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Số phút CB coi thi đến muộn (nếu có)'
  },
  substituteProctor: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: '',
    comment: 'Họ tên CB coi thi thay thực tế tại phòng (nếu đổi CBCT)'
  },
  hasPermission: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: true,
    comment: 'Đổi CB coi thi có báo trước / có phép hay không'
  },
  actualStudentCount: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    comment: 'Số thí sinh dự thi thực tế tại phòng (nếu thanh tra ghi nhận)'
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '',
    comment: 'Ghi chú kiểm tra phòng thi và cán bộ coi thi'
  },
  inspectorId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  inspectorName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: ''
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['examDate', 'roomKey'],
      name: 'idx_exam_room_inspection_unique'
    },
    {
      fields: ['examDate'],
      name: 'idx_exam_room_inspection_date'
    },
    {
      fields: ['idDotThiPhong'],
      name: 'idx_exam_room_inspection_dtp'
    }
  ]
});

module.exports = ExamRoomInspection;
