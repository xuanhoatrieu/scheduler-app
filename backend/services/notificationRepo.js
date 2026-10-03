/**
 * Lớp truy cập DB cho trung tâm thông báo (Sequelize, truy vấn tham số hóa qua ORM).
 */
const { Op } = require('sequelize');
const DeviceToken = require('../models/DeviceToken');
const NotificationOutbox = require('../models/NotificationOutbox');
const UserNotifyState = require('../models/UserNotifyState');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');

const plain = (rows) => rows.map((r) => (r && r.get ? r.get({ plain: true }) : r));

const insertOutboxIfAbsent = async (row) => {
  const [, created] = await NotificationOutbox.findOrCreate({ where: { dedupeKey: row.dedupeKey }, defaults: row });
  return created;
};

const fetchDueOutbox = async (now, limit) => plain(await NotificationOutbox.findAll({
  where: { status: 'pending', notBefore: { [Op.lte]: now } },
  order: [['createdAt', 'ASC']],
  limit
}));

const updateOutbox = async (id, patch) => {
  await NotificationOutbox.update(patch, { where: { id } });
};

const activeDevicesByUser = async (userIds) => {
  const map = new Map();
  if (!userIds.length) return map;
  const rows = await DeviceToken.findAll({ where: { userId: { [Op.in]: userIds }, active: true } });
  for (const d of plain(rows)) {
    if (!map.has(d.userId)) map.set(d.userId, []);
    map.get(d.userId).push(d);
  }
  return map;
};

const usersByIds = async (ids) => {
  const map = new Map();
  if (!ids.length) return map;
  const rows = await User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'username', 'role'] });
  for (const u of plain(rows)) map.set(u.id, u);
  return map;
};

const deactivateTokens = async (tokens) => {
  if (!tokens.length) return;
  await DeviceToken.update({ active: false }, { where: { token: { [Op.in]: tokens } } });
};

const fetchSentAwaitingReceipts = async (sentBefore, limit) => plain(await NotificationOutbox.findAll({
  where: { status: 'sent', receiptsCheckedAt: null, sentAt: { [Op.lte]: sentBefore } },
  order: [['sentAt', 'ASC']],
  limit
}));

/** Sinh viên có ít nhất một thiết bị đang hoạt động + lịch/thi + trạng thái lịch */
const loadDigestCandidates = async () => {
  const devices = plain(await DeviceToken.findAll({ where: { active: true, role: 'student' } }));
  if (!devices.length) return [];
  const byUser = new Map();
  for (const d of devices) {
    if (!byUser.has(d.userId)) byUser.set(d.userId, []);
    byUser.get(d.userId).push(d);
  }
  const userIds = [...byUser.keys()];
  const [schedules, exams, states] = await Promise.all([
    Schedule.findAll({ where: { userId: { [Op.in]: userIds } }, attributes: ['userId', 'courseName', 'classCode', 'studyTime', 'dayOfWeek', 'periodText', 'room', 'schoolYear'] }),
    Exam.findAll({ where: { userId: { [Op.in]: userIds } }, attributes: ['userId', 'courseName', 'examDate', 'examTime', 'room'] }),
    UserNotifyState.findAll({ where: { userId: { [Op.in]: userIds } } })
  ]);
  const group = (rows) => {
    const m = new Map();
    for (const r of plain(rows)) {
      if (!m.has(r.userId)) m.set(r.userId, []);
      m.get(r.userId).push(r);
    }
    return m;
  };
  const schedByUser = group(schedules);
  const examByUser = group(exams);
  const stateByUser = new Map(plain(states).map((s) => [s.userId, s]));
  return userIds.map((userId) => ({
    userId,
    devices: byUser.get(userId),
    schedule: schedByUser.get(userId) || [],
    exams: examByUser.get(userId) || [],
    state: stateByUser.get(userId) || null
  }));
};

/** userId của mọi tài khoản có thiết bị đang hoạt động */
const activeDeviceUserIds = async () => {
  const rows = await DeviceToken.findAll({ where: { active: true }, attributes: ['userId'] });
  return [...new Set(plain(rows).map((r) => r.userId))];
};

/**
 * Cập nhật dấu vân tay lịch; trả true nếu lịch ĐỔI so với lần trước.
 * Lần đầu (chưa có mốc) → chỉ lưu mốc, không coi là đổi.
 */
const updateScheduleHash = async (userId, hash, now) => {
  const state = await UserNotifyState.findByPk(userId);
  if (!state) {
    await UserNotifyState.create({ userId, scheduleHash: hash, scheduleChangedAt: null });
    return false;
  }
  if (state.scheduleHash === hash) return false;
  await state.update({ scheduleHash: hash, scheduleChangedAt: now });
  return true;
};

/** Dọn outbox cũ (> 30 ngày) để bảng không phình */
const purgeOldOutbox = async (now) => NotificationOutbox.destroy({
  where: { createdAt: { [Op.lt]: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }, status: { [Op.ne]: 'pending' } }
});

module.exports = {
  insertOutboxIfAbsent,
  fetchDueOutbox,
  updateOutbox,
  activeDevicesByUser,
  usersByIds,
  deactivateTokens,
  fetchSentAwaitingReceipts,
  loadDigestCandidates,
  activeDeviceUserIds,
  updateScheduleHash,
  purgeOldOutbox
};
