/**
 * Truy cập DB cho thông báo Admin (Sequelize ORM, mọi giá trị đi qua tham số).
 */
const { Op, fn, col, where } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('../models/User');
const DeviceToken = require('../models/DeviceToken');
const NotificationOutbox = require('../models/NotificationOutbox');
const Announcement = require('../models/Announcement');
const AnnouncementRecipient = require('../models/AnnouncementRecipient');
const { chunk } = require('./notificationRules');

const IN_CHUNK = 1000;
const USER_ATTRS = ['id', 'username', 'role'];

const findUsersByRoles = async (roles) => User.findAll({
  where: { role: { [Op.in]: roles } },
  attributes: USER_ATTRS,
  raw: true
});

/** So khớp tài khoản KHÔNG phân biệt hoa thường (MSSV có thể lưu dtn… hoặc DTN…) */
const findUsersByUsernames = async (usernames, roles) => {
  const lowered = [...new Set((usernames || []).map((u) => String(u).trim().toLowerCase()).filter(Boolean))];
  const out = [];
  for (const part of chunk(lowered, IN_CHUNK)) {
    const rows = await User.findAll({
      where: {
        [Op.and]: [
          where(fn('lower', col('username')), { [Op.in]: part }),
          { role: { [Op.in]: roles } }
        ]
      },
      attributes: USER_ATTRS,
      raw: true
    });
    out.push(...rows);
  }
  return out;
};

const userIdsWithActiveDevice = async (userIds) => {
  const set = new Set();
  for (const part of chunk(userIds || [], IN_CHUNK * 5)) {
    const rows = await DeviceToken.findAll({ where: { userId: { [Op.in]: part }, active: true }, attributes: ['userId'], raw: true });
    for (const r of rows) set.add(r.userId);
  }
  return set;
};

/** Lưu thông báo + hộp thư + outbox trong một transaction (lỗi giữa chừng → không ai nhận nửa vời) */
const persistAnnouncement = async ({ announcement, userIds, outboxRows }) => sequelize.transaction(async (transaction) => {
  await Announcement.create(announcement, { transaction });
  for (const part of chunk(userIds, IN_CHUNK)) {
    await AnnouncementRecipient.bulkCreate(
      part.map((userId) => ({ announcementId: announcement.id, userId })),
      { transaction, ignoreDuplicates: true }
    );
  }
  for (const part of chunk(outboxRows, IN_CHUNK)) {
    await NotificationOutbox.bulkCreate(part, { transaction, ignoreDuplicates: true });
  }
});

/** Lịch sử cho Admin, kèm số đã đọc + trạng thái push */
const listAnnouncements = async (limit = 30) => {
  const rows = await Announcement.findAll({ order: [['createdAt', 'DESC']], limit, raw: true });
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const reads = await AnnouncementRecipient.findAll({
    attributes: ['announcementId', [fn('COUNT', col('readAt')), 'readCount']],
    where: { announcementId: { [Op.in]: ids } },
    group: ['announcementId'],
    raw: true
  });
  const readMap = new Map(reads.map((r) => [r.announcementId, Number(r.readCount) || 0]));
  const out = [];
  for (const r of rows) {
    const statusRows = await NotificationOutbox.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'n']],
      where: { kind: 'announcement', dedupeKey: { [Op.like]: `ann:${r.id}:%` } },
      group: ['status'],
      raw: true
    });
    const push = { pending: 0, sent: 0, skipped: 0, dead: 0 };
    for (const s of statusRows) push[s.status] = Number(s.n) || 0;
    out.push({
      id: r.id,
      title: r.title,
      body: r.body,
      senderLabel: r.senderLabel,
      audienceType: r.audienceType,
      audienceLabel: r.audienceLabel,
      recipientCount: r.recipientCount,
      deviceUserCount: r.deviceUserCount,
      urgent: r.urgent,
      createdAt: r.createdAt,
      readCount: readMap.get(r.id) || 0,
      push
    });
  }
  return out;
};

/** Hộp thư của CHÍNH người dùng */
const listInbox = async (userId, limit = 50) => {
  const rows = await AnnouncementRecipient.findAll({
    where: { userId },
    include: [{ model: Announcement, as: 'announcement', attributes: ['id', 'title', 'body', 'senderLabel', 'createdAt'], required: true }],
    order: [['createdAt', 'DESC']],
    limit
  });
  return rows.map((r) => ({
    id: r.announcement.id,
    title: r.announcement.title,
    body: r.announcement.body,
    senderLabel: r.announcement.senderLabel,
    createdAt: r.announcement.createdAt,
    read: !!r.readAt
  }));
};

const countUnread = async (userId) => AnnouncementRecipient.count({ where: { userId, readAt: null } });

/** Đánh dấu đã đọc — chỉ khi người dùng là người nhận; trả false nếu không phải */
const markRead = async (userId, announcementId, now = new Date()) => {
  const row = await AnnouncementRecipient.findOne({ where: { userId, announcementId } });
  if (!row) return false;
  if (!row.readAt) await row.update({ readAt: now });
  return true;
};

const markAllRead = async (userId, now = new Date()) => {
  const [n] = await AnnouncementRecipient.update({ readAt: now }, { where: { userId, readAt: null } });
  return n;
};

module.exports = {
  findUsersByRoles,
  findUsersByUsernames,
  userIdsWithActiveDevice,
  persistAnnouncement,
  listAnnouncements,
  listInbox,
  countUnread,
  markRead,
  markAllRead
};
