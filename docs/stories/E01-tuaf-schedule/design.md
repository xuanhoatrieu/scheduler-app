# Story Design: TUAF Schedule Greenfield

## Database Schema
Chi tiết thiết kế MongoDB Schema (Users, Schedules, Exams, Grades, Finances) được mô tả chi tiết tại:
*   [docs/DESIGN.md](../../DESIGN.md#1-cach-luu-tru-thong-tin-database-schema---mongodb)

## API Endpoints
Định nghĩa chi tiết các cửa ngõ kết nối (API Contracts) phục vụ Mobile App:
*   `POST /api/auth/login` - Đăng nhập, xác thực qua cổng trường, mã hóa mật khẩu, tạo JWT.
*   `GET /api/schedule` - Lấy thời khóa biểu và lịch thi từ Cache đệm.
*   `GET /api/grades` - Lấy kết quả học tập và biểu đồ GPA.
*   `GET /api/finance` - Lấy công nợ học phí và hóa đơn chi tiết.
*   `POST /api/sync` - Đồng bộ tức thì realtime (`forceSync`).

## Security Architecture
*   Thuật toán mã hóa: **AES-256-CBC** với khóa key lưu trữ ở môi trường `.env`.
*   Xác thực Session: **JSON Web Token (JWT)** có thời gian hết hạn ngắn.
*   Mã hóa HTTPS cho toàn bộ kênh truyền tải thông tin.
