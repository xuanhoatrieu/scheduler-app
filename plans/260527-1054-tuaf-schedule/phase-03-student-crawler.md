# Phase 03: Student Portal Crawler
Status: ⬜ Pending
Dependencies: Phase 02

## Objective
Lập trình công cụ đăng nhập tự động vào cổng sinh viên `sinhvien.tuaf.edu.vn`, trích xuất lịch học chi tiết học kỳ hiện tại và parse dữ liệu HTML sang JSON cấu trúc sạch.

## Requirements
### Functional
- [ ] Lập trình module đăng nhập tự động Sinh viên gửi request POST đến `/DangNhap/SaveToken`.
- [ ] Crawl HTML thời khóa biểu từ `/TraCuuLichHoc/ThongTinLichHoc`.
- [ ] Parse cấu trúc table HTML trích xuất thông tin: Tên học phần, Thứ, Tiết, Phòng, Giáo viên.

### Non-Functional
- [ ] Đảm bảo xử lý lỗi linh hoạt khi cổng thông tin trường bị nghẽn mạng hoặc thông tin đăng nhập sai.

## Implementation Steps
1. [ ] Lập trình hàm `loginStudent(username, password)` gửi POST đến `https://sinhvien.tuaf.edu.vn/DangNhap/SaveToken` trích xuất Session Cookie thành công.
2. [ ] Lập trình hàm `fetchStudentHtml(cookie, params)` gửi GET kèm Cookie lấy HTML lịch học (Semester, Year, Batch).
3. [ ] Sử dụng `cheerio` để viết bộ phân tích cú pháp HTML `parseStudentSchedule(html)`:
   - Parse các thẻ `<tr>`, xử lý việc gộp dòng hoặc tách nhiều dòng trong cùng một ô phòng học/tiết học.
   - Chuẩn hóa định dạng dữ liệu (Thứ -> số, Tiết -> mảng số tiết, Phòng học).
4. [ ] Tạo module chạy thử nghiệm `student_crawler_test.js` để kiểm tra luồng cào dữ liệu với tài khoản thật.

## Files to Create/Modify
- `backend/services/studentCrawler.js` - Module cào lịch học sinh viên
- `backend/services/parsers/studentParser.js` - Module phân tích cú pháp HTML sinh viên

## Test Criteria
- [ ] Cào thành công thời khóa biểu của sinh viên `DTN245748004` (Semester 2, 2025-2026).
- [ ] Dữ liệu JSON trả về đầy đủ các thông tin: Tên môn, Thứ, Tiết, Phòng, Giảng viên.

---
Next Phase: [phase-04-lecturer-sso.md](phase-04-lecturer-sso.md)
