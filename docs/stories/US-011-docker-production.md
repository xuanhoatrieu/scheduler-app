# US-011 Dockerize & Production Deploy Config

## Status

done

## Lane

normal

## Product Contract

Backend của ứng dụng TUAF Scheduler phải được đóng gói bằng Docker an toàn, tích hợp với hệ thống reverse proxy Caddy của máy chủ TUAF, tự động hóa quy trình xây dựng bằng GitHub Actions (GHCR), và sẵn sàng triển khai trên VPS chỉ bằng lệnh `docker compose pull && docker compose up -d`.

## Relevant Product Docs

- [PRODUCTION_DEPLOY_GUIDE.md](file:///home/trieuhoa/lichhoc-app/docs/PRODUCTION_DEPLOY_GUIDE.md)

## Acceptance Criteria

1. **Docker Container hóa:**
   - [x] Tạo file `backend/Dockerfile` sử dụng multi-stage build với Alpine node image, dung lượng tối ưu (< 150MB).
   - [x] Tích hợp `HEALTHCHECK` kiểm tra định kỳ trong Dockerfile sử dụng `wget`.
2. **Cấu hình Docker Compose:**
   - [x] Định nghĩa dịch vụ `scheduler-api` sử dụng image từ GHCR `ghcr.io/xuanhoatrieu/scheduler-api:latest`.
   - [x] Định nghĩa dịch vụ `scheduler-db` sử dụng PostgreSQL 14, không mở cổng public, chỉ expose cục bộ localhost `127.0.0.1:5432:5432` (hoặc `5433:5432` cục bộ để tránh xung đột).
   - [x] Ràng buộc container API vào mạng có sẵn `tuaf-ai-network` (external).
3. **CI/CD Tự động hóa:**
   - [x] Tạo workflow `.github/workflows/docker-publish.yml` tự động build và push image lên GHCR khi push lên `main` hoặc tag `v*`.
4. **Mã nguồn thích ứng Production:**
   - [x] Thêm cấu hình `app.set('trust proxy', true)` trong Express.
   - [x] Thêm endpoint `/health` trả về trạng thái healthy dạng JSON với HTTP status 200.

## Design Notes

- **API:**
  - `GET /health` -> `{ "status": "healthy", "timestamp": "..." }`
- **Docker Network:** `tuaf-ai-network` (external)
- **Container Names:** `scheduler-api` và `scheduler-db`
- **Cấu hình Môi trường:** Đọc biến `DB_URI`, `PORT`, `JWT_SECRET`, `ENCRYPTION_KEY` từ file `.env`.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Lệnh `node -c server.js` kiểm tra cú pháp thành công. |
| Integration | `docker compose up -d` khởi động thành công các dịch vụ trên local máy phát triển. |
| E2E | Truy vấn `/health` trả về kết quả 200 OK. |
| Release | GitHub Actions biên dịch thành công image và đăng tải lên package registry. |

## Harness Delta

Tạo thêm câu chuyện kiểm thử này để kiểm soát chất lượng quy trình vận hành và triển khai Docker.

## Evidence

### 1. Build thử nghiệm cục bộ thành công:
```bash
$ docker compose build
[+] Building 24.4s (22/22) FINISHED
 => naming to ghcr.io/xuanhoatrieu/scheduler-api:latest
```

### 2. Khởi chạy và kiểm tra Healthcheck trong container:
```bash
$ docker compose up -d
[+] Running 2/2
 ✔ Container scheduler-api  Started
 ✔ Container scheduler-db   Healthy

$ docker exec scheduler-api wget -qO- http://localhost:5000/health
{"status":"healthy","timestamp":"2026-05-28T16:22:32.386Z"}
```

### 3. Log tích hợp database & đồng bộ cấu trúc models thành công qua Sequelize:
```
scheduler-api  | 📡 PostgreSQL Connected successfully via Sequelize ORM!
scheduler-api  | ✅ All database models synchronized successfully.
scheduler-api  | 📅 [Cron Service] Đã thiết lập lịch đồng bộ tự động: "0 3 * * *"
scheduler-api  | 🚀 Server is running on port 5000
```

