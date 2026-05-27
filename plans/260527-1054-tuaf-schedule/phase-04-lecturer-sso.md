# Phase 04: Lecturer Portal SSO & Crawler
Status: ⬜ Pending
Dependencies: Phase 02

## Objective
Lập trình module đăng nhập SSO giảng viên thông qua `sso.tuaf.edu.vn` để trích xuất cookie phiên của cổng giảng viên `giangvien.tuaf.edu.vn` và cào lịch giảng dạy.

## Requirements
### Functional
- [ ] Thực hiện luồng đăng nhập OIDC/SSO thông qua POST tới `https://sso.tuaf.edu.vn/Account/Login`.
- [ ] Trích xuất mã xác thực `__RequestVerificationToken` từ form đăng nhập SSO.
- [ ] Lấy Cookie phiên và crawl lịch dạy giảng viên.

### Non-Functional
- [ ] Bảo mật việc trích xuất và lưu trữ cookies tạm thời của giảng viên.

## Implementation Steps
1. [ ] Gửi GET request đến `https://sso.tuaf.edu.vn/Account/Login` trích xuất token bảo vệ CSRF `__RequestVerificationToken` bằng cheerio.
2. [ ] Gửi POST request đăng nhập SSO kèm token CSRF, username/password để lấy Auth Cookie của hệ thống SSO.
3. [ ] Lập trình hàm chuyển hướng (Follow 302 Redirect) để lấy cookie phiên chính thức tại `https://giangvien.tuaf.edu.vn/`.
4. [ ] Lập trình module cào lịch dạy giảng viên và parse dữ liệu HTML sang JSON.

## Files to Create/Modify
- `backend/services/lecturerCrawler.js` - Module cào lịch giảng viên
- `backend/services/parsers/lecturerParser.js` - Module phân tích cú pháp HTML lịch giảng viên

## Test Criteria
- [ ] Đăng nhập SSO thành công với tài khoản giảng viên `xuanhoatrieu`.
- [ ] Cào thành công danh sách lịch giảng dạy của giảng viên và parse cấu trúc chuẩn xác.

---
Next Phase: [phase-05-strategy-pattern.md](phase-05-strategy-pattern.md)
