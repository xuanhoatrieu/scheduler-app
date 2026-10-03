// Chạy: cd mobile && STUB_API=1 node --import ./tests/register.mjs --test tests/accountIsolation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as N from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearAllNotifications,
  getActiveOwner,
  ownerKeyOf,
  presentNow,
  replaceScheduledReminders,
  setActiveOwner,
} from '../services/notificationService.js';
import { setReminderUser, syncReminders } from '../services/reminderSync.js';

const A = { username: 'xuanhoatrieu', role: 'lecturer' };
const B = { username: 'duongthihongduyen', role: 'lecturer' };
const S = { username: 'DTN245748005', role: 'student' };

const futurePlan = (prefix, n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}_${i}`,
    fireAt: new Date(Date.now() + (i + 1) * 3600e3),
    title: 't',
    body: `${prefix} body`,
    data: {},
  }));

const reset = async () => {
  N.__reset();
  await AsyncStorage.clear();
  await clearAllNotifications();
  setReminderUser(null);
  globalThis.__api = undefined;
};

// Lịch giả: luôn có buổi học trong vài ngày tới để kế hoạch không rỗng
const soonClass = (name) => {
  const d = new Date(Date.now() + 2 * 24 * 3600e3);
  const tuafDay = d.getDay() === 0 ? 8 : d.getDay() + 1;
  const pad = (x) => String(x).padStart(2, '0');
  const y = d.getFullYear();
  const startY = d.getMonth() + 1 >= 8 ? y : y - 1;
  return {
    courseName: name, classCode: name, dayOfWeek: tuafDay, periodText: '1-3', room: 'X',
    studyTime: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${y} - ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${y}`,
    schoolYear: `${startY}-${startY + 1}`,
  };
};

test('ownerKeyOf: cùng username nhưng khác vai trò là 2 chủ khác nhau', () => {
  assert.notEqual(ownerKeyOf({ username: 'x', role: 'lecturer' }), ownerKeyOf({ username: 'x', role: 'inspector' }));
  assert.equal(ownerKeyOf(null), null);
});

test('Đổi tài khoản → toàn bộ thông báo của tài khoản cũ bị xóa (hẹn giờ + đã hiện + badge)', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(A));
  await replaceScheduledReminders(ownerKeyOf(A), futurePlan('A'));
  await presentNow(ownerKeyOf(A), { title: 'x', body: 'y' });
  assert.equal(N.__state.scheduled.size, 2);
  assert.equal(N.__state.presented.length, 1);

  await setActiveOwner(ownerKeyOf(B));
  assert.equal(N.__state.scheduled.size, 0);
  assert.equal(N.__state.presented.length, 0);
  assert.equal(N.__state.badge, 0);
});

test('Cùng tài khoản mở lại app → KHÔNG xóa lịch nhắc đang có', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(A));
  await replaceScheduledReminders(ownerKeyOf(A), futurePlan('A'));
  await setActiveOwner(ownerKeyOf(A));
  assert.equal(N.__state.scheduled.size, 2);
});

test('Bản app cũ để lại thông báo (chưa lưu chủ) → bị xóa khi đăng nhập bản mới', async () => {
  await reset();
  N.__state.scheduled.set('class_15m_old_uuid', { content: {}, trigger: { date: new Date() } });
  await setActiveOwner(ownerKeyOf(B));
  assert.equal(N.__state.scheduled.size, 0);
});

test('Tài khoản không còn là chủ → không được hẹn giờ / hiện thông báo', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(B));
  assert.equal(await replaceScheduledReminders(ownerKeyOf(A), futurePlan('A')), false);
  assert.equal(await presentNow(ownerKeyOf(A), { title: 'x', body: 'y' }), false);
  assert.equal(N.__state.scheduled.size, 0);
  assert.equal(N.__state.presented.length, 0);
});

test('Hẹn giờ lại = thay thế toàn bộ, không cộng dồn (gọi 5 lần vẫn đúng số lượng)', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(A));
  for (let i = 0; i < 5; i++) await replaceScheduledReminders(ownerKeyOf(A), futurePlan('A', 3));
  assert.equal(N.__state.scheduled.size, 3);
  await replaceScheduledReminders(ownerKeyOf(A), futurePlan('A', 1));
  assert.equal(N.__state.scheduled.size, 1);
});

