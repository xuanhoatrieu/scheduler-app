const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MasterCurriculum = sequelize.define('MasterCurriculum', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  majorCode: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '7480201'
  },
  majorName: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Công nghệ và đổi mới sáng tạo'
  },
  cohort: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'K56'
  },
  stt: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  courseCode: {
    type: DataTypes.STRING,
    allowNull: false
  },
  courseName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  courseNameEn: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  credits: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  theoryHours: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  practiceHours: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  semester: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1
  },
  excelSemester: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  majorBlockCode: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'I'
  },
  majorBlockName: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Khối kiến thức giáo dục đại cương'
  },
  subBlockCode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  blockCode: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'I'
  },
  blockName: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Khối kiến thức giáo dục đại cương'
  },
  subBlockName: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  courseType: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Bắt buộc' // 'Bắt buộc' | 'Tự chọn' | 'Điều kiện'
  },
  isElective: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  electiveGroup: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  isCondition: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false // true đối với GDTC, GDQP (không tính vào 153 TC)
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  indexes: [
    { fields: ['majorCode', 'cohort'] },
    { fields: ['courseCode'] }
  ]
});

module.exports = MasterCurriculum;
