const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ServiceCatalog = sequelize.define(
  'ServiceCatalog',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Mã định danh thủ tục duy nhất (VD: XN_SINH_VIEN, XN_VAY_VON)',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Tên thủ tục hành chính hiển thị cho sinh viên',
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'CTSV',
      comment: 'Phòng ban phụ trách: CTSV, DAO_TAO, KHAO_THI, KTX, KHTC',
    },
    icon: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'document-text-outline',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    displayOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    slaHours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 24,
      comment: 'Thời hạn cam kết giải quyết tính theo giờ hành chính',
    },
    assigneeName: {
      type: DataTypes.STRING(120),
      allowNull: true,
      defaultValue: '',
    },
    assigneeEmail: {
      type: DataTypes.STRING(150),
      allowNull: true,
      defaultValue: '',
    },
    assigneePhone: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: '',
    },
    assigneeUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
      comment: 'FK Users.id của cán bộ thụ lý để bắn Push Notification & xử lý trên App',
    },
    assigneeUsername: {
      type: DataTypes.STRING(150),
      allowNull: true,
      defaultValue: '',
      comment: 'Mã tài khoản cán bộ (username / Ma_cb) được phân quyền xử lý thủ tục trên App (hỗ trợ nhiều mã cách nhau bởi dấu phẩy)',
    },
    leaderName: {
      type: DataTypes.STRING(120),
      allowNull: true,
      defaultValue: '',
    },
    leaderEmail: {
      type: DataTypes.STRING(150),
      allowNull: true,
      defaultValue: '',
    },
    isPaid: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    feeAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Đơn giá lệ phí (VNĐ)',
    },
    postalFeeAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30000,
      comment: 'Cước chuyển phát bưu điện nếu chọn gửi tận nhà (VNĐ)',
    },
    bankAccountInfo: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        bankId: '970405',
        bankName: 'Agribank CN Thái Nguyên',
        accountNo: '888866669999',
        accountName: 'TRUONG DAI HOC NONG LAM TN',
      },
    },
    deliveryOptions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ['digital_pdf', 'office_pickup'],
      comment: 'Mảng các phương thức nhận kết quả: digital_pdf, office_pickup, postal_delivery',
    },
    pickupLocation: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: '',
      comment: 'Nơi nhận kết quả bản giấy trực tiếp (Admin cấu hình theo từng thủ tục)',
    },
    formSchema: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: 'Định nghĩa các trường nhập liệu động cho thủ tục',
    },
    requiresAttachment: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'none',
      comment: 'none | optional | required',
    },
    attachmentGuide: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    allowAlumni: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    indexes: [
      { unique: true, fields: ['code'] },
      { fields: ['isActive', 'displayOrder'] },
      { fields: ['department'] },
    ],
  }
);

module.exports = ServiceCatalog;
