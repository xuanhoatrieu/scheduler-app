#!/bin/bash

# ==============================================================================
# TUAF Schedule App Launcher Script v3.0
# Khởi động Backend + Localtunnel, tự động đồng bộ URL vào mobile app
# Expo do người dùng tự chạy riêng (npx expo start --tunnel)
# ==============================================================================

# Màu sắc
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Đường dẫn
ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$ROOT_DIR/backend"
MOBILE_DIR="$ROOT_DIR/mobile"
BACKEND_LOG="$ROOT_DIR/backend.log"
TUNNEL_LOG="$ROOT_DIR/localtunnel.log"

echo -e "${BLUE}==================================================${NC}"
echo -e "${GREEN}🚀 TUAF SCHEDULE LAUNCHER v3.0${NC}"
echo -e "${BLUE}==================================================${NC}"

# ─── Hàm cleanup khi Ctrl+C ──────────────────────────────────────────────────
cleanup() {
    echo -e "\n${RED}🛑 Đang dừng tất cả tiến trình...${NC}"
    [ ! -z "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null && echo -e "${YELLOW}  ✓ Backend (PID $BACKEND_PID) đã dừng${NC}"
    [ ! -z "$TUNNEL_PID" ] && kill $TUNNEL_PID 2>/dev/null && echo -e "${YELLOW}  ✓ Localtunnel (PID $TUNNEL_PID) đã dừng${NC}"
    echo -e "${GREEN}🎉 Đã giải phóng tài nguyên. Tạm biệt!${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ─── 1. Dọn dẹp port 5000 nếu bị chiếm ──────────────────────────────────────
echo -e "${YELLOW}🔍 1. Kiểm tra port 5000...${NC}"
PORT_PID=$(lsof -t -i:5000 2>/dev/null)
if [ ! -z "$PORT_PID" ]; then
    echo -e "${RED}   ⚠️  Port 5000 đang bị chiếm bởi PID $PORT_PID → kill...${NC}"
    kill -9 $PORT_PID 2>/dev/null
    sleep 1
    echo -e "${GREEN}   ✅ Đã giải phóng port 5000${NC}"
else
    echo -e "${GREEN}   ✅ Port 5000 sẵn sàng${NC}"
fi

# ─── 2. Khởi động Backend ─────────────────────────────────────────────────────
echo -e "${YELLOW}📡 2. Khởi động Backend...${NC}"
cd "$BACKEND_DIR" || { echo -e "${RED}❌ Không tìm thấy thư mục backend!${NC}"; exit 1; }
node server.js > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}   ✅ Backend PID: $BACKEND_PID (Log: backend.log)${NC}"

# Chờ backend sẵn sàng (tối đa 15 giây)
echo -e "${YELLOW}   ⏳ Chờ backend khởi tạo...${NC}"
for i in $(seq 1 15); do
    if lsof -i:5000 -sTCP:LISTEN > /dev/null 2>&1; then
        echo -e "${GREEN}   ✅ Backend đã sẵn sàng trên port 5000! (${i}s)${NC}"
        break
    fi
    # Kiểm tra backend còn sống không
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${RED}   ❌ Backend bị crash! Xem log:${NC}"
        tail -10 "$BACKEND_LOG"
        exit 1
    fi
    sleep 1
done

# Kiểm tra lần cuối
if ! lsof -i:5000 -sTCP:LISTEN > /dev/null 2>&1; then
    echo -e "${RED}   ⚠️  Backend chưa listen port 5000 sau 15s, tiếp tục...${NC}"
    tail -5 "$BACKEND_LOG"
fi

# ─── 3. Khởi động Localtunnel ─────────────────────────────────────────────────
echo -e "${YELLOW}🌐 3. Khởi động Localtunnel...${NC}"
cd "$ROOT_DIR" || exit
> "$TUNNEL_LOG"  # Xóa log cũ
npx localtunnel --port 5000 > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
echo -e "${GREEN}   ✅ Localtunnel PID: $TUNNEL_PID${NC}"

# Chờ URL xuất hiện (tối đa 20 giây)
echo -e "${YELLOW}   ⏳ Chờ Localtunnel tạo URL...${NC}"
TUNNEL_URL=""
for i in $(seq 1 20); do
    TUNNEL_URL=$(grep -oP 'https://[a-z0-9-]+\.loca\.lt' "$TUNNEL_LOG" 2>/dev/null | tail -n 1)
    if [ ! -z "$TUNNEL_URL" ]; then
        break
    fi
    # Kiểm tra tunnel còn sống
    if ! kill -0 $TUNNEL_PID 2>/dev/null; then
        echo -e "${RED}   ❌ Localtunnel bị crash!${NC}"
        cat "$TUNNEL_LOG"
        break
    fi
    sleep 1
done

if [ ! -z "$TUNNEL_URL" ]; then
    echo -e "${GREEN}   🔗 Tunnel URL: ${CYAN}$TUNNEL_URL${NC}"

    # ─── 4. Đồng bộ URL vào mobile/services/api.js ────────────────────────────
    echo -e "${YELLOW}🔄 4. Đồng bộ API URL vào mobile app...${NC}"
    API_FILE="$MOBILE_DIR/services/api.js"

    if [ -f "$API_FILE" ]; then
        # Thay thế dòng chứa API_BASE_URL
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|const API_BASE_URL = '.*'|const API_BASE_URL = '${TUNNEL_URL}/api'|g" "$API_FILE"
        else
            sed -i "s|const API_BASE_URL = '.*'|const API_BASE_URL = '${TUNNEL_URL}/api'|g" "$API_FILE"
        fi
        echo -e "${GREEN}   ✅ API Endpoint: ${CYAN}${TUNNEL_URL}/api${NC}"
    else
        echo -e "${RED}   ❌ Không tìm thấy file $API_FILE${NC}"
    fi
else
    echo -e "${RED}   ❌ Không lấy được Tunnel URL! Kiểm tra localtunnel.log${NC}"
    echo -e "${YELLOW}   💡 Thử chạy thủ công: npx localtunnel --port 5000${NC}"
fi

# ─── 5. Hiển thị trạng thái ───────────────────────────────────────────────────
echo ""
echo -e "${BLUE}==================================================${NC}"
echo -e "${GREEN}✅ HỆ THỐNG ĐÃ SẴN SÀNG!${NC}"
echo -e "${BLUE}==================================================${NC}"
echo -e "  ${CYAN}Backend:${NC}    http://localhost:5000  (PID: $BACKEND_PID)"
if [ ! -z "$TUNNEL_URL" ]; then
echo -e "  ${CYAN}Tunnel:${NC}     $TUNNEL_URL  (PID: $TUNNEL_PID)"
echo -e "  ${CYAN}API:${NC}        ${TUNNEL_URL}/api"
fi
echo ""
echo -e "${YELLOW}🔑 Nhấn Ctrl+C tại đây để dừng hoàn toàn Expo, Backend và Localtunnel cùng lúc.${NC}"
echo -e "${BLUE}==================================================${NC}"
echo ""

# ─── 6. Khởi động Expo Mobile App ─────────────────────────────────────────────
echo -e "${YELLOW}📱 6. Khởi động Expo Mobile App...${NC}"
cd "$MOBILE_DIR" || { echo -e "${RED}❌ Không tìm thấy thư mục mobile!${NC}"; exit 1; }
npx expo start --tunnel
