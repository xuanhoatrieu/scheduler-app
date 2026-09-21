const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/auth');
const { adminLocalGuard } = require('../middleware/adminAuth');
const Document = require('../models/Document');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'documents');

// Đảm bảo thư mục lưu trữ tồn tại
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Format kích thước file thành chuỗi thân thiện (VD: 1.2 MB, 450 KB)
 */
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @route   GET /api/documents
 * @desc    Lấy danh sách các biểu mẫu & quy chế (cho Giảng viên & Sinh viên)
 * @access  Private (JWT)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { category, search } = req.query;
    const where = { isActive: true };

    if (category && category !== 'all') {
      where.category = category;
    }

    if (search && search.trim()) {
      where.title = { [Op.iLike]: `%${search.trim()}%` };
    }

    const documents = await Document.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      count: documents.length,
      data: documents
    });
  } catch (error) {
    console.error('❌ [API /documents] Lỗi:', error.message);
    res.status(500).json({ success: false, message: 'Không thể tải danh sách biểu mẫu, quy chế!', error: error.message });
  }
});

/**
 * @route   GET /api/documents/:id/download
 * @desc    Tăng lượt tải và chuyển hướng tải file
 * @access  Public / Private
 */
router.get('/:id/download', async (req, res) => {
  try {
    const doc = await Document.findByPk(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu!' });
    }
    doc.downloads = (doc.downloads || 0) + 1;
    await doc.save().catch(() => {});
    return res.redirect(doc.fileUrl);
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * ══════════════════════════════════════════════════════
 * ADMIN ROUTES (Protected by adminLocalGuard)
 * ══════════════════════════════════════════════════════
 */

/**
 * @route   GET /api/admin/documents
 * @desc    Lấy toàn bộ danh sách biểu mẫu quy chế trong trang quản trị
 */
router.get('/admin/all', adminLocalGuard, async (req, res) => {
  try {
    const docs = await Document.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   POST /api/admin/documents
 * @desc    Thêm mới biểu mẫu / quy chế (hỗ trợ upload Base64 hoặc link URL)
 */
router.post('/admin/create', adminLocalGuard, async (req, res) => {
  try {
    const { title, category, description, fileName, fileData, fileUrl, fileType } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tiêu đề biểu mẫu / quy chế!' });
    }

    let finalFileUrl = fileUrl || '';
    let finalFileName = fileName || 'tai-lieu.pdf';
    let finalFileSize = '0 KB';
    let detectedType = fileType || 'pdf';

    // Nếu người dùng upload file Base64 từ Admin UI
    if (fileData) {
      // Bóc tách base64 header nếu có: data:...;base64,
      const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer;
      if (matches && matches.length === 3) {
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(fileData, 'base64');
      }

      const timestamp = Date.now();
      const sanitizedName = (fileName || 'document.pdf')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .toLowerCase();
      const targetFileName = `${timestamp}_${sanitizedName}`;
      const targetPath = path.join(UPLOAD_DIR, targetFileName);

      fs.writeFileSync(targetPath, buffer);

      finalFileUrl = `/uploads/documents/${targetFileName}`;
      finalFileName = fileName || targetFileName;
      finalFileSize = formatFileSize(buffer.length);

      const ext = path.extname(targetFileName).replace('.', '').toLowerCase();
      detectedType = ext || 'pdf';
    }

    if (!finalFileUrl) {
      return res.status(400).json({ success: false, message: 'Vui lòng tải lên tệp tin hoặc cung cấp đường dẫn URL tài liệu!' });
    }

    const doc = await Document.create({
      title: title.trim(),
      category: category || 'daotao',
      fileUrl: finalFileUrl,
      fileName: finalFileName,
      fileSize: finalFileSize,
      fileType: detectedType,
      description: description || '',
      uploadedBy: 'Ban Quản Trị TUAF'
    });

    res.json({
      success: true,
      message: 'Đã lưu biểu mẫu, quy chế thành công!',
      data: doc
    });
  } catch (err) {
    console.error('❌ [Admin Create Document] Lỗi:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   DELETE /api/admin/documents/:id
 * @desc    Xóa biểu mẫu / quy chế
 */
router.delete('/admin/:id', adminLocalGuard, async (req, res) => {
  try {
    const doc = await Document.findByPk(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy biểu mẫu cần xóa!' });
    }

    // Nếu là file local trong uploads/documents thì xóa file
    if (doc.fileUrl && doc.fileUrl.startsWith('/uploads/documents/')) {
      const localPath = path.join(__dirname, '..', 'public', doc.fileUrl);
      if (fs.existsSync(localPath)) {
        try { fs.unlinkSync(localPath); } catch (_) {}
      }
    }

    await doc.destroy();
    res.json({ success: true, message: 'Đã xóa biểu mẫu thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
