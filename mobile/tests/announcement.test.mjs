// Chạy: cd mobile && node --import ./tests/register.mjs --test tests/announcement.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isAnnouncementTapFor } from '../services/notificationService.js';

const tap = (data) => ({ notification: { request: { content: { title: 't', body: 'b', data } } } });

test('bấm push Nhà trường của ĐÚNG tài khoản → mở hộp thư', () => {
  assert.equal(isAnnouncementTapFor(tap({ kind: 'announcement', owner: 'sv1|student', announcementId: 'a' }), 'sv1|student'), true);
});

test('push Nhà trường của tài khoản KHÁC → không mở', () => {
  assert.equal(isAnnouncementTapFor(tap({ kind: 'announcement', owner: 'sv2|student' }), 'sv1|student'), false);
  // cùng username nhưng khác vai trò cũng là tài khoản khác
  assert.equal(isAnnouncementTapFor(tap({ kind: 'announcement', owner: 'gv1|lecturer' }), 'gv1|student'), false);
});

test('app vừa mở từ trạng thái tắt (chưa khôi phục tài khoản) → vẫn mở hộp thư', () => {
  assert.equal(isAnnouncementTapFor(tap({ kind: 'announcement', owner: 'sv1|student' }), null), true);
});

test('loại thông báo khác (điểm, bản tin sáng, nhắc lịch) → không phải thông báo Nhà trường', () => {
  for (const kind of ['grade', 'digest', 'sync', undefined]) {
    assert.equal(isAnnouncementTapFor(tap({ kind, owner: 'sv1|student' }), 'sv1|student'), false);
  }
  assert.equal(isAnnouncementTapFor(null, 'sv1|student'), false);
  assert.equal(isAnnouncementTapFor({}, null), false);
});
