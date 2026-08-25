const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adminLocalGuard } = require('../middleware/adminAuth');

// Toàn bộ Admin API phải đi qua Local Guard
router.use(adminLocalGuard);

// 1. Quản lý cấu hình (Config Management)
router.get('/configs', (req, res) => adminController.getConfigs(req, res));
router.put('/configs', (req, res) => adminController.updateConfigs(req, res));

// 2. Kiểm thử kết nối tức thời (Live Test Connection)
router.post('/test-connection', (req, res) => adminController.testConnection(req, res));

// 3. Giám sát hệ thống & Sức khỏe (Health & Stats)
router.get('/health', (req, res) => adminController.getHealth(req, res));

// 4. Tra cứu & Đồng bộ người dùng (User Inspection & Force Sync)
router.get('/users/inspect', (req, res) => adminController.inspectUser(req, res));
router.post('/users/sync', (req, res) => adminController.forceSyncUser(req, res));

module.exports = router;
