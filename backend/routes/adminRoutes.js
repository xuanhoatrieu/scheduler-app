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

// 5. Khung CTĐT & Đối soát (Curriculum Master & Diff)
router.get('/curriculum/cohorts', (req, res) => adminController.getCohorts(req, res));
router.get('/curriculum/majors', (req, res) => adminController.getMajorsByCohort(req, res));
router.post('/curriculum/parse-sample', (req, res) => adminController.parseSampleCurriculum(req, res));
router.post('/curriculum/compare', (req, res) => adminController.compareCurriculum(req, res));
router.post('/curriculum/save', (req, res) => adminController.saveMasterCurriculum(req, res));
router.get('/curriculum/master', (req, res) => adminController.getMasterCurriculum(req, res));

// 6. Quản lý tài khoản Thanh tra (Inspector Account Management)
router.get('/inspectors', (req, res) => adminController.getInspectors(req, res));
router.post('/inspectors', (req, res) => adminController.createInspector(req, res));
router.put('/inspectors/:id', (req, res) => adminController.updateInspector(req, res));
router.put('/inspectors/:id/password', (req, res) => adminController.changeInspectorPassword(req, res));
router.delete('/inspectors/:id', (req, res) => adminController.deleteInspector(req, res));
router.get('/inspectors/lookup', (req, res) => adminController.lookupTuafStaff(req, res));

module.exports = router;
