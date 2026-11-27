const test = require('node:test');
const assert = require('node:assert/strict');
const namvietConnector = require('../services/namvietConnector');

test('namvietConnector.getPool resets _poolPromise after a connection failure so subsequent calls retry', async () => {
  const origEnv = {
    NAMVIET_API_URL: process.env.NAMVIET_API_URL,
    NAMVIET_SECRET_KEY: process.env.NAMVIET_SECRET_KEY,
    NAMVIET_MA_TRUONG: process.env.NAMVIET_MA_TRUONG,
    NAMVIET_USERNAME: process.env.NAMVIET_USERNAME,
    TUAF_DB_SERVER: process.env.TUAF_DB_SERVER,
    TUAF_DB_USER: process.env.TUAF_DB_USER,
    TUAF_DB_PASSWORD: process.env.TUAF_DB_PASSWORD,
    TUAF_DB_NAME: process.env.TUAF_DB_NAME,
  };

  try {
    await namvietConnector.closePool();

    // 1. Giả lập lỗi mất cấu hình / mất kết nối ở lần gọi đầu tiên
    delete process.env.NAMVIET_API_URL;
    delete process.env.TUAF_DB_SERVER;

    await assert.rejects(
      async () => {
        await namvietConnector.getPool();
      },
      /Thiếu biến môi trường/
    );

    // 2. Sau khi lỗi ở lần 1, nếu _poolPromise được reset về null đúng cách,
    // lần gọi thứ 2 với cấu hình mới sẽ thực thi lại luồng kết nối mới thay vì kẹt lỗi cũ
    process.env.TUAF_DB_SERVER = '127.0.0.1';
    process.env.TUAF_DB_USER = 'sa';
    process.env.TUAF_DB_PASSWORD = 'invalid';
    process.env.TUAF_DB_NAME = 'test_db';

    await assert.rejects(
      async () => {
        await namvietConnector.getPool();
      },
      (err) => {
        // Phải là lỗi kết nối thực sự tới 127.0.0.1 chứ không còn là lỗi "Thiếu biến môi trường" bị kẹt từ lần 1
        assert.ok(
          !String(err.message).includes('Thiếu biến môi trường'),
          `Expected fresh connection attempt, but got stale cached error: ${err.message}`
        );
        return true;
      }
    );
  } finally {
    for (const [k, v] of Object.entries(origEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await namvietConnector.closePool();
  }
});
