const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ExamViolation = sequelize.define('ExamViolation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  idDotThiPhong: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    comment: 'ID_dot_thi_phong hoặc ID_phong_thi trong SQL Server TUAF'
  },
  idPhongThi: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    comment: 'ID_phong_thi bên bảng MARK_ToChucThiPhong_TC (nếu có)'
  },
  roomKey: {
    type: DataTypes.STRING(150),
    allowNull: true,
    defaultValue: '',
    comment: 'Khóa định danh ca-phòng thi duy nhất trong ngày'
  },
  examDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Ngày thi YYYY-MM-DD'
  },
  examTime: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: '',
    comment: 'Khung giờ thi (VD: 07:30 - 09:00)'
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
  studentCode: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  studentName: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  studentClass: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: ''
  },
  seatNumber: {
    type: DataTypes.STRING(30),
    allowNull: true,
    defaultValue: ''
  },
  // reprimand=Khiển trách (-25%), warning=Cảnh cáo (-50%), suspension=Đình chỉ (0đ), late_disqualified=Muộn >15p, other=Khác
  violationLevel: {
    type: DataTypes.ENUM('reprimand', 'warning', 'suspension', 'late_disqualified', 'other'),
    allowNull: false,
    defaultValue: 'reprimand'
  },
  violationActions: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    comment: 'Danh sách các hành vi vi phạm quy chế đã chọn'
  },
  evidence: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '',
    comment: 'Tang vật thu giữ (nếu có)'
  },
  penalty: {
    type: DataTypes.STRING(255),
    allowNull: true,
    defaultValue: '',
    comment: 'Hình thức xử lý / trừ điểm đề xuất'
  },
  proctorNotified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Đã thông báo / bàn giao biên bản với Cán bộ coi thi tại phòng'
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '',
    comment: 'Ghi chú diễn biến chi tiết của thanh tra viên'
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
      fields: ['examDate'],
      name: 'idx_exam_violations_date'
    },
    {
      fields: ['idDotThiPhong'],
      name: 'idx_exam_violations_room'
    },
    {
      fields: ['studentCode'],
      name: 'idx_exam_violations_student'
    }
  ]
});

module.exports = ExamViolation;
