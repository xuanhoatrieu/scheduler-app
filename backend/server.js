const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config({ path: __dirname + '/.env' });

const { connectDB } = require('./config/db');
const { initCronJob } = require('./jobs/syncScheduler');

const authRoutes = require('./routes/auth');
const scheduleRoutes = require('./routes/schedule');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes Registration
app.use('/api/auth', authRoutes);
app.use('/api', scheduleRoutes);

// Basic Health Check Route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to TUAF Schedule Backend API Services',
    status: 'Running',
    version: '1.0.0',
    timestamp: new Date()
  });
});

// Database & Cron Services Setup
const startServices = async () => {
  try {
    // 1. Kết nối và đồng bộ PostgreSQL
    await connectDB();
    
    // 2. Khởi chạy lịch chạy ngầm Cron Job
    initCronJob();
    
    // 3. Khởi động Web API Server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start Backend services:', error.message);
    process.exit(1);
  }
};

startServices();
