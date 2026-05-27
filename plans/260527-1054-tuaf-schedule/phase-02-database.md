# Phase 02: Database & Security
Status: ⬜ Pending
Dependencies: Phase 01

## Objective
Thiết kế Schema cơ sở dữ liệu đệm (Cache) cho lịch học của sinh viên và lịch dạy của giảng viên, đồng thời thiết lập cơ chế mã hóa AES-256 bảo mật thông tin đăng nhập.

## Requirements
### Functional
- [ ] Thiết kế Schema cho bảng/collection `User` (lưu trữ thông tin sinh viên/giảng viên, token đăng nhập, mật khẩu đã mã hóa).
- [ ] Thiết kế Schema cho `Schedule` (lưu trữ thời khóa biểu chi tiết).
- [ ] Xây dựng Module mã hóa/giải mã AES-256-CBC.

### Non-Functional
- [ ] Tuyệt đối KHÔNG lưu mật khẩu của người dùng dưới dạng clear-text (phải dùng AES-256 mã hóa để khi chạy Cron Job có thể giải mã đăng nhập cổng thông tin trường).

## Implementation Steps
1. [ ] Cấu hình kết nối MongoDB (hoặc PostgreSQL) thông qua ODM Mongoose (hoặc Sequelize).
2. [ ] Định nghĩa `UserSchema` gồm: `username` (unique), `encryptedPassword`, `role` (student/lecturer), `fullName`, `className`, `lastSyncedAt`.
3. [ ] Định nghĩa `ScheduleSchema` gồm: `userId` (ref User), `courseName`, `credits`, `classCode`, `studyTime` (tiết), `dayOfWeek` (Thứ), `room`, `teacherName`, `semester`, `schoolYear`, `batch`.
4. [ ] Viết module `security.js` sử dụng thư viện `crypto` của Node.js:
   - Hàm `encrypt(text)` -> mã hóa mật khẩu dùng key từ `.env`.
   - Hàm `decrypt(ciphertext)` -> giải mã mật khẩu khi cần đăng nhập portal trường.

## Files to Create/Modify
- `backend/models/User.js` - Định nghĩa Schema User
- `backend/models/Schedule.js` - Định nghĩa Schema Schedule
- `backend/utils/security.js` - Module mã hóa mật khẩu bảo mật
- `backend/config/db.js` - Module kết nối cơ sở dữ liệu

## Test Criteria
- [ ] Kết nối database thành công không lỗi.
- [ ] Viết test script mã hóa mật khẩu và giải mã thành công 100% không bị suy hao dữ liệu.

---
Next Phase: [phase-03-student-crawler.md](phase-03-student-crawler.md)
