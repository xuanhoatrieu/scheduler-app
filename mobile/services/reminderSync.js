/**
 * ReminderSync — NƠI DUY NHẤT trong app được phép hẹn giờ / phát thông báo.
 *
 * - Luôn lấy lịch của HỌC KỲ HIỆN TẠI (không phụ thuộc học kỳ người dùng đang xem).
 * - Giảng viên: gom lịch dạy + lịch thi của MỌI hệ đào tạo.
 * - Sinh viên: lịch học + lịch thi + phát hiện điểm mới / điểm thay đổi.
 * - Mọi bước đều kiểm tra tài khoản còn là chủ hiện tại; đổi tài khoản giữa chừng → dừng.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getExams, getGradesAll, getSchedule, getScheduleSemesters } from './api';
import { getActiveOwner, ownerKeyOf, presentNow, replaceScheduledReminders, restoreActiveOwner } from './notificationService';
import { isPushActiveFor, reportSyncedIfPush } from './pushRegistration';
import { buildGradeNotification, diffGrades, planReminders } from './reminderPlanner';

/** Các hệ đào tạo giảng viên có thể dạy (khớp TRAINING_SYSTEMS ở màn Lịch dạy, trừ 'ALL') */
export const LECTURER_SYSTEMS = ['DHCQ', 'VLVH', 'DTTX', 'SDH', 'CTTT'];

// Tự đồng bộ khi mở lại app tối đa mỗi 30 phút (đăng nhập / làm mới thủ công thì chạy ngay)
const AUTO_INTERVAL_MS = 30 * 60 * 1000;
const GRADE_EVENTS_KEEP_DAYS = 7;

const gradeSnapshotKey = (owner) => `notif_grade_snapshot_v1:${owner}`;
const gradeEventsKey = (owner) => `notif_grade_events_v1:${owner}`;

let currentUser = null;
let running = null;
let rerunRequested = false;
let lastRunAt = 0;
let lastPlannedOwner = null;

/** Gọi mỗi khi tài khoản đang dùng thay đổi (đăng nhập / đổi vai trò / đăng xuất) */
export const setReminderUser = (user) => {
  currentUser = user || null;
  lastRunAt = 0;
  lastPlannedOwner = null;
};

/** Lịch nhắc của tài khoản này đã được lập lại thành công trong phiên chạy hiện tại chưa? */
export const wasPlannedFor = (owner) => !!owner && owner === lastPlannedOwner;

const isStillOwner = (owner) => !!owner && owner === getActiveOwner();

/**
 * Học kỳ hiện tại: ưu tiên cờ `current` từ server, nếu không có thì suy theo ngày
 * (tháng 8–12 → HK1 năm nay; tháng 1–7 → HK2 năm học trước).
 * @returns {{ semester: string, schoolYear: string }} schoolYear là năm bắt đầu, ví dụ '2026'
 */
export const resolveCurrentSemester = async () => {
  try {
    const res = await getScheduleSemesters();
    const list = res && res.success && Array.isArray(res.data) ? res.data : [];
    const cur = list.find((s) => s && s.current);
    if (cur) return { semester: String(cur.semester), schoolYear: String(cur.schoolYear) };
  } catch (e) {
    // dùng suy luận theo ngày bên dưới
  }
  const now = new Date();
  const month = now.getMonth() + 1;
  const isSem1 = month >= 8;
  return {
    semester: isSem1 ? '1' : '2',
    schoolYear: String(isSem1 ? now.getFullYear() : now.getFullYear() - 1),
  };
};

/**
 * Lấy dữ liệu sự kiện của học kỳ hiện tại.
 * `complete = false` nếu có nguồn nào lỗi mà không có cache → KHÔNG được xóa lịch nhắc cũ.
 */
const loadEventData = async (user, sem) => {
  const out = { schedule: [], exams: [], complete: true };
  const take = (res, key) => {
    if (res && res.success) out[key].push(...(Array.isArray(res.data) ? res.data : []));
    else out.complete = false;
  };

  if (user.role === 'student') {
    const [s, e] = await Promise.all([
      getSchedule(false, sem.semester, sem.schoolYear, 'ALL'),
      getExams(false, sem.semester, sem.schoolYear, 'ALL'),
    ]);
    take(s, 'schedule');
    take(e, 'exams');
  } else if (user.role === 'lecturer') {
    // Gọi tuần tự từng hệ để không dồn tải lên SQL Server TUAF
    for (const sys of LECTURER_SYSTEMS) {
      take(await getSchedule(false, sem.semester, sem.schoolYear, sys), 'schedule');
      take(await getExams(false, sem.semester, sem.schoolYear, sys), 'exams');
    }
  }
  // Vai trò khác (thanh tra / admin): không có lịch cá nhân → kế hoạch rỗng
  return out;
};

/** Dùng cho tab Thông Báo: cùng nguồn dữ liệu (kỳ hiện tại, mọi hệ với GV) như lịch nhắc */
export const loadCurrentEventData = async (user) => {
  if (!user) return { schedule: [], exams: [], complete: false, sem: null };
  const sem = await resolveCurrentSemester();
  const data = await loadEventData(user, sem);
  return { ...data, sem };
};

const readJson = async (key) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

