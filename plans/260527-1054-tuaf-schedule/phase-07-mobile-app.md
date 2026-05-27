# Phase 07: Mobile App - Frontend
Status: ⬜ Pending
Dependencies: Phase 06

## Objective
Phát triển ứng dụng di động React Native (Expo) mới hoàn toàn: xây dựng màn hình Đăng nhập (Login), màn hình Thời khóa biểu trực quan (Schedule) và tích hợp các API từ Backend.

## Requirements
### Functional
- [ ] Thiết kế màn hình Login hiện đại, đẹp mắt, hỗ trợ chọn vai trò (Sinh viên / Giảng viên).
- [ ] Thiết kế màn hình Dashboard hiển thị Thời khóa biểu trực quan dưới dạng lịch tuần/lịch tháng.
- [ ] Tích hợp tính năng offline cache (cho phép xem lịch học khi không có internet).

### Non-Functional
- [ ] Giao diện Responsive hoạt động tốt trên cả iOS và Android.
- [ ] Trải nghiệm UI/UX mượt mà, hiệu ứng chuyển trang mượt và tông màu hài hòa (Curated HSL Palette).

## Implementation Steps
1. [ ] Thiết kế cấu trúc thư mục React Native: `screens/`, `components/`, `services/`, `utils/`.
2. [ ] Xây dựng màn hình `LoginScreen.js`:
   - Giao diện glassmorphism sang trọng, input username, password.
   - Switch button chọn Role (Student / Teacher).
3. [ ] Xây dựng màn hình `ScheduleScreen.js`:
   - Lịch tuần trực quan, có thể vuốt qua lại.
   - Hiển thị chi tiết môn học, phòng học, ca học, giảng viên.
4. [ ] Viết module `services/api.js` sử dụng axios kết nối API backend, lưu trữ JWT bằng `SecureStore` (hoặc `AsyncStorage`).
5. [ ] Tích hợp chế độ Offline Mode: Khi mất mạng -> tự động đọc lịch học từ `AsyncStorage` cục bộ trên điện thoại.

## Files to Create/Modify
- `mobile/screens/LoginScreen.js` - Màn hình đăng nhập di động
- `mobile/screens/ScheduleScreen.js` - Màn hình thời khóa biểu di động
- `mobile/services/api.js` - Kết nối API backend
- `mobile/components/ScheduleCard.js` - Card hiển thị chi tiết môn học

## Test Criteria
- [ ] Chạy thử ứng dụng trên thiết bị thật thông qua Expo Go mượt mà.
- [ ] Đăng nhập thành công và hiển thị lịch học chi tiết chuẩn xác.
- [ ] Tắt mạng -> vẫn xem được lịch học đã lưu trữ cục bộ.

---
Next Phase: [phase-08-testing.md](phase-08-testing.md)
