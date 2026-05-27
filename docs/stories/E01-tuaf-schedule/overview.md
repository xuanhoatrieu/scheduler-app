# Story Epic: TUAF Schedule Greenfield Development

## Overview
Dự án phát triển mới hoàn toàn hệ thống thời khóa biểu thông minh TUAF Schedule cho Sinh viên và Giảng viên trường Đại học Nông Lâm Thái Nguyên (TUAF).

## Problem Statement
Sinh viên và giảng viên gặp khó khăn khi truy cập các cổng thông tin của trường để xem thời khóa biểu (giao diện chưa tối ưu di động, tốc độ tải chậm 3-5s, dễ bị nghẽn mạng).

## Solution
Xây dựng siêu ứng dụng di động React Native tích hợp Backend Express.js hỗ trợ lưu trữ đệm MongoDB, tự động đồng bộ Cron Job lúc 3:00 sáng. Dữ liệu bao gồm Lịch học, Lịch thi, Kết quả học tập (GPA/Điểm) và Tài chính (Học phí) phản hồi siêu tốc dưới 50ms và hỗ trợ xem offline.

## Risk Classification
- **Lane**: High-Risk (7 flags)
- **Risk Flags**:
  - `Auth`: Lưu trữ an toàn tài khoản/mật khẩu, xác thực API bằng JWT, đăng nhập portal trường.
  - `Authorization`: Phân chia phân quyền Sinh viên / Giảng viên.
  - `Data model`: Schema cache MongoDB.
  - `Audit/security`: Mã hóa AES-256 bảo vệ mật khẩu sinh viên chống rò rỉ.
  - `External systems`: Cào và parse dữ liệu từ `sinhvien.tuaf.edu.vn` và `giangvien.tuaf.edu.vn`.
  - `Public contracts`: Định nghĩa API endpoints mới.
  - `Cross-platform`: Expo app di động đa nền tảng.
