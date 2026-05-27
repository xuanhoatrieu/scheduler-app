# Phase 06: Cron Job & Backend API
Status: ✅ Complete
Dependencies: Phase 05

## Objective
Thiết lập Cron Job chạy tự động vào lúc 3h sáng để đồng bộ trước toàn bộ lịch học của người dùng vào Database đệm (Cache), và xây dựng các API endpoints bảo mật cho Mobile App.

## Requirements
### Functional
- [x] Viết dịch vụ Cron Job (node-cron) tự động giải mã mật khẩu người dùng, đăng nhập và cập nhật lịch học mới nhất lúc 3h sáng.
- [x] Xây dựng API `/api/auth/login` thực hiện đăng nhập và đăng ký tài khoản (nếu chưa có).
- [x] Xây dựng API `/api/schedule` trả về lịch học của người dùng từ Database đệm (hoạt động realtime cực nhanh).

### Non-Functional
- [x] API phải được bảo mật bằng mã JWT (JSON Web Token).
- [x] Giảm thiểu tối đa thời gian phản hồi API dưới 100ms nhờ cơ chế Cache.

## Implementation Steps
1. [x] Viết file `backend/jobs/syncScheduler.js` định cấu hình cron job chạy hàng ngày lúc 3:00 sáng.
2. [x] Trong job: Lấy danh sách tất cả Users, giải mã mật khẩu bằng AES-256, chạy crawler để lấy lịch học mới nhất, ghi đè cập nhật vào `Schedule` collection.
3. [x] Xây dựng các route Express.js:
   - POST `/api/auth/login`: Lấy username/password/role. Thực hiện đăng nhập thử vào cổng trường để xác thực. Nếu đúng -> lưu user (mật khẩu đã mã hóa) vào DB, trả về JWT.
   - GET `/api/schedule`: Lấy JWT xác thực, trả về thời khóa biểu lưu trong DB cache cực nhanh. Nếu muốn đồng bộ mới -> hỗ trợ query parameter `?forceSync=true`.

## Files to Create/Modify
- `backend/jobs/syncScheduler.js` - Dịch vụ chạy ngầm Cron Job
- `backend/routes/auth.js` - API Route xác thực
- `backend/routes/schedule.js` - API Route lấy thời khóa biểu

## Test Criteria
- [x] Kích hoạt chạy Cron Job thủ công -> toàn bộ lịch học của các tài khoản mẫu được đồng bộ và lưu vào DB thành công.
- [x] Gọi API `/api/schedule` trả về dữ liệu siêu tốc (< 50ms) vì không phải đợi đăng nhập portal trường nữa.

---
Next Phase: [phase-07-mobile-app.md](phase-07-mobile-app.md)
