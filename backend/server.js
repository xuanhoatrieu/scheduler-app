const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: __dirname + '/.env' });

const { connectDB } = require('./config/db');
const { initCronJob } = require('./jobs/syncScheduler');

const authRoutes = require('./routes/auth');
const scheduleRoutes = require('./routes/schedule');
const lecturerRoutes = require('./routes/lecturer');
const inspectorRoutes = require('./routes/inspector');

const app = express();

// Trust first proxy only (for Caddy/Nginx reverse proxy)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const isDev = process.env.NODE_ENV !== 'production';

// Security & Middleware
app.use(helmet());

// CORS: restrict to known origins in production
const corsOptions = isDev
  ? {}
  : {
      origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    };
app.use(cors(corsOptions));

// Body parsing with size limit (1MB max)
app.use(express.json({ limit: '1mb' }));

// Rate limiting for login endpoint (brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  message: {
    success: false,
    message: 'Qua nhieu loi dang nhap. Vui long thu lai sau 15 phut!',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    success: false,
    message: 'Qua nhieu request. Vui long thu lai sau!',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Request Logger (debug only in dev)
if (isDev) {
  app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.originalUrl} [${req.ip}]`);
    next();
  });
}

const newsRoutes = require('./routes/news');

// Routes Registration with rate limiting
app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api', scheduleRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/lecturer', lecturerRoutes);
app.use('/api/inspector', inspectorRoutes);

// Health Check Route for Docker & Caddy
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date()
  });
});

// Basic Health Check Route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to TUAF Scheduler Backend API Services',
    status: 'Running',
    version: '1.0.0',
    timestamp: new Date()
  });
});

// 404 handler — return JSON for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Khong tim thay endpoint: ${req.method} ${req.originalUrl}`
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('❌ Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: isDev ? err.message : 'Loi server — vui long thu lai sau!'
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
