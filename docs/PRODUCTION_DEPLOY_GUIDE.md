# Hướng dẫn Production Deploy — TUAF Server

> Dành cho dev các app khác (`ai-teacher-assistant`, `plantdoctor`, `tuaf-scheduler`...) deploy lên server `10.64.11.109` qua Caddy reverse proxy.

## Tổng quan kiến trúc

```
                Internet
                   │
        IT Firewall (80, 443, 1443 open)
                   │
            116.104.85.226
                   │
            ┌──────▼──────┐
            │  tuaf-caddy │  ← reverse proxy duy nhất (port 80/443)
            │   ACME TLS   │     route theo Host header → app
            └──┬──┬──┬──┬─┘
               │  │  │  │
   chat.tuaf   │  │  │  │  → rag-api:8000 (chatbot)
   teacher.    │  │  │  │  → teacher-api:8080
   plant.      │  │  │  │  → plant-api:8080
   scheduler.  │  │  │  │  → scheduler-web:8080
               ▼  ▼  ▼  ▼
        Docker network: tuaf-ai-network
```

**Nguyên tắc cốt lõi:**
- 1 IP public + 2 port (80, 443) → unlimited subdomain
- Caddy phân biệt app theo **Host header (SNI)**, không phân biệt theo port
- Mỗi app = 1 Docker container, attach vào network chung `tuaf-ai-network`
- Caddy tự cấp cert Let's Encrypt → URL không cần port, không cảnh báo browser

---

## Quy ước bắt buộc

### 1. Network — `tuaf-ai-network`

App phải attach vào network có sẵn của server (KHÔNG tự tạo):

```yaml
networks:
  tuaf-ai-network:
    external: true       # KHÔNG tạo, chỉ dùng
    name: tuaf-ai-network
```

### 2. Container name — đặt theo subdomain

```yaml
services:
  teacher-api:
    container_name: teacher-api   # BẮT BUỘC fix tên
```

Quy ước: `<subdomain>-<role>` hoặc `<subdomain>-api`. Lý do: Caddy gọi qua DNS Docker network — `reverse_proxy teacher-api:8080`.

| Subdomain public | container_name |
|:--|:--|
| `chat.tuaf.edu.vn` | `rag-api` |
| `teacher.tuaf.edu.vn` | `teacher-api` |
| `plant.tuaf.edu.vn` | `plant-api` |
| `scheduler.tuaf.edu.vn` | `scheduler-web` |

### 3. Không expose ports ra host

```yaml
services:
  teacher-api:
    # ❌ KHÔNG có "ports:" — Caddy gọi nội bộ qua network
    # CHỈ expose nếu cần debug riêng (DB admin, internal tool)
```

→ Mọi traffic public bắt buộc qua Caddy. Ngoại lệ: app cần debug, expose chỉ localhost:
```yaml
ports:
  - "127.0.0.1:5432:5432"   # OK, chỉ localhost
```

### 4. App phải listen `0.0.0.0` không phải `127.0.0.1`

```dockerfile
# ❌ Sai — container ngoài không gọi vào được
CMD ["uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8080"]

# ✅ Đúng
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
EXPOSE 8080
```

### 5. App phải có endpoint `/health` trả 200

Cần cho Caddy upstream check + Docker healthcheck:

```python
# FastAPI example
@app.get("/health")
def health():
    return {"status": "healthy", "version": "1.0.0"}
```

```javascript
// Express example
app.get("/health", (req, res) => res.json({ status: "healthy" }));
```

### 6. Tin Caddy qua X-Forwarded-* headers

App đứng sau Caddy → request đến từ Caddy IP, không phải client thật. Phải đọc header:

| Header | Giá trị Caddy gửi |
|:--|:--|
| `X-Forwarded-Proto` | `https` |
| `X-Forwarded-Port` | `443` |
| `X-Real-IP` | IP client thật |
| `Host` | `<app>.tuaf.edu.vn` |

```python
# FastAPI
from fastapi.middleware.proxy_headers import ProxyHeadersMiddleware
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
```

```javascript
// Express
app.set("trust proxy", true);
```

```python
# Django settings.py
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
```

### 7. CORS allow `*.tuaf.edu.vn`

Nếu app có frontend cross-origin hoặc cần gọi từ widget:

