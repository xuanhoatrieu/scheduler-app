// Bản giả expo-notifications: ghi lại trạng thái để test kiểm tra
export const __state = { scheduled: new Map(), presented: [], badge: null, autoId: 0 };
export const __reset = () => { __state.scheduled.clear(); __state.presented = []; __state.badge = null; };
export const AndroidImportance = { MAX: 5 };
export const AndroidNotificationVisibility = { PUBLIC: 1 };
export const AndroidNotificationPriority = { MAX: 'max' };
export const setNotificationHandler = () => {};
export const setNotificationChannelAsync = async () => {};
export const getPermissionsAsync = async () => ({ status: 'granted' });
export const requestPermissionsAsync = async () => ({ status: 'granted' });
export const scheduleNotificationAsync = async ({ identifier, content, trigger }) => {
  const id = identifier || `auto_${++__state.autoId}`;
  // trigger null (iOS) hoặc chỉ có channelId (Android) = hiện ngay
  if (!trigger || !trigger.date) __state.presented.push({ id, content });
  else __state.scheduled.set(id, { content, trigger });
  return id;
};
export const cancelAllScheduledNotificationsAsync = async () => { __state.scheduled.clear(); };
export const dismissAllNotificationsAsync = async () => { __state.presented = []; };
export const setBadgeCountAsync = async (n) => { __state.badge = n; };
// Push / tác vụ nền
export const __push = { token: 'ExponentPushToken[testtesttesttest]', fail: false, registeredTasks: [] };
export const getExpoPushTokenAsync = async () => {
  if (__push.fail) throw new Error('No push in Expo Go');
  return { type: 'expo', data: __push.token };
};
export const registerTaskAsync = async (name) => { __push.registeredTasks.push(name); return null; };
export const addNotificationResponseReceivedListener = () => ({ remove() {} });
