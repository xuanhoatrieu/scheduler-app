# Phase 08: Testing & Validation
Status: ⬜ Pending
Dependencies: Phase 07

## Objective
Kiểm thử toàn diện hệ thống từ đầu đến cuối (E2E), tối ưu hóa hiệu năng API, cập nhật ma trận kiểm thử Harness và đóng các câu chuyện dự án (Stories).

## Requirements
### Functional
- [ ] Kiểm thử E2E luồng đăng ký/đăng nhập -> cào dữ liệu -> lưu DB -> hiển thị lên mobile app.
- [ ] Kiểm thử tính đúng đắn của dữ liệu lịch học giữa portal trường và mobile app.

### Non-Functional
- [ ] Ma trận kiểm thử `docs/TEST_MATRIX.md` được cập nhật đầy đủ thông tin.
- [ ] Đảm bảo ứng dụng đạt điểm số kiểm tra bảo mật cao (không lộ secrets, mã hóa dữ liệu nhạy cảm).

## Implementation Steps
1. [ ] Thực hiện viết các kịch bản test tích hợp tự động cho API backend.
2. [ ] Tiến hành kiểm thử thực tế trên 2 tài khoản test của trường:
   - Sinh viên: `DTN245748004`
   - Giảng viên: `xuanhoatrieu`
3. [ ] Cập nhật toàn bộ các bài kiểm thử thành công vào ma trận [TEST_MATRIX.md](../../docs/TEST_MATRIX.md).
4. [ ] Tạo báo cáo nghiệm thu kỹ thuật và đóng story dự án.

## Files to Create/Modify
- `docs/TEST_MATRIX.md` - Cập nhật ma trận test
- `docs/stories/` - Đóng và hoàn thành các story packets

## Test Criteria
- [ ] 100% test cases trong ma trận kiểm thử được đánh dấu `PASS`.
- [ ] Toàn bộ hệ thống chạy ổn định và trơn tru.

---
Next Phase: None
