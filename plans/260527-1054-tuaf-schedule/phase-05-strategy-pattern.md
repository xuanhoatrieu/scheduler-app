# Phase 05: Sourcing Strategy Pattern
Status: ✅ Complete
Dependencies: Phase 03, Phase 04

## Objective
Xây dựng kiến trúc Strategy Pattern cho việc truy xuất lịch học, cho phép hệ thống tự động đổi luồng giữa: Cào dữ liệu trực tiếp (Crawler Mode) và Truy vấn trực tiếp DB trường (API Mode) thông qua biến cấu hình.

## Requirements
### Functional
- [x] Tạo interface `ScheduleSourceStrategy` định nghĩa hàm `getSchedule(userId, credentials, params)`.
- [x] Triển khai `CrawlerStrategy` gọi các module trích xuất từ portal trường.
- [x] Triển khai `ApiStrategy` gọi kết nối API trực tiếp từ hệ thống trường (khi được cung cấp).
- [x] Xây dựng `ScheduleContext` để điều phối dựa trên biến môi trường `DATA_SOURCE`.

### Non-Functional
- [x] Đảm bảo tính mở rộng cao (sau này thêm nguồn dữ liệu mới không cần sửa mã nguồn Express).

## Implementation Steps
1. [x] Tạo file `backend/strategies/ScheduleStrategy.js` định nghĩa lớp cơ sở ảo.
2. [x] Tạo `backend/strategies/CrawlerStrategy.js` kế thừa từ `ScheduleStrategy`, thực thi việc đăng nhập cổng thông tin trường, cào dữ liệu, lưu cache vào Database và trả về JSON.
3. [x] Tạo `backend/strategies/ApiStrategy.js` kế thừa từ `ScheduleStrategy`, thực thi việc gọi HTTP request tới API nội bộ của trường để lấy dữ liệu.
4. [x] Tạo `backend/strategies/StrategyManager.js` khởi tạo chiến lược dựa trên `process.env.DATA_SOURCE`.

## Files to Create/Modify
- `backend/strategies/ScheduleStrategy.js` - Lớp base Strategy
- `backend/strategies/CrawlerStrategy.js` - Chiến lược Crawler
- `backend/strategies/ApiStrategy.js` - Chiến lược API trực tiếp
- `backend/strategies/StrategyManager.js` - Manager chuyển đổi chế độ

## Test Criteria
- [x] Đổi biến môi trường `DATA_SOURCE=crawler` -> luồng cào dữ liệu hoạt động mượt mà.
- [x] Đổi `DATA_SOURCE=api` -> hệ thống trỏ sang API (mock API) hoạt động mượt mà.

---
Next Phase: [phase-06-cron-api.md](phase-06-cron-api.md)
