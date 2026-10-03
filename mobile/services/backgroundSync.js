/**
 * Tác vụ nền nhận push từ server.
 *
 * Server gửi push ẨN (kind=sync) mỗi ngày sau khi đồng bộ lúc 3h sáng → hệ điều hành đánh thức app
 * (kể cả khi người dùng không mở app) → app tải lịch mới nhất và LẬP LẠI lịch nhắc local.
 * Nhờ vậy lịch đổi tuần này / tuần sau (thứ, tiết, phòng khác) luôn được cập nhật vào lịch nhắc.
 *
 * File này PHẢI được import sớm ở App.js (module scope) để TaskManager.defineTask chạy trước khi
 * hệ điều hành gọi tác vụ.
 */
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { syncRemindersInBackground } from './reminderSync';

export const BACKGROUND_NOTIFICATION_TASK = 'tuaf-background-notification';

const parseMaybe = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try {
      const o = JSON.parse(v);
      return o && typeof o === 'object' ? o : null;
    } catch (e) {
      return null;
    }
  }
  return null;
};

const looksLikeOurData = (o) => !!o && typeof o === 'object' && (typeof o.type === 'string' || typeof o.kind === 'string');

/**
 * Lấy phần `data` do server gửi từ payload tác vụ nền (khác nhau giữa iOS / Android / khi bấm vào thông báo).
 * @returns {object|null}
 */
export const extractPushData = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const fromResponse = payload.notification && payload.notification.request && payload.notification.request.content
    ? payload.notification.request.content.data
    : null;
  const d = payload.data;
  const candidates = [
    payload.actionIdentifier ? fromResponse : null,
    parseMaybe(d && d.dataString),
    parseMaybe(d && d.body),
    parseMaybe(payload.body),
    d && typeof d === 'object' ? d : null,
    fromResponse,
  ];
  for (const c of candidates) if (looksLikeOurData(c)) return c;
  return null;
};

/** Push nào cần app lập lại lịch nhắc */
export const shouldResyncFor = (data) => !!data && (data.type === 'sync' || data.kind === 'sync' || data.kind === 'digest');

export const handleBackgroundPayload = async (payload) => {
  const data = extractPushData(payload);
  if (!shouldResyncFor(data)) return false;
  try {
    return await syncRemindersInBackground(typeof data.owner === 'string' ? data.owner : null);
  } catch (e) {
    console.warn('⚠️ [BackgroundSync] Lỗi:', e.message);
    return false;
  }
};

try {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error) return;
    await handleBackgroundPayload(data);
  });
  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((e) => {
    console.warn('⚠️ [BackgroundSync] Không đăng ký được tác vụ nền:', e.message);
  });
} catch (e) {
  // Expo Go / web không hỗ trợ → app vẫn cập nhật lịch nhắc khi được mở
  console.warn('⚠️ [BackgroundSync] Tác vụ nền không khả dụng:', e.message);
}
