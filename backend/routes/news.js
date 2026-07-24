const express = require('express');
const router = express.Router();
const News = require('../models/News');
const authenticateToken = require('../middleware/auth');
const namvietConnector = require('../services/namvietConnector');
const tuafQueries = require('../services/tuafQueries');

/**
 * @route   GET /api/news
 * @desc    Lấy danh sách tin tức / thông báo chính thức từ Nhà trường
 * @access  Private (hoặc Public nếu mở cho khách)
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const role = req.user?.role || 'student';

    // Đã thử đọc từ SQL Server để luôn có dữ liệu mới nhất
    try {
      const pool = await namvietConnector.getPool();
      const rawNews = await tuafQueries.getSchoolNews(pool, role);
      if (rawNews && rawNews.length > 0) {
        for (const item of rawNews) {
          await News.upsert({
            newsId: item.newsId,
            title: item.title,
            summary: item.summary,
            content: item.content,
            imageUrl: item.imageUrl,
            postDate: item.postDate,
            targetStudent: item.targetStudent,
            targetLecturer: item.targetLecturer,
            category: item.category
          });
        }
      }
    } catch (err) {
      console.warn('⚠️ Lỗi truy vấn SQL Server cho tin tức, sử dụng cache PostgreSQL:', err.message);
    }

    const newsList = await News.findAll({
      order: [['postDate', 'DESC'], ['newsId', 'DESC']],
      limit: 100
    });

    return res.json({
      success: true,
      data: newsList
    });
  } catch (err) {
    console.error('Lỗi khi lấy tin tức:', err);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lấy tin tức' });
  }
});

/**
 * @route   GET /api/news/:id
 * @desc    Lấy chi tiết 1 bài tin tức
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    let article = await News.findOne({
      where: { id }
    });

    if (!article) {
      article = await News.findOne({
        where: { newsId: id }
      });
    }

    if (!article) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài viết' });
    }

    return res.json({
      success: true,
      data: article
    });
  } catch (err) {
    console.error('Lỗi lấy chi tiết tin tức:', err);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
  }
});

module.exports = router;
