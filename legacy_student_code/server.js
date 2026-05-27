const express = require('express');
const cors = require('cors');
const tuafPortal = require('./portals/tuaf'); 

const app = express();
app.use(cors());
app.use(express.json());

// Định tuyến API - Đã đồng bộ theo biến maSV và pass của LoginScreen.js
app.post('/api/login', async (req, res) => {
    const { maSV, pass } = req.body;
    
    if (!maSV || !pass) {
        return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ tài khoản và mật khẩu!' });
    }

    try {
        // Truyền maSV làm username, pass làm password vào file cào dữ liệu tuaf.js
        const result = await tuafPortal.loginAndFetchSchedule(maSV, pass);
        return res.json(result);
    } catch (error) {
        console.error('Lỗi hệ thống backend:', error);
        return res.status(500).json({ success: false, message: 'Lỗi kết nối server cổng trường, vui lòng thử lại sau!' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server kết nối lịch học đang chạy mượt mà trên cổng ${PORT}`);
});