# --- Giai đoạn 1: Build & Cài đặt Dependencies ---
FROM node:20-alpine AS builder

WORKDIR /app

# Chỉ copy file mô tả dependencies trước để tận dụng cache của Docker layer
COPY package*.json ./

# Cài đặt sạch sẽ chỉ các production dependencies
RUN npm ci --only=production

# Copy toàn bộ mã nguồn
COPY . .

# --- Giai đoạn 2: Runner Stage tinh gọn ---
FROM node:20-alpine AS runner

WORKDIR /app

# Khai báo môi trường production mặc định
ENV NODE_ENV=production
ENV PORT=5000

# Copy các thư mục cần thiết từ giai đoạn build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/config ./config
COPY --from=builder /app/jobs ./jobs
COPY --from=builder /app/middleware ./middleware
COPY --from=builder /app/models ./models
COPY --from=builder /app/routes ./routes
COPY --from=builder /app/services ./services
COPY --from=builder /app/strategies ./strategies
COPY --from=builder /app/utils ./utils

# Mở cổng API
EXPOSE 5000

# Thiết lập Docker healthcheck định kỳ truy vấn endpoint /health
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

# Khởi chạy dịch vụ API
CMD ["node", "server.js"]
