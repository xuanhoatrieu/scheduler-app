/**
 * NamViet Connector — Kết nối SQL Server TUAF qua NamViet API
 * 
 * Luồng: GETTOKEN → GETCONNECT → mssql pool (singleton)
 * Fallback: Nếu NamViet API lỗi → dùng static .env credentials
 * 
 * ⚠️ CHỈ ĐỌC (READ-ONLY) — Module này không bao giờ ghi vào SQL Server TUAF
 */

const sql = require('mssql');
const axios = require('axios');

// ─── Singleton state ───
let _pool = null;
let _poolPromise = null;

/**
 * Lấy dynamic DB credentials từ NamViet API
 * @returns {Object} { server, user, password, database }
 */
async function fetchDynamicCredentials() {
  const apiUrl = process.env.NAMVIET_API_URL;
  const secretKey = process.env.NAMVIET_SECRET_KEY;
  const maTruong = process.env.NAMVIET_MA_TRUONG;
  const username = process.env.NAMVIET_USERNAME;

  if (!apiUrl || !secretKey || !maTruong || !username) {
    throw new Error('Thiếu biến môi trường NAMVIET_* — không thể gọi API NamViet');
  }

  // Bước 1: GETTOKEN
  const tokenRes = await axios.post(
    `${apiUrl}/API/NAMVIETCONNECT/GETTOKEN`,
    { Ma_truong: maTruong, UserName: username },
    {
      headers: { 'Content-Type': 'application/json', secretkey: secretKey },
      timeout: 10000
    }
  );

  if (tokenRes.data.StatusCode !== '0000') {
    throw new Error(`NamViet GETTOKEN failed: ${tokenRes.data.StatusMessage || tokenRes.data.StatusDes || 'Unknown'}`);
  }

  const token = tokenRes.data.Token;

  // Bước 2: GETCONNECT
  const connectRes = await axios.post(
    `${apiUrl}/API/NAMVIETCONNECT/GETCONNECT`,
    { Ma_truong: maTruong, UserName: username, Token: token },
    {
      headers: { 'Content-Type': 'application/json', secretkey: secretKey },
      timeout: 10000
    }
  );

  if (connectRes.data.StatusCode !== '0000') {
    throw new Error(`NamViet GETCONNECT failed: ${connectRes.data.StatusMessage || connectRes.data.StatusDes || 'Unknown'}`);
  }

  return {
    server: connectRes.data.IP,
    user: connectRes.data.Username,
    password: connectRes.data.Password,
    database: connectRes.data.Data
  };
}

/**
 * Lấy static credentials từ .env (fallback)
 * @returns {Object} { server, user, password, database }
 */
function getStaticCredentials() {
  const server = process.env.TUAF_DB_SERVER;
  const user = process.env.TUAF_DB_USER;
  const password = process.env.TUAF_DB_PASSWORD;
  const database = process.env.TUAF_DB_NAME;

  if (!server || !user || !password || !database) {
    throw new Error('Thiếu biến môi trường TUAF_DB_* — không thể kết nối SQL Server fallback');
  }

  return { server, user, password, database };
}

/**
 * Tạo mssql connection pool config
 * @param {Object} creds - { server, user, password, database }
 * @returns {Object} mssql config
 */
function buildPoolConfig(creds) {
  return {
    server: creds.server,
    user: creds.user,
    password: creds.password,
    database: creds.database,
    port: 1433,
    pool: {
      max: 5,       // Giới hạn 5 kết nối đồng thời — bảo vệ SQL Server trường
      min: 1,
      idleTimeoutMillis: 60000
    },
    options: {
      encrypt: false,
      trustServerCertificate: true,
      requestTimeout: 30000,    // 30s timeout cho mỗi query
      connectTimeout: 15000,    // 15s timeout kết nối
      readOnlyIntent: true      // Gợi ý cho SQL Server đây là kết nối readonly
    }
  };
}

/**
 * Lấy hoặc tạo mssql connection pool (singleton)
 * Ưu tiên: NamViet API → fallback .env static credentials
 * 
 * @returns {Promise<sql.ConnectionPool>} Connected pool
 */
async function getPool() {
  // Return existing pool nếu vẫn connected
  if (_pool && _pool.connected) {
    return _pool;
  }

  // Tránh race condition: chỉ tạo pool 1 lần
  if (_poolPromise) {
    return _poolPromise;
  }

  _poolPromise = (async () => {
    let creds;

    // Ưu tiên: NamViet API dynamic credentials
    try {
      console.log('🔑 [NamViet] Đang lấy credentials từ API NamViet...');
      creds = await fetchDynamicCredentials();
      console.log(`🔑 [NamViet] Credentials OK → ${creds.server}/${creds.database}`);
    } catch (apiErr) {
      console.warn(`⚠️ [NamViet] API lỗi: ${apiErr.message}. Dùng static .env credentials...`);
      creds = getStaticCredentials();
      console.log(`🔑 [NamViet] Fallback static → ${creds.server}/${creds.database}`);
    }

    // Kết nối SQL Server
    const config = buildPoolConfig(creds);
    console.log(`📡 [NamViet] Đang kết nối SQL Server ${creds.server}/${creds.database}...`);

    const pool = await new sql.ConnectionPool(config).connect();
    console.log(`✅ [NamViet] SQL Server connected! (pool max=${config.pool.max}, readOnly=true)`);

    _pool = pool;
    _poolPromise = null;

    // Xử lý pool error
    pool.on('error', (err) => {
      console.error('❌ [NamViet] Pool error:', err.message);
      _pool = null;
      _poolPromise = null;
    });

    return pool;
  })();

  return _poolPromise;
}

/**
 * Đóng pool — gọi khi shutdown hoặc sau cron job
 */
async function closePool() {
  if (_pool) {
    try {
      await _pool.close();
      console.log('🔌 [NamViet] Pool closed.');
    } catch (err) {
      console.warn('⚠️ [NamViet] Error closing pool:', err.message);
    }
    _pool = null;
    _poolPromise = null;
  }
}

/**
 * Health check — kiểm tra SQL Server có sẵn sàng không
 * @returns {Promise<boolean>}
 */
async function healthCheck() {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT 1 AS ok');
    return result.recordset[0].ok === 1;
  } catch {
    return false;
  }
}

// Graceful shutdown
process.on('SIGTERM', closePool);
process.on('SIGINT', closePool);

module.exports = {
  getPool,
  closePool,
  healthCheck,
  sql  // Re-export mssql types cho parameterized queries
};
