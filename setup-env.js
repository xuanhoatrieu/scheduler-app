const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
  console.log('✅ File .env đã tồn tại. Không cần khởi tạo lại.');
  process.exit(0);
}

console.log('⚙️ Đang tự động thiết lập môi trường và sinh các khóa bảo mật đầu cuối...');

// Sinh mật khẩu mạnh ngẫu nhiên cho database user trên Supabase
const dbPassword = crypto.randomBytes(16).toString('hex');

// Sinh khóa mã hóa AES-256 (64 ký tự hex tương đương 256 bits)
const encryptionKey = crypto.randomBytes(32).toString('hex');

// Sinh khóa ký JWT (64 ký tự hex ngẫu nhiên an toàn tuyệt đối)
const jwtSecret = crypto.randomBytes(32).toString('hex');

const envContent = `# ==============================================================================
# CẤU HÌNH MÔI TRƯỜNG PRODUCTION - TUAF SCHEDULER (SỬ DỤNG CHUNG SUPABASE DB)
# ==============================================================================

# 1. Kết nối Database PostgreSQL (Supabase dùng chung qua network tuaf-ai-network)
DB_URI=postgresql://scheduler_user:${dbPassword}@tuaf-supabase-db:5432/scheduler

# 2. Khóa mã hóa bảo mật (Tự động sinh ngẫu nhiên an toàn tuyệt đối)
# ⚠️ KHÔNG CHIA SẺ khóa này. Mất khóa này sẽ không giải mã được mật khẩu portal đã lưu!
ENCRYPTION_KEY=${encryptionKey}
JWT_SECRET=${jwtSecret}

# 3. Môi trường hoạt động
NODE_ENV=production
PORT=5000
DATA_SOURCE=crawler
`;

try {
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('🎉 Đã tạo thành công file .env!');
  console.log('👉 Khóa ENCRYPTION_KEY và JWT_SECRET ngẫu nhiên đã được thiết lập bảo mật 100%.');
  console.log('\n==============================================================================');
  console.log('🔥 BƯỚC BẮT BUỘC: HÃY CHẠY CÁC LỆNH SAU TRÊN VPS ĐỂ TẠO DATABASE TRÊN SUPABASE:');
  console.log('==============================================================================');
  console.log(`docker exec -it tuaf-supabase-db psql -U postgres -c "CREATE DATABASE scheduler;"`);
  console.log(`docker exec -it tuaf-supabase-db psql -U postgres -c "CREATE USER scheduler_user WITH PASSWORD '${dbPassword}';"`);
  console.log(`docker exec -it tuaf-supabase-db psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE scheduler TO scheduler_user;"`);
  console.log(`docker exec -it tuaf-supabase-db psql -U postgres -d scheduler -c "GRANT ALL ON SCHEMA public TO scheduler_user;"`);
  console.log('==============================================================================\n');
} catch (error) {
  console.error('❌ Lỗi tạo file .env:', error.message);
  process.exit(1);
}
