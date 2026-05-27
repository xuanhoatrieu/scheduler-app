# Story Validation Plan: TUAF Schedule Epic

## Verification Objectives
Đảm bảo toàn bộ 8 phases chạy trơn tru, không lỗi syntax, bảo mật thông tin tài khoản người dùng tuyệt đối và phản hồi dữ liệu thời gian thực siêu tốc.

## Validation Strategy
- **Unit Tests**: Kiểm thử độc lập module mã hóa AES-256 và các cheerio HTML Parsers.
- **Integration Tests**: Kiểm thử tích hợp kết nối Database, kiểm tra cào dữ liệu thành công từ tài khoản mẫu Sinh viên (`DTN245748004`) và Giảng viên (`xuanhoatrieu`).
- **E2E Mobile Tests**: Kiểm thử chạy ứng dụng di động thật trên Expo Go, tắt mạng để kiểm tra chế độ xem Offline, nhấn nút đồng bộ để cập nhật realtime.

## Test Matrix Reference:
Các kịch bản kiểm thử chi tiết và trạng thái kiểm thử được định nghĩa và cập nhật tại:
*   [docs/TEST_MATRIX.md](../../TEST_MATRIX.md)
