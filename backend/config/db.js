const { Sequelize } = require('sequelize');

// Connection string to vitts-postgres docker container
const DB_URI = process.env.DB_URI || 'postgresql://vitts:vitts@172.17.0.2:5432/vitts';

const sequelize = new Sequelize(DB_URI, {
  logging: false, // Tắt log SQL thô để giữ console sạch sẽ
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

    await sequelize.authenticate();
    console.log('📡 PostgreSQL Connected successfully via Sequelize ORM!');
    
    // Tự động đồng bộ cấu trúc các bảng (Sequelize Sync)
    await sequelize.sync({ alter: true });
    console.log('✅ All database models synchronized successfully.');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
