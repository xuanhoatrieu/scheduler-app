import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Cấu hình cách hiển thị thông báo khi ứng dụng đang mở (foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const CHANNEL_ID = 'exam_and_schedule_reminders';

/**
 * Khởi tạo kênh thông báo (Notification Channel) trên Android
 * Đặt mức ưu tiên MAX để bung banner nổi trên màn hình và phát chuông/rung
 */
export const initNotifications = async () => {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Lịch Thi & Lịch Học',
        description: 'Thông báo nhắc nhở trước giờ thi và giờ học (30 phút & 15 phút)',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        enableLights: true,
        lightColor: '#2563EB',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        showBadge: true,
      });
    }
  } catch (error) {
    console.warn('⚠️ Lỗi khởi tạo Notification Channel:', error.message);
  }
};

/**
 * Yêu cầu quyền thông báo từ người dùng
 */
export const requestNotificationPermissions = async () => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch (error) {
    console.warn('⚠️ Không thể xin quyền thông báo:', error.message);
    return false;
  }
};

/**
 * Chuyển đổi ngày và giờ thi sang đối tượng Date chính xác
 */
const parseExamDateTime = (dateStr, timeStr, startTimeStr) => {
  if (!dateStr) return null;

  let year, month, day;
  // Parse format DD/MM/YYYY hoặc YYYY-MM-DD
  const dmyMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    day = parseInt(dmyMatch[1], 10);
    month = parseInt(dmyMatch[2], 10) - 1;
    year = parseInt(dmyMatch[3], 10);
  } else {
    const ymdMatch = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      year = parseInt(ymdMatch[1], 10);
      month = parseInt(ymdMatch[2], 10) - 1;
      day = parseInt(ymdMatch[3], 10);
    } else {
      return null;
    }
  }

  // Xác định giờ bắt đầu: ưu tiên startTimeStr (ví dụ: '07:30', '13:00')
  let hours = 7;
  let minutes = 0;

  let timeSource = startTimeStr || '';
  if (!timeSource && timeStr) {
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      timeSource = `${timeMatch[1]}:${timeMatch[2]}`;
    } else if (timeStr.includes('Ca 1') || timeStr.includes('Tiết 1')) {
      timeSource = '07:00';
    } else if (timeStr.includes('Ca 2') || timeStr.includes('Tiết 4')) {
      timeSource = '09:55';
    } else if (timeStr.includes('Ca 3') || timeStr.includes('Tiết 6')) {
      timeSource = '13:00';
    } else if (timeStr.includes('Ca 4') || timeStr.includes('Tiết 9')) {
      timeSource = '15:55';
    } else if (timeStr.includes('Tiết 11') || timeStr.includes('Tiết 13')) {
      timeSource = '17:40';
    }
  }

  if (timeSource) {
    const parts = timeSource.split(':');
    hours = parseInt(parts[0], 10) || 7;
    minutes = parseInt(parts[1], 10) || 0;
  }

  return new Date(year, month, day, hours, minutes, 0, 0);
};

/**
 * Chuẩn hóa ID thông báo để tránh ký tự đặc biệt gây lỗi native
 */
const sanitizeNotifId = (id) => String(id || 'item').replace(/[^a-zA-Z0-9_-]/g, '_');

/**
 * Lên lịch thông báo chuông và màn hình khóa trước giờ thi 30 phút và 15 phút
 */
