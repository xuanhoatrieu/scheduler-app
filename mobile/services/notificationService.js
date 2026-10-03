import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

let activeOwner = null;

/**
 * Có hiển thị thông báo này khi app đang mở không?
 * - Push ẩn (không title/body, chỉ để app tự cập nhật lịch nhắc) → không hiện.
 * - Thông báo gắn tài khoản khác với tài khoản đang đăng nhập → không hiện.
 */
export const shouldPresentNotification = (notification) => {
  const content = (notification && notification.request && notification.request.content) || {};
  const data = content.data || {};
  if (!content.title && !content.body) return false;
  if (data.owner && data.owner !== activeOwner) return false;
  return true;
};

/**
 * Người dùng bấm vào thông báo Nhà trường → có mở hộp thư "Nhà Trường" không?
 * - Push gắn tài khoản KHÁC tài khoản đang đăng nhập → không.
 * - App vừa mở từ trạng thái tắt (chưa khôi phục tài khoản, owner = null) → có; hộp thư
 *   chỉ tải dữ liệu của chính tài khoản đăng nhập nên không lộ thông báo của người khác.
 */
export const isAnnouncementTapFor = (response, owner) => {
  const data = (response && response.notification && response.notification.request
    && response.notification.request.content && response.notification.request.content.data) || {};
  if (data.kind !== 'announcement') return false;
  return !owner || data.owner === owner;
};

// Cấu hình cách hiển thị thông báo khi ứng dụng đang mở (foreground)
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const show = shouldPresentNotification(notification);
    return {
      shouldShowAlert: show,
      shouldShowBanner: show,
      shouldShowList: show,
      shouldPlaySound: show,
      shouldSetBadge: show,
    };
  },
});

const CHANNEL_ID = 'exam_and_schedule_reminders';
// Lưu "chủ" của các thông báo đang nằm trong hệ điều hành (username|role)
const OWNER_STORAGE_KEY = 'notif_owner_v2';

/**
 * Khởi tạo kênh thông báo (Notification Channel) trên Android
 * Đặt mức ưu tiên MAX để bung banner nổi trên màn hình và phát chuông/rung
 */
export const initNotifications = async () => {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Lịch Thi & Lịch Học',
        description: 'Thông báo nhắc nhở trước giờ thi và giờ học (15 phút)',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        enableLights: true,
        lightColor: '#2563EB',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        showBadge: true,
      });
    }
  } catch (error) {
    console.warn('⚠️ Lỗi khởi tạo Notification Channel:', error.message);
  }
};

/**
 * Yêu cầu quyền thông báo từ người dùng
 */
export const requestNotificationPermissions = async () => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch (error) {
    console.warn('⚠️ Không thể xin quyền thông báo:', error.message);
    return false;
  }
};

// ═══════════════════════════════════════
// CHỦ SỞ HỮU THÔNG BÁO (cô lập giữa các tài khoản)
// ═══════════════════════════════════════

/** Khóa chủ sở hữu của một tài khoản: mỗi cặp (username, vai trò) là một chủ riêng */
export const ownerKeyOf = (user) => (user && user.username ? `${user.username}|${user.role || ''}` : null);

export const getActiveOwner = () => activeOwner;

/** Xóa sạch: hủy lịch hẹn, gỡ thông báo đã hiện trong Notification Center, xóa badge */
const wipeSystemNotifications = async () => {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (e) { console.warn('⚠️ Lỗi hủy thông báo hẹn giờ:', e.message); }
  try { await Notifications.dismissAllNotificationsAsync(); } catch (e) { console.warn('⚠️ Lỗi gỡ thông báo đã hiển thị:', e.message); }
  try { await Notifications.setBadgeCountAsync(0); } catch (e) { /* một số máy không hỗ trợ badge */ }
};

/**
 * Xóa toàn bộ thông báo của tài khoản hiện tại (gọi khi đăng xuất / hết phiên).
 */
export const clearAllNotifications = async () => {
  activeOwner = null;
  await wipeSystemNotifications();
  try { await AsyncStorage.removeItem(OWNER_STORAGE_KEY); } catch (e) { /* ignore */ }
};

/**
 * Khai báo tài khoản đang dùng app (đăng nhập, đổi vai trò, mở lại app).
 * Nếu khác chủ trước đó (kể cả bản cũ chưa lưu chủ) → xóa sạch mọi thông báo cũ.
 */
export const setActiveOwner = async (owner) => {
  let stored = null;
  try { stored = await AsyncStorage.getItem(OWNER_STORAGE_KEY); } catch (e) { /* ignore */ }
  activeOwner = owner || null;
  if (stored !== activeOwner) {
    await wipeSystemNotifications();
    try {
      if (activeOwner) await AsyncStorage.setItem(OWNER_STORAGE_KEY, activeOwner);
      else await AsyncStorage.removeItem(OWNER_STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }
};

/**
 * Dùng cho tác vụ nền (push ẩn đánh thức app khi UI chưa chạy): khôi phục chủ trong bộ nhớ
 * CHỈ KHI trùng chủ đã lưu. Không bao giờ xóa hay đổi chủ — khác chủ → trả false, không làm gì.
 */
export const restoreActiveOwner = async (owner) => {
  if (!owner) return false;
  if (activeOwner) return activeOwner === owner;
  let stored = null;
  try { stored = await AsyncStorage.getItem(OWNER_STORAGE_KEY); } catch (e) { /* ignore */ }
  if (stored !== owner) return false;
  activeOwner = owner;
  return true;
};

/**
 * Thay thế TOÀN BỘ lịch nhắc hẹn giờ bằng kế hoạch mới (không cộng dồn).
 * Dừng ngay nếu trong lúc chạy tài khoản đã đổi.
 * @param {string} owner
 * @param {Array<{ id, fireAt: Date, title, body, data }>} plan - từ reminderPlanner.planReminders
 */
export const replaceScheduledReminders = async (owner, plan) => {
  if (!owner || owner !== activeOwner) return false;
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return false;
  if (owner !== activeOwner) return false;

  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const item of plan || []) {
    if (owner !== activeOwner) {
      // Tài khoản đổi giữa chừng → không để lại lịch của chủ cũ
      await Notifications.cancelAllScheduledNotificationsAsync();
      return false;
    }
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: item.id,
        content: {
          title: item.title,
          body: item.body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority?.MAX || 'max',
          data: { ...(item.data || {}), owner },
        },
        trigger: {
          type: 'date',
          date: item.fireAt,
          channelId: CHANNEL_ID,
        },
      });
    } catch (err) {
      console.warn('⚠️ Lỗi hẹn giờ thông báo:', err.message);
    }
  }
  return true;
};

/**
 * Hiện thông báo NGAY (dùng cho sự kiện vừa xảy ra, ví dụ có điểm mới).
 */
export const presentNow = async (owner, { title, body, data }) => {
  if (!owner || owner !== activeOwner) return false;
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission || owner !== activeOwner) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority?.MAX || 'max',
        data: { ...(data || {}), owner },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
    return true;
  } catch (err) {
    console.warn('⚠️ Lỗi hiển thị thông báo:', err.message);
    return false;
  }
};

/**
 * Hủy toàn bộ thông báo đã lên lịch (giữ lại để tương thích)
 */
export const cancelAllReminders = async () => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('⚠️ Lỗi hủy thông báo:', err.message);
  }
};
