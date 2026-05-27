# Phase 01: Setup Environment
Status: ⬜ Pending
Dependencies: None

## Objective
Khởi tạo cấu trúc dự án sạch sẽ cho cả Backend và Mobile App, cài đặt các thư viện cốt lõi và cấu hình TypeScript/ESLint.

## Requirements
### Functional
- [ ] Khởi tạo ứng dụng Express.js ở backend.
- [ ] Khởi tạo ứng dụng React Native / Expo ở thư mục mobile.
- [ ] Cấu hình các biến môi trường (`.env.example`).

### Non-Functional
- [ ] Thiết lập quy chuẩn mã nguồn sạch (ESLint, Prettier).
- [ ] Cài đặt sẵn môi trường chạy thử nghiệm độc lập.

## Implementation Steps
1. [ ] Cấu hình `package.json` mới ở backend, cài đặt các dependencies cốt lõi (`express`, `dotenv`, `cors`, `helmet`, `crypto-js`, `axios`, `cheerio`, `node-cron`).
2. [ ] Khởi tạo Expo App trong thư mục `mobile/` bằng lệnh `npx create-expo-app mobile --template blank`.
3. [ ] Viết file cấu hình `.env.example` định nghĩa:
   - `PORT=5000`
   - `DATA_SOURCE=crawler` (crawler hoặc api)
   - `ENCRYPTION_KEY=your-aes-key-here`
   - `DB_URI=mongodb://localhost:27017/tuaf-schedule`
4. [ ] Tạo file cấu hình gitignore cho cả backend và mobile.

## Files to Create/Modify
- `backend/package.json` - Cấu hình backend dependencies
- `backend/server.js` - Server Express khởi chạy cơ bản
- `mobile/` - Mã nguồn khởi tạo của React Native App
- `.env.example` - Định nghĩa môi trường mẫu

## Test Criteria
- [ ] Backend khởi chạy thành công trên port 5000 (`npm run dev`).
- [ ] Mobile App khởi chạy thành công trên Expo Go.

---
Next Phase: [phase-02-database.md](phase-02-database.md)
