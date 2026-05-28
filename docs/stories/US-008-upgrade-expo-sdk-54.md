# US-008 Upgrade Expo SDK 54

## Status

implemented

## Lane

normal

## Product Contract

Nâng cấp hệ thống Expo Mobile App lên Expo SDK 54 tương thích tốt nhất, sử dụng React 19.1 và React Native 0.81, đảm bảo toàn bộ tính năng hiện tại (Đăng nhập, Lịch học, Lịch thi, Điểm số, Offline Caching) hoạt động ổn định và trơn tru.

## Relevant Product Docs

- `docs/HARNESS.md`
- `mobile/package.json`

## Acceptance Criteria

- [x] Nâng cấp thành công package `expo` lên `^54.0.0` trong `mobile/package.json`.
- [x] Align toàn bộ dependencies khác tương thích với SDK 54 qua `npx expo install --fix`.
- [x] Chạy `npx expo-doctor` thành công 100% không báo lỗi cấu hình hoặc dependencies không tương thích.
- [x] Màn hình Expo Server khởi động bình thường ở local.

## Design Notes

- Commands: `npm install expo@^54.0.0`, `npx expo install --fix`, `npx expo-doctor`
- UI surfaces: Expo Developer Console / Metro Bundler

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | |
| Integration | |
| E2E | |
| Platform | `npx expo-doctor` report and server start success |
| Release | |

## Harness Delta

Không có thay đổi lớn đối với Harness Core, chủ yếu nâng cấp các packages phụ thuộc của client.

## Evidence

### npx expo-doctor Output
```
18/18 checks passed. No issues detected!
```

### package.json Dependencies
```json
  "dependencies": {
    "@react-native-async-storage/async-storage": "2.2.0",
    "axios": "^1.6.8",
    "expo": "^54.0.34",
    "expo-status-bar": "~3.0.9",
    "react": "19.1.0",
    "react-native": "0.81.5"
  }
```

