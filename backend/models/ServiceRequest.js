const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const ServiceCatalog = require('./ServiceCatalog');
const ServiceRequestLog = require('./ServiceRequestLog');

const ServiceRequest = sequelize.define(
  'ServiceRequest',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    requestCode: {
      type: DataTypes.STRING(32),
      allowNull: false,
      comment: 'Mã hồ sơ định danh (VD: MC-2026-0001)',
    },
    serviceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    serviceCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '',
    },
    serviceName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    isAlumni: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    studentUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    studentUsername: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: '',
    },
    studentFullName: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
    },
    studentClass: {
      type: DataTypes.STRING(80),
      allowNull: true,
      defaultValue: '',
    },
    studentFaculty: {
      type: DataTypes.STRING(120),
      allowNull: true,
      defaultValue: '',
    },
    studentPhone: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: '',
    },
    studentEmail: {
      type: DataTypes.STRING(150),
      allowNull: true,
      defaultValue: '',
    },
    nationalId: {
      type: DataTypes.STRING(32),
      allowNull: true,
      defaultValue: '',
    },
    graduationYear: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: '',
    },
    alumniInfo: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    formData: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    attachmentUrls: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    attachments: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    homeroomNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
      comment: 'Ý kiến nhận xét / xác nhận của Giáo viên chủ nhiệm (GVCN)',
    },
    homeroomNotedBy: {
      type: DataTypes.STRING(150),
      allowNull: true,
      defaultValue: '',
      comment: 'Họ tên GVCN đã ghi ý kiến',
    },
    homeroomNotedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'submitted',
      comment:
        'pending_payment | payment_review | submitted | processing | need_more_info | ready_for_pickup | completed | rejected | cancelled',
    },
    deliveryMethod: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'digital_pdf',
      comment: 'digital_pdf | office_pickup | postal_delivery',
    },
    postalAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    postalTrackingNumber: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: '',
    },
    trayLocation: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: '',
    },
    assignedTo: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    assignedStaffName: {
      type: DataTypes.STRING(120),
      allowNull: true,
      defaultValue: '',
    },
    assignedDepartment: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'CTSV',
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deadlineAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    warningSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    pickedUpAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    pickupQrCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: '',
    },
    isOverdue: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    overdueNotifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    overdueReasonCategory: {
      type: DataTypes.STRING(120),
      allowNull: true,
      defaultValue: '',
    },
    overdueReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    overdueExplainedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    overdueExplainedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    overdueExplainedByName: {
      type: DataTypes.STRING(120),
      allowNull: true,
      defaultValue: '',
    },
    leaderDirective: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    feeAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    paymentStatus: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'NOT_REQUIRED',
      comment: 'NOT_REQUIRED | UNPAID | PENDING_CONFIRM | PAID | REJECTED_PROOF',
    },
    paymentProofUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    paymentConfirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    paymentConfirmedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    paymentConfirmedByName: {
      type: DataTypes.STRING(120),
      allowNull: true,
      defaultValue: '',
    },
    paymentNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    staffNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    resultPdfUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    verifyQrCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    ratingCriteria: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    ratingComment: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    ratedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    indexes: [
      { unique: true, fields: ['requestCode'] },
      { fields: ['studentUserId'] },
      { fields: ['studentUsername'] },
      { fields: ['serviceId'] },
      { fields: ['status'] },
      { fields: ['assignedTo'] },
      { fields: ['assignedDepartment'] },
      { fields: ['isOverdue'] },
      { unique: true, fields: ['verifyQrCode'] },
    ],
  }
);

if (!ServiceRequest.associations.service) {
  ServiceRequest.belongsTo(ServiceCatalog, {
    as: 'service',
    foreignKey: 'serviceId',
  });
}
if (!ServiceCatalog.associations.requests) {
  ServiceCatalog.hasMany(ServiceRequest, {
    as: 'requests',
    foreignKey: 'serviceId',
  });
}
if (!ServiceRequest.associations.logs) {
  ServiceRequest.hasMany(ServiceRequestLog, {
    as: 'logs',
    foreignKey: 'requestId',
  });
}
if (!ServiceRequestLog.associations.request) {
  ServiceRequestLog.belongsTo(ServiceRequest, {
    as: 'request',
    foreignKey: 'requestId',
  });
}

module.exports = ServiceRequest;