export const scheduleExamReminders = async (exams) => {
  try {
    if (!exams || !Array.isArray(exams) || exams.length === 0) return;

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    const now = new Date().getTime();

    for (const exam of exams) {
      if (!exam || !exam.examDate) continue;

      const examDateTime = parseExamDateTime(exam.examDate, exam.examTime, exam.startTime);
      if (!examDateTime) continue;

      const examTimestamp = examDateTime.getTime();
      const timeDisplay = exam.startTime || (exam.examTime ? exam.examTime.replace(/Tiết.*?\((.*?)\)/, '$1') : '07:30');
      const sbdText = exam.seatNumber ? ` • SBD: ${exam.seatNumber}` : '';
      const roomText = exam.room ? ` • Phòng: ${exam.room}` : '';
      const safeId = sanitizeNotifId(exam.id || exam.courseCode || exam.courseName);

      // 1. Nhắc trước 30 phút
      const trigger30m = examTimestamp - 30 * 60 * 1000;
      if (trigger30m > now) {
        const notifId = `exam_30m_${safeId}`;
        try {
          await Notifications.scheduleNotificationAsync({
            identifier: notifId,
            content: {
              title: '🚨 Nhắc lịch thi [Trước 30 phút]',
              body: `Môn "${exam.courseName || ''}" thi lúc ${timeDisplay}${roomText}${sbdText}. Hãy chuẩn bị di chuyển đến phòng thi!`,
              sound: true,
              priority: Notifications.AndroidNotificationPriority?.HIGH || 'high',
              channelId: CHANNEL_ID,
              data: { type: 'exam', examId: exam.id },
            },
            trigger: {
              type: 'date',
              date: new Date(trigger30m),
              channelId: CHANNEL_ID,
            },
          });
        } catch (err) {
          console.warn('⚠️ Lỗi hẹn giờ thông báo thi 30m:', err.message);
        }
      }

      // 2. Nhắc khẩn cấp trước 15 phút
      const trigger15m = examTimestamp - 15 * 60 * 1000;
      if (trigger15m > now) {
        const notifId = `exam_15m_${safeId}`;
        try {
          await Notifications.scheduleNotificationAsync({
            identifier: notifId,
            content: {
              title: '⏰ LỊCH THI KHẨN CẤP [Còn 15 phút]',
              body: `Chỉ còn 15 phút nữa là bắt đầu thi môn "${exam.courseName || ''}"${roomText}${sbdText}. Khẩn trương vào phòng thi!`,
              sound: true,
              priority: Notifications.AndroidNotificationPriority?.MAX || 'max',
              channelId: CHANNEL_ID,
              data: { type: 'exam', examId: exam.id },
            },
            trigger: {
              type: 'date',
              date: new Date(trigger15m),
              channelId: CHANNEL_ID,
            },
          });
        } catch (err) {
          console.warn('⚠️ Lỗi hẹn giờ thông báo thi 15m:', err.message);
        }
      }
    }
  } catch (globalErr) {
    console.warn('⚠️ [notificationService] scheduleExamReminders gặp lỗi ngoại lệ:', globalErr.message);
  }
};

/**
 * Lấy giờ bắt đầu của tiết học tại TUAF
 */
const getClassStartTime = (periodText) => {
  if (!periodText) return '07:00';
  const m = String(periodText).match(/(\d+)/);
  if (!m) return '07:00';
  const p = parseInt(m[1], 10);
  if (p === 1) return '07:00';
  if (p === 2) return '07:55';
  if (p === 3) return '08:50';
  if (p === 4) return '09:55';
  if (p === 5) return '10:50';
  if (p === 6) return '13:00';
  if (p === 7) return '13:55';
  if (p === 8) return '14:50';
  if (p === 9) return '15:55';
  if (p === 10) return '16:50';
  if (p === 11) return '17:40';
  if (p === 12) return '18:30';
  if (p === 13) return '19:20';
  return '07:00';
};

/**
 * Phân tích khoảng thời gian học (studyTime)
 */