test('Đăng xuất → không còn chủ, mọi thông báo bị xóa', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(A));
  await replaceScheduledReminders(ownerKeyOf(A), futurePlan('A'));
  await clearAllNotifications();
  assert.equal(getActiveOwner(), null);
  assert.equal(N.__state.scheduled.size, 0);
});

test('ReminderSync: lịch của A đang tải dở thì đổi sang B → không được hẹn giờ lịch của A', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(A));
  setReminderUser(A);
  let switched = false;
  globalThis.__api = {
    getSchedule: async () => {
      if (!switched) {
        switched = true;
        // Người dùng đăng xuất A, đăng nhập B trong lúc request của A đang chạy
        await clearAllNotifications();
        await setActiveOwner(ownerKeyOf(B));
      }
      return { success: true, data: [soonClass('Mon_cua_A')] };
    },
  };
  await syncReminders({ force: true });
  const bodies = [...N.__state.scheduled.values()].map((x) => x.content.body).join('\n');
  assert.doesNotMatch(bodies, /Mon_cua_A/);
  assert.equal(N.__state.scheduled.size, 0);
});

test('ReminderSync: giảng viên lấy lịch của MỌI hệ đào tạo', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(A));
  setReminderUser(A);
  const systems = [];
  globalThis.__api = {
    getSchedule: async (_f, _s, _y, sys) => {
      systems.push(sys);
      return { success: true, data: sys === 'VLVH' ? [soonClass('Mon_VLVH')] : [] };
    },
  };
  await syncReminders({ force: true });
  assert.deepEqual(systems, ['DHCQ', 'VLVH', 'DTTX', 'SDH', 'CTTT']);
  const bodies = [...N.__state.scheduled.values()].map((x) => x.content.body).join('\n');
  assert.match(bodies, /Mon_VLVH/);
});

test('ReminderSync: lỗi mạng + không có cache → giữ lịch nhắc cũ, không xóa', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(S));
  setReminderUser(S);
  await replaceScheduledReminders(ownerKeyOf(S), futurePlan('S', 2));
  globalThis.__api = { getSchedule: async () => ({ success: false }) };
  await syncReminders({ force: true });
  assert.equal(N.__state.scheduled.size, 2);
});

test('ReminderSync: điểm mới → hiện 1 thông báo; lần sau không đổi → không báo lại', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(S));
  setReminderUser(S);
  const grade = (c, v) => ({ courseCode: c, courseName: c, semester: 'HocKy1', schoolYear: '2026-2027', totalGrade10: v, finalGrade: v, letterGrade: 'B' });
  let grades = [grade('MATH', 7)];
  globalThis.__api = { getGradesAll: async () => ({ success: true, source: 'network', data: grades }) };

  await syncReminders({ force: true }); // lập mốc
  assert.equal(N.__state.presented.length, 0);

  grades = [grade('MATH', 7), grade('PHY', 8.5)];
  await syncReminders({ force: true });
  assert.equal(N.__state.presented.length, 1);
  assert.match(N.__state.presented[0].content.body, /PHY/);

  await syncReminders({ force: true });
  assert.equal(N.__state.presented.length, 1);
});

test('ReminderSync: điểm đọc từ cache (mất mạng) → không so, không báo', async () => {
  await reset();
  await setActiveOwner(ownerKeyOf(S));
  setReminderUser(S);
  globalThis.__api = { getGradesAll: async () => ({ success: true, source: 'network', data: [{ courseCode: 'A', semester: 'HocKy1', schoolYear: '2026-2027', totalGrade10: 5 }] }) };
  await syncReminders({ force: true });
  globalThis.__api = { getGradesAll: async () => ({ success: true, source: 'cache', data: [{ courseCode: 'A', semester: 'HocKy1', schoolYear: '2026-2027', totalGrade10: 9 }] }) };
  await syncReminders({ force: true });
  assert.equal(N.__state.presented.length, 0);
});
