// Chạy: cd mobile && STUB_API=1 node --import ./tests/register.mjs --test tests/push.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as N from 'expo-notifications';
import * as TM from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearAllNotifications,
  getActiveOwner,
  ownerKeyOf,
  setActiveOwner,
  shouldPresentNotification,
} from '../services/notificationService.js';
import { EAS_PROJECT_ID, isPushActiveFor, registerPushForOwner } from '../services/pushRegistration.js';
import { setReminderUser, syncReminders } from '../services/reminderSync.js';
import {
  BACKGROUND_NOTIFICATION_TASK,
  extractPushData,
  handleBackgroundPayload,
} from '../services/backgroundSync.js';

const A = { username: 'xuanhoatrieu', role: 'lecturer' };
const B = { username: 'duongthihongduyen', role: 'lecturer' };
const S = { username: 'DTN245748005', role: 'student' };
const TOKEN = N.__push.token;

const reset = async () => {
  N.__reset();
  N.__push.fail = false;
  await AsyncStorage.clear();
  await clearAllNotifications();
  setReminderUser(null);
  globalThis.__api = undefined;
};

const calls = () => {
  const log = [];
  return { log, onCall: (name, ...args) => { log.push([name, ...args]); } };
};

// Buổi học thật sau `daysAhead` ngày, tiết cho trước
const classOn = (name, daysAhead, periodText) => {
  const d = new Date(Date.now() + daysAhead * 24 * 3600e3);
  const tuafDay = d.getDay() === 0 ? 8 : d.getDay() + 1;
  const pad = (x) => String(x).padStart(2, '0');
  const y = d.getFullYear();
  const startY = d.getMonth() + 1 >= 8 ? y : y - 1;
  const day = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${y}`;
  return { courseName: name, classCode: name, dayOfWeek: tuafDay, periodText, room: 'X', studyTime: `${day} - ${day}`, schoolYear: `${startY}-${startY + 1}` };
};

test('EAS projectId khớp app.json; iOS bật background remote notifications', () => {
  const cfg = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.equal(EAS_PROJECT_ID, cfg.expo.extra.eas.projectId);
  const notif = cfg.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications');
  assert.equal(notif[1].enableBackgroundRemoteNotifications, true);
});

test('Tác vụ nền được khai báo và đăng ký', () => {
  assert.equal(typeof TM.__tasks.get(BACKGROUND_NOTIFICATION_TASK), 'function');
  assert.ok(N.__push.registeredTasks.includes(BACKGROUND_NOTIFICATION_TASK));
});

test('registerPushForOwner: gắn token với đúng tài khoản đang đăng nhập', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(A));
  const c = calls();
  globalThis.__api = c;
  assert.equal(await registerPushForOwner(ownerKeyOf(A)), true);
  assert.deepEqual(c.log.find((x) => x[0] === 'registerPushDevice'), ['registerPushDevice', TOKEN, 'ios']);
  assert.equal(await isPushActiveFor(ownerKeyOf(A)), true);
  assert.equal(await isPushActiveFor(ownerKeyOf(B)), false);
});

test('registerPushForOwner: tài khoản không còn là chủ → không đăng ký', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(B));
  const c = calls();
  globalThis.__api = c;
  assert.equal(await registerPushForOwner(ownerKeyOf(A)), false);
  assert.equal(c.log.filter((x) => x[0] === 'registerPushDevice').length, 0);
});

test('registerPushForOwner: Expo Go / không lấy được token → false, không lỗi', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(A));
  N.__push.fail = true;
  assert.equal(await registerPushForOwner(ownerKeyOf(A)), false);
  assert.equal(await isPushActiveFor(ownerKeyOf(A)), false);
});

test('Token đang chờ gỡ trùng token máy → đăng nhập lại KHÔNG gỡ nhầm đăng ký mới', async () => {
  await reset();
  await AsyncStorage.setItem('push_unregister_pending_v1', TOKEN);
  await setActiveOwner(ownerKeyOf(B));
  const c = calls();
  globalThis.__api = c;
  assert.equal(await registerPushForOwner(ownerKeyOf(B)), true);
  assert.equal(c.log.filter((x) => x[0] === 'unregisterPushDevice').length, 0);
  assert.equal(await AsyncStorage.getItem('push_unregister_pending_v1'), null);
});

test('shouldPresentNotification: ẩn push sync; ẩn thông báo của tài khoản khác', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(B));
  const n = (content) => ({ request: { content } });
  assert.equal(shouldPresentNotification(n({ title: null, body: null, data: { type: 'sync', owner: ownerKeyOf(B) } })), false);
  assert.equal(shouldPresentNotification(n({ title: '📊 Có điểm mới', body: 'x', data: { owner: ownerKeyOf(A) } })), false);
  assert.equal(shouldPresentNotification(n({ title: '📊 Có điểm mới', body: 'x', data: { owner: ownerKeyOf(B) } })), true);
  await clearAllNotifications(); // đăng xuất
  assert.equal(shouldPresentNotification(n({ title: 't', body: 'b', data: { owner: ownerKeyOf(B) } })), false);
});

test('Đã có push từ server → app KHÔNG tự hiện thông báo điểm (tránh báo trùng), vẫn ghi sự kiện', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(S));
  setReminderUser(S);
  const grade = (c, v) => ({ courseCode: c, courseName: c, semester: 'HocKy1', schoolYear: '2026-2027', totalGrade10: v, finalGrade: v, letterGrade: 'B' });
  let grades = [grade('MATH', 7)];
  globalThis.__api = { getGradesAll: async () => ({ success: true, source: 'network', data: grades }) };
  assert.equal(await registerPushForOwner(ownerKeyOf(S)), true);
  await syncReminders({ force: true }); // lập mốc
  grades = [grade('MATH', 7), grade('PHY', 8.5)];
  await syncReminders({ force: true });
  assert.equal(N.__state.presented.length, 0);
  const events = JSON.parse(await AsyncStorage.getItem(`notif_grade_events_v1:${ownerKeyOf(S)}`));
  assert.equal(events.length, 1);
});

test('Lập lại lịch nhắc thành công → báo server (để server khỏi gửi bản tin sáng dự phòng)', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(A));
  setReminderUser(A);
  const c = calls();
  globalThis.__api = c;
  await registerPushForOwner(ownerKeyOf(A));
  await syncReminders({ force: true });
  assert.deepEqual(c.log.find((x) => x[0] === 'reportRemindersSynced'), ['reportRemindersSynced', TOKEN]);
});

test('Lỗi tải dữ liệu → KHÔNG báo server là đã cập nhật', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(S));
  setReminderUser(S);
  const c = calls();
  globalThis.__api = { ...c, getSchedule: async () => ({ success: false }) };
  await registerPushForOwner(ownerKeyOf(S));
  await syncReminders({ force: true });
  assert.equal(c.log.filter((x) => x[0] === 'reportRemindersSynced').length, 0);
});

test('Push ẩn (app chưa mở): dữ liệu mới từ cron → lịch nhắc local được thay bằng lịch mới', async () => {
  await reset();
  // App đã đóng: chỉ còn hồ sơ + chủ đã lưu trên máy, bộ nhớ trống
  await AsyncStorage.setItem('user_profile', JSON.stringify(S));
  await AsyncStorage.setItem('notif_owner_v2', ownerKeyOf(S));
  N.__state.scheduled.set('class_old', { content: { body: 'Môn "Cu" tiết 1-3' }, trigger: { date: new Date(Date.now() + 3600e3) } });

  // Tuần này thứ X tiết 1-3 → cron đêm qua cập nhật: chuyển sang ngày khác tiết 4-5
  globalThis.__api = { getSchedule: async () => ({ success: true, source: 'network', data: [classOn('Tin_hoc', 2, '4-5')] }) };
  const ran = await handleBackgroundPayload({ data: { dataString: JSON.stringify({ type: 'sync', kind: 'sync', owner: ownerKeyOf(S) }) } });
  assert.equal(ran, true);
  const bodies = [...N.__state.scheduled.values()].map((x) => x.content.body).join('\n');
  assert.doesNotMatch(bodies, /Cu/);
  assert.match(bodies, /Tin_hoc.*tiết 4-5/);
  assert.equal(getActiveOwner(), ownerKeyOf(S));
});

test('Push ẩn của tài khoản KHÁC (máy đã đổi tài khoản) → bỏ qua, không đụng lịch nhắc', async () => {
  await reset();
  await AsyncStorage.setItem('user_profile', JSON.stringify(B));
  await AsyncStorage.setItem('notif_owner_v2', ownerKeyOf(B));
  N.__state.scheduled.set('b_1', { content: { body: 'B' }, trigger: { date: new Date(Date.now() + 3600e3) } });
  let fetched = 0;
  globalThis.__api = { getSchedule: async () => { fetched++; return { success: true, data: [classOn('Mon_cua_A', 1, '1-3')] }; } };
  const ran = await handleBackgroundPayload({ data: { type: 'sync', owner: ownerKeyOf(A) } });
  assert.equal(ran, false);
  assert.equal(fetched, 0);
  assert.equal(N.__state.scheduled.size, 1);
});

test('Push ẩn khi đã đăng xuất → bỏ qua', async () => {
  await reset();
  let fetched = 0;
  globalThis.__api = { getSchedule: async () => { fetched++; return { success: true, data: [] }; } };
  assert.equal(await handleBackgroundPayload({ data: { type: 'sync', owner: ownerKeyOf(S) } }), false);
  assert.equal(fetched, 0);
  assert.equal(N.__state.scheduled.size, 0);
});

test('Push điểm (không phải sync) → tác vụ nền không đồng bộ lịch', async () => {
  await reset();
  await AsyncStorage.setItem('user_profile', JSON.stringify(S));
  await AsyncStorage.setItem('notif_owner_v2', ownerKeyOf(S));
  assert.equal(await handleBackgroundPayload({ data: { kind: 'grade', owner: ownerKeyOf(S) } }), false);
});

test('extractPushData: đọc được payload iOS / Android / khi bấm thông báo', () => {
  const d = { type: 'sync', owner: 'x|student' };
  assert.deepEqual(extractPushData({ data: { dataString: JSON.stringify(d) } }), d);
  assert.deepEqual(extractPushData({ aps: {}, body: d }), d);
  assert.deepEqual(extractPushData({ data: { body: JSON.stringify(d) } }), d);
  assert.deepEqual(extractPushData({ data: d }), d);
  assert.deepEqual(extractPushData({ actionIdentifier: 'default', notification: { request: { content: { data: { kind: 'digest' } } } } }), { kind: 'digest' });
  assert.equal(extractPushData(null), null);
  assert.equal(extractPushData({ data: { dataString: '{bad json' } }), null);
});
