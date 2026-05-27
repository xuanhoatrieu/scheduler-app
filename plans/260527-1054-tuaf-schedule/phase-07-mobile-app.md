# Phase 07: Mobile App - Frontend
Status: ✅ Complete
Dependencies: Phase 06

## Objective
Phát triển ứng dụng di động React Native (Expo) mới hoàn toàn: xây dựng màn hình Đăng nhập (Login), màn hình Thời khóa biểu trực quan (Schedule) và tích hợp các API từ Backend.

## Requirements
### Functional
- [x] Thiết kế màn hình Login hiện đại, đẹp mắt, hỗ trợ chọn vai trò (Sinh viên / Giảng viên).
- [x] Thiết kế màn hình Dashboard hiển thị Thời khóa biểu trực quan dưới dạng lịch tuần/lịch tháng.
- [x] Tích hợp tính năng offline cache (cho phép xem lịch học khi không có internet).

### Non-Functional
- [x] Giao diện Responsive hoạt động tốt trên cả iOS và Android.
- [x] Trải nghiệm UI/UX mượt mà, hiệu ứng chuyển trang mượt và tông màu hài hòa (Curated HSL Palette).

## Implementation Steps
1. [x] Thiết kế cấu trúc thư mục React Native: `screens/`, `components/`, `services/`, `utils/`.
2. [x] Xây dựng màn hình `LoginScreen.js`:
   - Giao diện glassmorphism sang trọng, input username, password.
   - Switch button chọn Role (Student / Teacher).
3. [x] Xây dựng màn hình `ScheduleScreen.js` (tích hợp trong `DashboardScreen.js` đa tính năng).
4. [x] Viết module `services/api.js` sử dụng axios kết nối API backend, lưu trữ JWT bằng `SecureStore` (hoặc `AsyncStorage`).
5. [x] Tích hợp chế độ Offline Mode: Khi mất mạng -> tự động đọc lịch học từ `AsyncStorage` cục bộ trên điện thoại.

## Files to Create/Modify
- `mobile/screens/LoginScreen.js` - Màn hình đăng nhập di động
- `mobile/screens/DashboardScreen.js` - Màn hình thời khóa biểu di động
- `mobile/services/api.js` - Kết nối API backend
- `mobile/components/ScheduleCard.js` - Card hiển thị chi tiết môn học

## Test Criteria
- [x] Chạy thử ứng dụng trên thiết bị thật thông qua Expo Go mượt mà.
- [x] Đăng nhập thành công và hiển thị lịch học chi tiết chuẩn xác.
- [x] Tắt mạng -> vẫn xem được lịch học đã lưu trữ cục bộ.

---
Next Phase: [phase-08-testing.md](phase-08-testing.md)
