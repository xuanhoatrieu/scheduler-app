# TUAF Schedule

Hệ thống xem lịch học và lịch giảng dạy thông minh dành cho Sinh viên & Giảng viên trường Đại học Nông Lâm Thái Nguyên (TUAF).

## Status: 🚧 Planning

Dự án đang trong giai đoạn lên ý tưởng và thiết kế kiến trúc kỹ thuật chi tiết.

## Project Management

Dự án sử dụng quy trình quản lý **Harness Engineering v4.3** tích hợp sâu trong AWF:
- **Risk Classification**: [docs/FEATURE_INTAKE.md](docs/FEATURE_INTAKE.md)
- **Test Tracking**: [docs/TEST_MATRIX.md](docs/TEST_MATRIX.md)
- **Stories**: [docs/stories/](docs/stories/)
- **Decisions**: [docs/decisions/](docs/decisions/)

## Next Steps

1. Gõ `/design` để explore kiến trúc kỹ thuật (Database, API endpoints, Strategy Pattern).
2. Duyệt qua [Implementation Plan](.gemini/antigravity-ide/brain/92605a57-d48d-442b-a6bc-f74bc23bdc8e/implementation_plan.md) để chốt thiết kế tổng quan.

---

## 📱 Hướng dẫn Build Mobile App (Expo / EAS Build)

Mã nguồn ứng dụng di động nằm trong thư mục `mobile/`. Dự án sử dụng **Expo EAS (Expo Application Services)** để đóng gói ứng dụng thử nghiệm và phát hành.

### 🛠️ 1. Chuẩn bị môi trường Build
1. Cài đặt `eas-cli` toàn cục (nếu chưa có):
   ```bash
   npm install -g eas-cli
   ```
2. Đăng nhập tài khoản Expo:
   ```bash
   eas login
   ```
3. Di chuyển vào thư mục ứng dụng di động:
   ```bash
   cd mobile
   ```

---

### 🧪 2. Build để Thử nghiệm (Test / Internal Preview)

#### 🤖 Android (Xuất file `.apk` cài trực tiếp lên điện thoại):
```bash
# Build trên Expo Cloud (Tự động xuất link tải file .apk)
eas build -p android --profile preview

# Hoặc build trực tiếp trên máy local (yêu cầu cài sẵn Android SDK/NDK):
eas build -p android --profile preview --local
```

#### 🍏 iOS (Xuất file `.ipa` thử nghiệm qua TestFlight hoặc Ad-Hoc):
```bash
eas build -p ios --profile preview
```

#### 📲 Thử nghiệm nhanh qua ứng dụng Expo Go (Không cần build APK):
```bash
npx expo start --tunnel
```
*(Mở ứng dụng **Expo Go** trên điện thoại Android/iOS và quét mã QR hiển thị trên terminal).*

---

### 🚀 3. Build để phát hành lên Google Play Store (CH Play)

Google Play Store bắt buộc ứng dụng phải đóng gói theo định dạng **Android App Bundle (`.aab`)**:

```bash
# 1. Build bản sản xuất Android App Bundle (.aab)
eas build -p android --profile production

# 2. (Tùy chọn) Tự động đẩy bản build mới nhất lên CH Play Console:
eas submit -p android
```

---

### 🍎 4. Build để phát hành lên Apple App Store (iOS)

Apple App Store yêu cầu tài khoản **Apple Developer Program** để đóng gói và ký mã nguồn (`.ipa`):

```bash
# 1. Build bản sản xuất iOS App Package (.ipa)
eas build -p ios --profile production

# 2. (Tùy chọn) Tự động đẩy bản build mới nhất lên App Store Connect / TestFlight:
eas submit -p ios
```



