━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 HANDOVER DOCUMENT - TUAF SCHEDULE APP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Đang làm: Chuẩn bị triển khai Production lên VPS (Hoàn thành bảo mật Login Mobile)
🔢 Đến bước: Dự án đã hoàn thành toàn bộ tính năng cốt lõi, nâng cấp lưu phiên đăng nhập bảo mật và ghi nhớ tài khoản tự động. Sẵn sàng triển khai VPS.

✅ ĐÃ XONG:
   - **Phase 01: Setup & Upgrade** ✓ (Expo SDK 54, React 19.1, React Native 0.81)
   - **Phase 02: Database & Caching** ✓ (PostgreSQL 14, Sequelize ORM, mã hoá AES-256)
   - **Phase 03: Crawler Engine & Strategy** ✓ (SSO, Strategy Pattern, cào TKB/Lịch thi/Điểm/Học phí)
   - **Phase 04: Mobile 8 Màn hình & Tabs** ✓ (Bottom Tab Navigation)
   - **Phase 05: Smart Schedule Display** ✓ (Co gọn giai đoạn đã qua/chưa tới, mở rộng hiện tại)
   - **Phase 06: Push Notifications** ✓ (Nhắc lịch học tự động trước 30m và 15m)
   - **Phase 07: Launcher Script** ✓ (`start.sh` tự động hoá 100% Backend + Localtunnel + Expo)
   - **Phase 08: Lecturer Navigator & UI** ✓ (Phân quyền 2 role GV và SV, 4 tabs GV)
   - **Phase 09: Curriculum CTĐT (PA1)** ✓ (Màn hình CTĐT color-coded 4 trạng thái, Progress bar tín chỉ)
   - **Phase 10: Giờ học chi tiết & Sửa lỗi CTĐT đầy đủ** ✓ (Hiển thị giờ học/tiết học trực quan, sửa thuật toán rowspan cào thành công **74 môn học**, tự động Force Sync kỳ học cũ khi chuyển tab).
   - **Phase 11: Lưu phiên đăng nhập bảo mật & Ghi nhớ tài khoản** ✓ (Tích hợp `expo-secure-store` mã hóa token phần cứng, Axios response interceptor 401 tự động logout, kiểm tra session bằng API `/auth/me` lúc mở app, tự động điền tài khoản cũ).
   - **Tài liệu hướng dẫn triển khai VPS**: Đã viết tài liệu hướng dẫn chi tiết từng bước: [deployment_guide.md](file:///home/trieuhoa/lichhoc-app/docs/deployment_guide.md).

🔧 QUYẾT ĐỊNH QUAN TRỌNG:
   - **Rowspan Heuristic Parser**: Nhận diện hàng 9 cột (đầy đủ) và hàng 8 cột (khuyết do rowspan) để phân tích Khung CTĐT chính xác.
   - **Auto Force-Sync**: Tự động gọi API cào lịch học kỳ cũ từ portal trường về khi đổi tab học kỳ trên mobile để lấp đầy DB trống.
   - **PM2 & Nginx SSL**: Khuyên dùng PM2 quản lý tiến trình backend chạy ngầm và Certbot Nginx cho HTTPS domain SSL khi lên VPS.

⚠️ LƯU Ý CHO SESSION SAU:
   - Các files cấu hình cache local `.brain/` đều đã được đồng bộ trạng thái mới nhất (`save_count`: 4).
   - Dự án ở trạng thái cực kỳ ổn định, toàn bộ test integrations đều pass 100%.

📁 FILES QUAN TRỌNG:
   - [start.sh](file:///home/trieuhoa/lichhoc-app/start.sh) (Launcher script tích hợp)
   - [mobile/screens/ScheduleScreen.js](file:///home/trieuhoa/lichhoc-app/mobile/screens/ScheduleScreen.js) (Thời khóa biểu + quy đổi giờ)
   - [backend/services/parsers/curriculumParser.js](file:///home/trieuhoa/lichhoc-app/backend/services/parsers/curriculumParser.js) (Giải thuật rowspan)
   - [.brain/brain.json](file:///home/trieuhoa/lichhoc-app/.brain/brain.json) (Trạng thái bộ nhớ dự án)
   - [deployment_guide.md](file:///home/trieuhoa/lichhoc-app/docs/deployment_guide.md) (Hướng dẫn triển khai VPS)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Đã lưu! Để tiếp tục ở session sau: Gõ /recap
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
