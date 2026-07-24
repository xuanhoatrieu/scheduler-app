const { Sequelize } = require('sequelize');

// Connection string — MUST be provided via environment variable
const DB_URI = process.env.DB_URI;
if (!DB_URI) {
  console.error('❌ DB_URI environment variable is required!');
  process.exit(1);
}

const isDev = process.env.NODE_ENV !== 'production';

const sequelize = new Sequelize(DB_URI, {
  logging: isDev ? console.log : false,
  define: {
    timestamps: true // Tự động thêm createdAt và updatedAt cho mọi bảng
  }
});

const connectDB = async () => {
  try {
    // Đăng ký các models với Sequelize instance
    require('../models/User');
    require('../models/Schedule');
    require('../models/Exam');
    require('../models/Grade');
    require('../models/Finance');
    require('../models/Attendance');
    require('../models/DiemRenLuyen');
    require('../models/Curriculum');
    require('../models/News');

    await sequelize.authenticate();
    console.log('📡 PostgreSQL Connected successfully via Sequelize ORM!');
    
    // Tự động đồng bộ cấu trúc các bảng (Sequelize Sync)
    // Only use alter in development; use safe sync in production
    if (isDev) {
      await sequelize.sync({ alter: true });
    } else {
      await sequelize.sync();
    }
    console.log('✅ All database models synchronized successfully.');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