```python
# FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://chat.tuaf.edu.vn",
        "https://tuaf.edu.vn",
        "https://sinhvien.tuaf.edu.vn",
        "https://lms.tuaf.edu.vn",
        "https://giangvien.tuaf.edu.vn",
    ],
    allow_origin_regex=r"https://([a-z0-9-]+\.)?tuaf\.edu\.vn(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Dockerfile chuẩn

### Python (FastAPI / Flask / Django)

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# System deps (nếu cần psycopg2/pillow/etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
 && rm -rf /var/lib/apt/lists/*

# Pin dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code
COPY . .

EXPOSE 8080

# Health check (Docker tự gọi mỗi 30s)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### Node.js (Express / Next.js / Nest.js)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json .

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "dist/server.js"]
```

### Static SPA (React / Vue) — nginx

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost/ || exit 1
```

`nginx.conf` cho SPA:
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health
    location /health {
        access_log off;
        return 200 "healthy\n";
    }
}
```

---

(tiếp theo ở phần 2)

## docker-compose.yml chuẩn

Mỗi app deploy ở `/home/moodle/apps/<app-name>/docker-compose.yml`:

```yaml
services:
  teacher-api:
    image: ghcr.io/<gh-username>/ai-teacher-assistant:latest
    container_name: teacher-api
    restart: unless-stopped
    environment:
      DATABASE_URL: ${DATABASE_URL}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      LOG_LEVEL: info
    volumes:
      - teacher-data:/app/data
    networks:
      - tuaf-ai-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s

volumes:
  teacher-data:

networks:
  tuaf-ai-network:
    external: true
    name: tuaf-ai-network
```

**Bonus rules:**
- Env nhạy cảm (API keys, DB password) đặt trong file `.env` cùng thư mục, **gitignore** file đó
- Dùng named volume thay bind mount để portable giữa server
- `restart: unless-stopped` để app tự lên lại sau reboot server
- `start_period: 30s` để app có thời gian khởi động trước khi healthcheck

## CI/CD — GitHub Actions push image lên ghcr.io

`.github/workflows/build.yml` trong mỗi app:

```yaml
name: Build & Push to GHCR

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository_owner }}/ai-teacher-assistant
          tags: |
            type=ref,event=branch
            type=sha,format=short
            type=raw,value=latest,enable={{is_default_branch}}
            type=semver,pattern={{version}}

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

→ Mỗi push lên `main` tự build + push image với tag `latest` + `<sha>`. Tag git release `v1.2.3` → tự push tag `1.2.3`.

## Deploy lên server (lần đầu)

```bash
# 1. SSH lên server
ssh moodle@10.64.11.109

# 2. Login GHCR (1 lần duy nhất)
echo $GHCR_PAT | docker login ghcr.io -u <username> --password-stdin

# 3. Tạo thư mục app
mkdir -p ~/apps/<app-name>
cd ~/apps/<app-name>

# 4. Tạo docker-compose.yml + .env (theo template ở trên)
nano docker-compose.yml
nano .env

# 5. Pull + start
docker compose pull
docker compose up -d

# 6. Verify
docker compose ps
docker compose logs -f --tail 50
curl http://<container_name>:8080/health   # từ container khác trong network
```

## Deploy update (lần sau)

```bash
cd ~/apps/<app-name>
docker compose pull          # lấy image latest mới
docker compose up -d         # recreate container với image mới
docker compose logs --tail 50 -f
```

Hoặc tự động hoá bằng webhook:
- GitHub Actions sau khi push image → ping webhook server
- Server chạy `docker compose pull && docker compose up -d`

## Bật subdomain qua Caddy

Sau khi container chạy OK, báo admin server (hiện tại là dev box owner) thêm Caddy block:

**File:** `/home/moodle/ai-for-tuaf-university/docker/caddy/Caddyfile`

```caddy
# === <app>.tuaf.edu.vn ===
teacher.tuaf.edu.vn {
    encode zstd gzip

    import block_bot_scan

    reverse_proxy teacher-api:8080 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto https
        header_up X-Forwarded-Port 443
    }

    log {
        output file /var/log/caddy/teacher.log {
            roll_size 50mb
            roll_keep 5
        }
        format json
    }
}
```

Reload Caddy:
```bash
docker exec tuaf-caddy caddy validate --config /etc/caddy/Caddyfile
docker compose -f /home/moodle/ai-for-tuaf-university/docker/docker-compose.yml restart caddy
```

DNS bắt buộc trỏ subdomain về `116.104.85.226`:
```
teacher.tuaf.edu.vn   A   116.104.85.226
```

→ Caddy tự xin cert Let's Encrypt cho subdomain mới (~30 giây). URL `https://teacher.tuaf.edu.vn/` sẵn sàng.

