/**
 * Gửi push qua Expo Push Service (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Gọi thẳng HTTP API bằng axios (đã có sẵn) — không thêm thư viện mới.
 *
 * Bảo mật:
 * - EXPO_ACCESS_TOKEN (tùy chọn) chỉ đọc từ biến môi trường, không bao giờ ghi log.
 * - Không ghi log token thiết bị đầy đủ.
 */
const axios = require('axios');
const { chunk } = require('./notificationRules');

const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const SEND_CHUNK = 100; // Expo: tối đa 100 tin / request
const RECEIPT_CHUNK = 300; // Expo khuyến nghị <= 300 id / request

const headers = () => {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' };
  if (process.env.EXPO_ACCESS_TOKEN) h.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  return h;
};

/** Che token khi ghi log: ExponentPushToken[abcd…wxyz] */
const maskToken = (t) => {
  const s = String(t || '');
  return s.length > 24 ? `${s.slice(0, 22)}…${s.slice(-5)}` : '***';
};

/**
 * Gửi danh sách tin nhắn. Trả về tickets cùng thứ tự với messages.
 * Lỗi mạng / HTTP của cả lô → ném lỗi để outbox thử lại sau.
 */
const sendMessages = async (messages, { http = axios } = {}) => {
  const tickets = [];
  for (const part of chunk(messages, SEND_CHUNK)) {
    const res = await http.post(SEND_URL, part, { headers: headers(), timeout: 15000 });
    const data = res && res.data && Array.isArray(res.data.data) ? res.data.data : null;
    if (!data || data.length !== part.length) {
      const err = new Error('Expo push: phản hồi không hợp lệ');
      err.code = 'BAD_RESPONSE';
      throw err;
    }
    tickets.push(...data);
  }
  return tickets;
};

/** Đọc receipts: { [ticketId]: { status, details? } } */
const getReceipts = async (ids, { http = axios } = {}) => {
  const out = {};
  for (const part of chunk(ids, RECEIPT_CHUNK)) {
    const res = await http.post(RECEIPTS_URL, { ids: part }, { headers: headers(), timeout: 15000 });
    Object.assign(out, (res && res.data && res.data.data) || {});
  }
  return out;
};

module.exports = { sendMessages, getReceipts, maskToken, SEND_URL, RECEIPTS_URL };