/** Đọc các sự kiện điểm gần đây của đúng tài khoản (dùng cho tab Thông Báo) */
export const getRecentGradeEvents = async (user) => {
  const owner = ownerKeyOf(user);
  if (!owner) return [];
  const list = (await readJson(gradeEventsKey(owner))) || [];
  const cutoff = Date.now() - GRADE_EVENTS_KEEP_DAYS * 24 * 60 * 60 * 1000;
  return list.filter((e) => e && e.at >= cutoff);
};

/** Sinh viên: so điểm với lần trước, có điểm mới / điểm đổi thì báo ngay */
const checkGradeChanges = async (owner) => {
  const res = await getGradesAll(false);
  if (!isStillOwner(owner)) return;
  // Chỉ tin dữ liệu vừa lấy từ server; cache / lỗi / rỗng → không so, không ghi đè mốc
  if (!res || !res.success || res.source !== 'network' || !Array.isArray(res.data) || res.data.length === 0) return;

  const prev = await readJson(gradeSnapshotKey(owner));
  const { events, snapshot } = diffGrades(prev, res.data);
  if (!isStillOwner(owner)) return;
  await AsyncStorage.setItem(gradeSnapshotKey(owner), JSON.stringify(snapshot));

  if (events.length === 0) return;
  // Đã nhận push từ server cho tài khoản này → server là nguồn báo điểm, app chỉ ghi vào tab Thông báo
  // (tránh một sự kiện bị báo hai lần). Chưa có push (Expo Go, từ chối quyền, lỗi mạng) → tự báo như cũ.
  const notif = buildGradeNotification(events);
  if (notif && !(await isPushActiveFor(owner))) await presentNow(owner, { ...notif, data: { kind: 'grade' } });

  const at = Date.now();
  const cutoff = at - GRADE_EVENTS_KEEP_DAYS * 24 * 60 * 60 * 1000;
  const existing = ((await readJson(gradeEventsKey(owner))) || []).filter((e) => e && e.at >= cutoff);
  const merged = [...events.map((e) => ({ ...e, at })), ...existing].slice(0, 50);
  if (isStillOwner(owner)) await AsyncStorage.setItem(gradeEventsKey(owner), JSON.stringify(merged));
};

const runOnce = async (user) => {
  const owner = ownerKeyOf(user);
  if (!isStillOwner(owner)) return;

  const sem = await resolveCurrentSemester();
  if (!isStillOwner(owner)) return;

  const { schedule, exams, complete } = await loadEventData(user, sem);
  if (!isStillOwner(owner)) return;

  if (complete) {
    const plan = planReminders({ schedule, exams, schoolYear: sem.schoolYear, role: user.role, now: new Date() });
    const ok = await replaceScheduledReminders(owner, plan);
    if (ok && isStillOwner(owner)) {
      lastPlannedOwner = owner;
      // Báo server: máy đã có lịch nhắc mới nhất → không cần gửi bản tin sáng dự phòng.
      // Phải chờ xong: trong tác vụ nền, hệ điều hành có thể dừng app ngay khi hàm trả về.
      await reportSyncedIfPush(owner).catch(() => {});
    }
  }

  if (user.role === 'student') {
    await checkGradeChanges(owner);
  }
};

/**
 * Yêu cầu đồng bộ thông báo cho tài khoản hiện tại.
 * @param {{ force?: boolean }} opts - force: bỏ qua giới hạn 30 phút (đăng nhập, kéo làm mới)
 */
export const syncReminders = async ({ force = false } = {}) => {
  const user = currentUser;
  if (!user || !isStillOwner(ownerKeyOf(user))) return;
  if (!force && Date.now() - lastRunAt < AUTO_INTERVAL_MS) return;

  if (running) {
    // Đang chạy → đánh dấu chạy lại một lần sau khi xong (gộp các yêu cầu dồn dập)
    rerunRequested = true;
    return running;
  }

  lastRunAt = Date.now();
  running = (async () => {
    try {
      do {
        rerunRequested = false;
        const u = currentUser;
        if (!u) break;
        await runOnce(u);
      } while (rerunRequested);
    } catch (e) {
      console.warn('⚠️ [ReminderSync] Lỗi đồng bộ thông báo:', e.message);
    } finally {
      running = null;
    }
  })();
  return running;
};

/**
 * Đồng bộ khi push ẩn từ server đánh thức app (kể cả khi giao diện chưa chạy).
 * Chỉ chạy khi push đúng tài khoản đang đăng nhập trên máy; khác tài khoản / đã đăng xuất → bỏ qua.
 * @param {string|null} pushOwner - owner ghi trong push (username|role)
 * @returns {Promise<boolean>} true nếu đã chạy đồng bộ
 */
export const syncRemindersInBackground = async (pushOwner) => {
  let user = null;
  try {
    const raw = await AsyncStorage.getItem('user_profile');
    user = raw ? JSON.parse(raw) : null;
  } catch (e) {
    user = null;
  }
  const owner = ownerKeyOf(user);
  if (!owner) return false; // đã đăng xuất
  if (pushOwner && pushOwner !== owner) return false; // push của tài khoản khác
  if (!(await restoreActiveOwner(owner))) return false;
  if (ownerKeyOf(currentUser) !== owner) setReminderUser(user);
  await syncReminders({ force: true });
  return true;
};