const parseClassStudyRange = (studyTime) => {
  if (!studyTime || typeof studyTime !== 'string') return null;
  const parts = studyTime.split(/[-–—]|->|đến|to/).map(s => s.trim());
  if (parts.length < 2) return null;

  const parseD = (str) => {
    const m = str.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    return new Date(year, month, day);
  };

  const start = parseD(parts[0]);
  const end = parseD(parts[1]);
  if (!start || !end) return null;
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

/**
 * Lên lịch thông báo chuông và màn hình khóa cho LỊCH HỌC (TKB) trong 7 ngày tới
 * Tự động nhắc nhở trước 30 phút và 15 phút
 */
export const scheduleClassReminders = async (schedule) => {
  try {
    if (!schedule || !Array.isArray(schedule) || schedule.length === 0) return;

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    const now = new Date();
    const nowTime = now.getTime();

    // Quét 7 ngày tới (từ hôm nay đến 7 ngày sau)
    for (let offset = 0; offset < 7; offset++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      targetDate.setHours(0, 0, 0, 0);

      const dayOfWeek = targetDate.getDay() === 0 ? 8 : targetDate.getDay() + 1; // 2: Thứ 2, ..., 8: CN

      // Lọc các môn học diễn ra vào thứ này
      const classesOnDay = schedule.filter(item => {
        if (!item || item.dayOfWeek !== dayOfWeek) return false;
        const range = parseClassStudyRange(item.studyTime);
        if (range) {
          if (targetDate < range.start || targetDate > range.end) return false;
        }
        return true;
      });

      for (const classItem of classesOnDay) {
        if (!classItem) continue;
        const startTimeStr = getClassStartTime(classItem.periodText);
        const [h, m] = startTimeStr.split(':').map(Number);

        const classStartTime = new Date(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate(),
          h,
          m,
          0,
          0
        ).getTime();

        const dateKey = `${targetDate.getFullYear()}_${targetDate.getMonth() + 1}_${targetDate.getDate()}`;
        const roomStr = classItem.room ? ` • Phòng ${classItem.room}` : '';
        const safeClassId = sanitizeNotifId(classItem.id || classItem.courseName);
        const safeTime = startTimeStr.replace(':', '_');

        // 1. Nhắc trước 30 phút
        const trigger30m = classStartTime - 30 * 60 * 1000;
        if (trigger30m > nowTime) {
          const notifId = `class_30m_${safeClassId}_${dateKey}_${safeTime}`;
          try {
            await Notifications.scheduleNotificationAsync({
              identifier: notifId,
              content: {
                title: '🚨 Nhắc lịch học [Trước 30 phút]',
                body: `Môn "${classItem.courseName || ''}" sẽ bắt đầu lúc ${startTimeStr}${roomStr}. Chuẩn bị sách vở và di chuyển đến trường nào!`,
                sound: true,
                priority: Notifications.AndroidNotificationPriority?.HIGH || 'high',
                channelId: CHANNEL_ID,
                data: { type: 'class', classId: classItem.id },
              },
              trigger: {
                type: 'date',
                date: new Date(trigger30m),
                channelId: CHANNEL_ID,
              },
            });
          } catch (err) {
            console.warn('⚠️ Lỗi hẹn giờ thông báo học 30m:', err.message);
          }
        }

        // 2. Nhắc khẩn cấp trước 15 phút
        const trigger15m = classStartTime - 15 * 60 * 1000;
        if (trigger15m > nowTime) {
          const notifId = `class_15m_${safeClassId}_${dateKey}_${safeTime}`;
          try {
            await Notifications.scheduleNotificationAsync({
              identifier: notifId,
              content: {
                title: '⏰ Nhắc lịch học [Khẩn cấp - 15 phút]',
                body: `Chỉ còn 15 phút nữa là bắt đầu môn "${classItem.courseName || ''}"${roomStr} (giờ học: ${startTimeStr}). Khẩn trương vào lớp thôi!`,
                sound: true,
                priority: Notifications.AndroidNotificationPriority?.MAX || 'max',
                channelId: CHANNEL_ID,
                data: { type: 'class', classId: classItem.id },
              },
              trigger: {
                type: 'date',
                date: new Date(trigger15m),
                channelId: CHANNEL_ID,
              },
            });
          } catch (err) {
            console.warn('⚠️ Lỗi hẹn giờ thông báo học 15m:', err.message);
          }
        }
      }
    }
  } catch (globalErr) {
    console.warn('⚠️ [notificationService] scheduleClassReminders gặp lỗi ngoại lệ:', globalErr.message);
  }
};

/**
 * Hủy toàn bộ thông báo đã lên lịch
 */
export const cancelAllReminders = async () => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('⚠️ Lỗi hủy thông báo:', err.message);
  }
};
