/**
 * Đăng ký nhận push từ server (Expo Push Token) cho ĐÚNG tài khoản đang đăng nhập.
 *
 * - Token được gắn với tài khoản trên server; đổi tài khoản → đăng ký lại → server chuyển token sang chủ mới.
 * - Đăng xuất → api.logout() gỡ token khỏi server.
 * - Không chạy được (Expo Go, máy ảo, chưa cấp quyền, mất mạng) → trả false, app vẫn dùng nhắc lịch local.
 */
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { PUSH_KEYS, registerPushDevice, reportRemindersSynced, unregisterPushDevice } from './api';
import { getActiveOwner, requestNotificationPermissions } from './notificationService';

// PHẢI khớp app.json → expo.extra.eas.projectId (có test kiểm tra)
export const EAS_PROJECT_ID = '2e4b83e8-5b85-4bda-a1ea-8c991fa5b4b1';

const isStillOwner = (owner) => !!owner && owner === getActiveOwner();

/** Gỡ token còn treo từ lần đăng xuất mất mạng (chỉ gọi khi KHÔNG có ai đăng nhập) */
export const retryPendingUnregister = async () => {
  try {
    const pending = await AsyncStorage.getItem(PUSH_KEYS.unregisterPending);
    if (!pending) return;
    const res = await unregisterPushDevice(pending);
    if (res.success) await AsyncStorage.removeItem(PUSH_KEYS.unregisterPending);
  } catch (e) {
    // thử lại lần sau
  }
};

/**
 * Đăng ký push cho tài khoản `owner`.
 * @returns {Promise<boolean>} true nếu server đã gắn token của máy với tài khoản này
 */
export const registerPushForOwner = async (owner) => {
  if (!isStillOwner(owner)) return false;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) {
      await AsyncStorage.removeItem(PUSH_KEYS.owner);
      return false;
    }
    const res = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    const token = res && res.data;
    if (!token || !isStillOwner(owner)) return false;

    // Token đang chờ gỡ: nếu chính là token này thì việc đăng ký dưới đây đã chuyển chủ → bỏ lệnh gỡ
    // (nếu không, lần gỡ sau sẽ xóa luôn đăng ký của tài khoản mới).
    const pending = await AsyncStorage.getItem(PUSH_KEYS.unregisterPending);
    if (pending === token) await AsyncStorage.removeItem(PUSH_KEYS.unregisterPending);
    else if (pending) await retryPendingUnregister();

    const reg = await registerPushDevice(token, Platform.OS);
    if (!reg.success || !isStillOwner(owner)) return false;
    await AsyncStorage.multiSet([[PUSH_KEYS.token, token], [PUSH_KEYS.owner, owner]]);
    return true;
  } catch (e) {
    console.warn('⚠️ [Push] Không đăng ký được push (app vẫn dùng nhắc lịch local):', e.message);
    return false;
  }
};

/** Server đang gửi push cho đúng tài khoản này tới máy này chưa? */
export const isPushActiveFor = async (owner) => {
  if (!owner) return false;
  try {
    return (await AsyncStorage.getItem(PUSH_KEYS.owner)) === owner;
  } catch (e) {
    return false;
  }
};

/** Báo server đã lập lại lịch nhắc → server không cần gửi bản tin sáng dự phòng */
export const reportSyncedIfPush = async (owner) => {
  if (!(await isPushActiveFor(owner))) return false;
  const token = await AsyncStorage.getItem(PUSH_KEYS.token);
  if (!token || !isStillOwner(owner)) return false;
  const res = await reportRemindersSynced(token);
  return !!res.success;
};
