/**
 * Thông báo do Admin gửi — xác định người nhận, lưu hộp thư, xếp push vào outbox.
 * Phụ thuộc (DB PostgreSQL, SQL Server trường) được tiêm qua `repo` và `directory` để unit test.
 */
const crypto = require('crypto');
const rules = require('./announcementRules');
const { nextAllowedSendTime } = require('./notificationRules');

const DAY = 24 * 60 * 60 * 1000;
const PUSH_TTL_MS = 3 * DAY;
const NOT_FOUND_PREVIEW = 50;

const createAnnouncementService = ({ repo, directory }) => {
  /**
   * Danh sách tài khoản app thuộc đối tượng nhận.
   * Chỉ người đã đăng nhập app (có dòng Users) mới nhận được; vai trò luôn bị giới hạn theo loại đối tượng.
   */
  const resolveAudience = async (audience) => {
    const roles = rules.ROLES_BY_TYPE[audience.type];
    if (!roles) throw new Error('Đối tượng nhận không hợp lệ');
    let users = [];
    let sourceCount = null;
    let notFound = [];
    let classLabels = [];

    if (audience.type === 'all' || audience.type === 'students' || audience.type === 'lecturers') {
      users = await repo.findUsersByRoles(roles);
    } else if (audience.type === 'cohorts' || audience.type === 'classes') {
      const filter = audience.type === 'cohorts' ? { cohorts: audience.cohorts } : { classIds: audience.classIds };
      const codes = await directory.activeStudentCodes(filter);
      sourceCount = codes.length;
      users = await repo.findUsersByUsernames(codes, roles);
      if (audience.type === 'classes') {
        classLabels = (await directory.classLabels(audience.classIds)).map((c) => c.className).filter(Boolean);
      }
    } else if (audience.type === 'users') {
      users = await repo.findUsersByUsernames(audience.usernames, roles);
      const found = new Set(users.map((u) => String(u.username).toLowerCase()));
      notFound = audience.usernames.filter((u) => !found.has(u.toLowerCase()));
      sourceCount = audience.usernames.length;
    }

    // Phòng thủ: lọc lại vai trò + khử trùng lặp dù repo đã lọc
    const byId = new Map();
    for (const u of users || []) if (u && u.id && roles.includes(u.role)) byId.set(u.id, u);
    const list = [...byId.values()];
    const deviceUserIds = await repo.userIdsWithActiveDevice(list.map((u) => u.id));
    return { users: list, deviceUserIds, sourceCount, notFound, label: rules.describeAudience(audience, { classLabels }) };
  };

  const summarize = (r) => ({
    label: r.label,
    recipients: r.users.length,
    students: r.users.filter((u) => u.role === 'student').length,
    lecturers: r.users.filter((u) => u.role === 'lecturer').length,
    withDevice: r.users.filter((u) => r.deviceUserIds.has(u.id)).length,
    sourceCount: r.sourceCount,
    notFoundCount: r.notFound.length,
    notFound: r.notFound.slice(0, NOT_FOUND_PREVIEW)
  });

  /** Đếm trước số người nhận (không ghi gì) */
  const preview = async (input) => summarize(await resolveAudience(input.audience));

  /**
   * Gửi thông báo: lưu thông báo + hộp thư từng người + outbox push trong MỘT transaction.
   * Push tôn trọng giờ yên lặng 22:00–06:30 trừ khi Admin đánh dấu khẩn.
   */
  const send = async (input, { ip = null, now = new Date() } = {}) => {
    const r = await resolveAudience(input.audience);
    const summary = summarize(r);
    if (r.users.length === 0) {
      return { ok: false, error: 'Không có người nhận nào đang dùng app trong đối tượng đã chọn.', summary };
    }
    const id = crypto.randomUUID();
    const notBefore = input.urgent ? now : nextAllowedSendTime(now);
    const expiresAt = new Date(now.getTime() + PUSH_TTL_MS);
    const pushBody = rules.buildPushBody(input.body);
    const data = JSON.stringify({ announcementId: id });

    const outboxRows = r.users
      .filter((u) => r.deviceUserIds.has(u.id))
      .map((u) => ({
        dedupeKey: rules.announcementDedupeKey(id, u.id),
        userId: u.id,
        kind: 'announcement',
        silent: false,
        title: input.title,
        body: pushBody,
        data,
        targetTokens: null,
        status: 'pending',
        attempts: 0,
        notBefore,
        expiresAt
      }));

    await repo.persistAnnouncement({
      announcement: {
        id,
        title: input.title,
        body: input.body,
        senderLabel: input.senderLabel,
        audienceType: input.audience.type,
        audience: JSON.stringify(input.audience),
        audienceLabel: summary.label.slice(0, 300),
        recipientCount: r.users.length,
        deviceUserCount: outboxRows.length,
        urgent: !!input.urgent,
        createdByIp: ip ? String(ip).slice(0, 64) : null
      },
      userIds: r.users.map((u) => u.id),
      outboxRows
    });

    return { ok: true, id, summary, scheduledFor: notBefore };
  };

  return { resolveAudience, preview, send };
};

module.exports = { createAnnouncementService, PUSH_TTL_MS };
