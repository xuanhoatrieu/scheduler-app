const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: __dirname + '/.env' });

const path = require('path');
const { connectDB } = require('./config/db');
const { initCronJob } = require('./jobs/syncScheduler');
const { initInspectorCronJobs } = require('./jobs/inspectorReportJob');
const configService = require('./services/configService');

const authRoutes = require('./routes/auth');
const scheduleRoutes = require('./routes/schedule');
const lecturerRoutes = require('./routes/lecturer');
const inspectorRoutes = require('./routes/inspector');
const newsRoutes = require('./routes/news');
const adminRoutes = require('./routes/adminRoutes');
const documentRoutes = require('./routes/documentRoutes');
const { adminLocalGuard } = require('./middleware/adminAuth');

const app = express();

// Trust first proxy only (for Caddy/Nginx reverse proxy)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;
const isDev = process.env.NODE_ENV !== 'production';

// Security & Middleware with custom CSP for Admin UI & Fonts
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'http:', 'https:'],
        upgradeInsecureRequests: null
      }
    },
    hsts: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false
  })
);

// CORS: restrict to known origins in production
const corsOptions = isDev
  ? {}
  : {
      origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
    };
app.use(cors(corsOptions));

// Body parsing with size limit (50MB max for PDF/Word/Excel base64 uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// Static Public Assets (Web Admin UI & Icons)
app.use(express.static(path.join(__dirname, 'public')));

// Admin Portal Web UI (Protected with Local Guard)
app.get('/admin', adminLocalGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Privacy Policy & Terms of Service (Public for App Store Connect Compliance)
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});
app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// Admin API Routes (Protected with Local Guard)
app.use('/api/admin', adminRoutes);

// Routes Registration with rate limiting
app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api', scheduleRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/lecturer', lecturerRoutes);
app.use('/api/inspector', inspectorRoutes);
app.use('/api/documents', documentRoutes);

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
    timestamp: new Date(),
    adminPanel: 'http://localhost:' + PORT + '/admin'
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
    
    // 2. Khởi tạo và nạp cấu hình hệ thống từ DB
    await configService.init();
    
    // 3. Khởi chạy lịch chạy ngầm Cron Job
    initCronJob();
    initInspectorCronJobs();
    
    // 4. Khởi động Web API Server lắng nghe trên 0.0.0.0 (tất cả card mạng LAN & Local)
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`🎛️  Admin Web Dashboard:`);
      console.log(`   - Localhost: http://localhost:${PORT}/admin`);
      try {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        for (const iface of Object.values(interfaces)) {
          for (const alias of iface || []) {
            if (alias.family === 'IPv4' && !alias.internal) {
              console.log(`   - Mạng LAN:  http://${alias.address}:${PORT}/admin`);
              break;
            }
          }
        }
      } catch (e) {}
    });
  } catch (error) {
    console.error('❌ Failed to start Backend services:', error.message);
    process.exit(1);
  }
};

startServices();

