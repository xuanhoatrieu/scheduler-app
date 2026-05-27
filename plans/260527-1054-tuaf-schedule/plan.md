# Plan: TUAF Schedule Greenfield Development
Created: 2026-05-27T10:54:00Z
Status: 🟡 In Progress

## Overview
Dự án TUAF Schedule phát triển hoàn toàn mới (Greenfield) hệ thống xem lịch học & giảng dạy thông minh cho Sinh viên và Giảng viên trường Đại học Nông Lâm Thái Nguyên (TUAF). Hệ thống hỗ trợ chế độ Dual-Mode chuyển đổi linh hoạt giữa Crawling dữ liệu trực tiếp từ các cổng thông tin và Kết nối trực tiếp vào Database của trường qua API.

## Tech Stack
- **Backend**: Node.js, Express.js
- **Database/Cache**: MongoDB hoặc PostgreSQL (phục vụ lưu trữ đệm)
- **Frontend/Mobile**: React Native (Expo)
- **Security**: AES-256-CBC mã hóa mật khẩu, JWT xác thực API
- **Cron Service**: node-cron đồng bộ lúc 3h sáng

## Phases

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 01 | Setup Environment | ✅ Complete | 100% |
| 02 | Database & Security | 🟡 In Progress | 0% |
| 03 | Student Portal Crawler | ⬜ Pending | 0% |
| 04 | Lecturer Portal SSO & Crawler | ⬜ Pending | 0% |
| 05 | Sourcing Strategy Pattern | ⬜ Pending | 0% |
| 06 | Cron Job & Backend API | ⬜ Pending | 0% |
| 07 | Mobile App - Frontend | ⬜ Pending | 0% |
| 08 | Testing & Validation | ⬜ Pending | 0% |

## Quick Commands
- Start Phase 1: `/code phase-01`
- Check progress: `/next`
- Save context: `/save-brain`
