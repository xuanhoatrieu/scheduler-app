# Changelog

Tất cả các thay đổi quan trọng đối với dự án **TUAF Schedule** sẽ được ghi nhận tại đây.

## [3.1.0] - 2026-05-28
### Added
- **Thời gian học chi tiết**: Thêm trường `periodText` vào database schema `Schedule`.
- **Giao diện thời gian học di động**:
  - Giao diện **Mở rộng**: Hiển thị giờ học thực tế quy đổi dạng tag màu sắc sinh động: `🕒 07:00 - 09:40 (Tiết 1-3)`.
  - Giao diện **Thu nhỏ**: Hiển thị nhanh số tiết và phòng học: `• Tiết 4-5 • Phòng D102`.
- **Tự động đồng bộ học kỳ cũ (Auto-Sync)**: Khi đổi sang các học kỳ cũ chưa có dữ liệu lịch học trong database, mobile app tự động kích hoạt API cào Force Sync ngầm để tải lịch học kỳ cũ từ portal trường về và lưu vào DB ngay lập tức.
- **Tài liệu hướng dẫn triển khai VPS**: Tạo tài liệu hướng dẫn triển khai sản phẩm lên VPS chi tiết từ A-Z: `deployment_guide.md`.
- **Bypass localtunnel reminder**: Bổ sung thêm headers `Bypass-Tunnel-Reminder` và `User-Agent` tuỳ chỉnh để vượt qua hoàn toàn trang cảnh báo nhắc nhở của localtunnel.

### Changed
- **Crawler Khung CTĐT**: Đưa các đường dẫn cào CTĐT thực tế của TUAF lên đầu: `/SinhVien/ChuyenNganhChinh` và `/SinhVien/DaoTaoToanTruong`.
- **Parser Khung CTĐT**: Cải tiến hoàn toàn giải thuật bóc tách hàng có `rowspan` cho cột "Kỳ thứ" (hàng đầy đủ có 9 cột, hàng khuyết có 8 cột). 

### Fixed
- **Sót môn chuyên ngành**: Khắc phục lỗi parser lệch cột khi gặp rowspan, giúp cào đầy đủ thành công **74 môn học chuyên ngành chính** (tăng vọt từ 9 môn bị lỗi trước đó).

---

## [3.0.0] - 2026-05-28
### Added
- **Khung Chương trình đào tạo (Curriculum CTĐT)**:
  - Cào Khung CTĐT từ portal trường qua 5 URL paths + fallback dùng bảng điểm.
  - API `/api/curriculum` merge thông tin CTĐT với bảng điểm và gán trạng thái.
  - Màn hình di động `CurriculumView` hiển thị color-coded (Đã đạt, Đang học, Học lại, Chưa học) cùng Progress Bar tín chỉ.
- **Giao diện Giảng viên (Lecturer UI)**:
  - Tách Navigator di động thành `AppNavigator` (Sinh viên) và `LecturerNavigator` (Giảng viên) phân quyền theo role đăng nhập.
  - 4 tabs Giảng viên: Lịch dạy (`TeachingScheduleScreen`), Lớp học phụ trách (`ClassListScreen`), Thông báo, Hồ sơ.
  - API `/api/lecturer/classes` lấy danh sách lớp giảng dạy.
- **Kịch bản chạy tự động (Launcher Script)**:
  - `start.sh` tự động hoá 100% quy trình khởi động Backend + Localtunnel + auto-sync URL vào mobile app + Expo tunnel.

---

## [2.0.0] - 2026-05-27
### Added
- Đăng nhập SSO Sinh viên cào TKB, điểm, lịch thi, học phí tự động lưu đệm PostgreSQL.
- 8 màn hình di động Expo phân tab Bottom Navigation.
- Đổi tiết học sang giờ nhắc lịch tự động trước 30 và 15 phút.
- Smart Expandable Schedule UI (co gọn giai đoạn đã qua/chưa tới).
- Mã hoá mật khẩu AES-256 đầu cuối trong PostgreSQL.
- Strategy Pattern (Dual-Mode) tự động điều phối API và Crawler.
- Cron Job tự động đồng bộ lúc 3:00 sáng hàng ngày.
