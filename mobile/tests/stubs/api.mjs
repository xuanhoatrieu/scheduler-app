// API giả cho test ReminderSync. Test điều khiển qua globalThis.__api
const h = () => globalThis.__api || {};
const call = async (name, ...args) => {
  const fn = h()[name];
  if (h().onCall) await h().onCall(name, ...args);
  return fn ? fn(...args) : { success: true, data: [] };
};
export const getScheduleSemesters = (...a) => call('getScheduleSemesters', ...a);
export const getSchedule = (...a) => call('getSchedule', ...a);
export const getExams = (...a) => call('getExams', ...a);
export const getGradesAll = (...a) => call('getGradesAll', ...a);
// Push device API giả
export const PUSH_KEYS = { token: 'push_token_v1', owner: 'push_owner_v1', unregisterPending: 'push_unregister_pending_v1' };
export const registerPushDevice = (...a) => call('registerPushDevice', ...a).then((r) => (r && 'success' in r ? r : { success: true }));
export const unregisterPushDevice = (...a) => call('unregisterPushDevice', ...a).then((r) => (r && 'success' in r ? r : { success: true }));
export const reportRemindersSynced = (...a) => call('reportRemindersSynced', ...a).then((r) => (r && 'success' in r ? r : { success: true }));
