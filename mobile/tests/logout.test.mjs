// Chạy: cd mobile && node --import ./tests/register.mjs --test tests/logout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as N from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logout } from '../services/api.js';
import { getActiveOwner, replaceScheduledReminders, setActiveOwner } from '../services/notificationService.js';

test('logout: xóa thông báo + token + MỌI cache cached_* (kể cả tên động); giữ cài đặt đăng nhập', async () => {
  await setActiveOwner('xuanhoatrieu|lecturer');
  await replaceScheduledReminders('xuanhoatrieu|lecturer', [
    { id: 'c1', fireAt: new Date(Date.now() + 3600e3), title: 't', body: 'b', data: {} },
  ]);
  await SecureStore.setItemAsync('jwt_token', 'tok');
  const keys = [
    'user_profile',
    'cached_schedule_1_2026_DHCQ',
    'cached_schedule_1_2026_VLVH',
    'cached_exams_1_2026_ALL',
    'cached_schedule_semesters',
    'cached_school_news',
    'cached_grades_all',
  ];
  for (const k of keys) await AsyncStorage.setItem(k, '[]');
  await AsyncStorage.setItem('saved_username', 'xuanhoatrieu');
  await AsyncStorage.setItem('saved_role', 'lecturer');

  await logout();

  assert.equal(N.__state.scheduled.size, 0);
  assert.equal(getActiveOwner(), null);
  assert.equal(await SecureStore.getItemAsync('jwt_token'), null);
  const left = await AsyncStorage.getAllKeys();
  assert.deepEqual(left.filter((k) => k.startsWith('cached_') || k === 'user_profile'), []);
  // "Ghi nhớ tài khoản" ở màn đăng nhập vẫn giữ như cũ
  assert.equal(await AsyncStorage.getItem('saved_username'), 'xuanhoatrieu');
});
