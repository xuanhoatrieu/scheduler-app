import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getSchedule, getExams, getGrades, getFinance } from '../services/api';
import { Colors } from '../theme/colors';

/**
 * Quy đổi tiết học sang giờ bắt đầu thực tế của trường TUAF
 */
const getStartTimeByPeriod = (periodText) => {
  if (!periodText) return '07:00';
  const firstPeriod = parseInt(periodText.split('-')[0]) || 1;
  
  // Ca sáng
  if (firstPeriod === 1) return '07:00';
  if (firstPeriod === 2) return '07:55';
  if (firstPeriod === 3) return '08:50';
  if (firstPeriod === 4) return '09:55';
  if (firstPeriod === 5) return '10:50';
  
  // Ca chiều
  if (firstPeriod === 6) return '13:00';
  if (firstPeriod === 7) return '13:55';
  if (firstPeriod === 8) return '14:50';
  if (firstPeriod === 9) return '15:55';
  if (firstPeriod === 10) return '16:50';
  
  return '07:00';
};

/**
 * Tính toán thời gian nhắc nhở (lùi lại x phút từ hh:mm)
 */
const subtractMinutesFromTime = (timeStr, mins) => {
  const [h, m] = timeStr.split(':').map(Number);
  let totalMins = h * 60 + m - mins;
  if (totalMins < 0) totalMins += 24 * 60;
  const hours = Math.floor(totalMins / 60).toString().padStart(2, '0');
  const minutes = (totalMins % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * Parse "dd/MM/yyyy- dd/MM/yyyy" → { start: Date, end: Date }
 */
const parseStudyTime = (studyTime) => {
  if (!studyTime) return null;
  const parts = studyTime.split('-').map(s => s.trim());
  if (parts.length < 2) return null;

  const parseDate = (str) => {
    const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  };

  const start = parseDate(parts[0]);
  const end = parseDate(parts[1]);
  if (!start || !end) return null;
  return { start, end };
};

/**
 * Xác định trạng thái giai đoạn
 */
const getPeriodStatus = (studyTime) => {
  const range = parseStudyTime(studyTime);
  if (!range) return 'unknown';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today < range.start) return 'upcoming';
  if (today > range.end) return 'past';
  return 'active';
};

/**
 * Tạo thông báo tự động từ dữ liệu đã đồng bộ
 * Tích hợp tự động nhắc lịch đi học trước 30 phút và 15 phút
 */
const generateNotifications = (schedule, exams, grades, finance) => {
  const notifications = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // === 0. TỰ ĐỘNG SINH NHẮC LỊCH ĐI HỌC (30 PHÚT VÀ 15 PHÚT) ===
  if (schedule && schedule.length > 0) {
    // Xác định thứ trong tuần (Chủ nhật = 8, Thứ 2 = 2, ...)
    const dayOfWeekIndex = today.getDay(); // 0 = CN, 1 = T2, ...
    const currentDayOfWeek = dayOfWeekIndex === 0 ? 8 : dayOfWeekIndex + 1;

    // Lọc lịch học của ngày hôm nay và đang trong giai đoạn đang học (active)
    const todayClasses = schedule.filter(
      item => item.dayOfWeek === currentDayOfWeek && getPeriodStatus(item.studyTime) === 'active'
    );

    todayClasses.forEach((classItem) => {
      const startTime = getStartTimeByPeriod(classItem.periodText);
      const room = classItem.room || 'Chưa xếp';
      const courseName = classItem.courseName;

      const time30m = subtractMinutesFromTime(startTime, 30);
      const time15m = subtractMinutesFromTime(startTime, 15);

      // Nhắc nhở trước 30 phút
      notifications.push({
        id: `class_reminder_30m_${classItem.id || classItem.courseName}_${startTime}`,
        type: 'reminder',
        icon: 'alarm-outline',
        color: Colors.accentPurple,
        title: '🚨 Nhắc lịch học [Trước 30 phút]',
        body: `Môn "${courseName}" sẽ bắt đầu lúc ${startTime} tại phòng ${room}. Chuẩn bị sách vở và di chuyển đến trường nào!`,
        time: `Lúc ${time30m}`,
        priority: 0.1, // Ưu tiên hàng đầu
      });

      // Nhắc nhở trước 15 phút
      notifications.push({
        id: `class_reminder_15m_${classItem.id || classItem.courseName}_${startTime}`,
        type: 'reminder',
        icon: 'alert-circle',
        color: Colors.danger,
        title: '⏰ Nhắc lịch học [Khẩn cấp - 15 phút]',
        body: `Chỉ còn 15 phút nữa là bắt đầu môn "${courseName}" tại phòng ${room} (giờ học: ${startTime}). Khẩn trương di chuyển thôi!`,
        time: `Lúc ${time15m}`,
        priority: 0.2, // Ưu tiên cực cao
      });
    });
  }

  // 1. Lịch thi sắp tới (trong 7 ngày)
  if (exams && exams.length > 0) {
    for (const exam of exams) {
      if (!exam.examDate) continue;
      const parts = exam.examDate.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (!parts) continue;
      const examDate = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
      const diff = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));

      if (diff >= 0 && diff <= 7) {
        notifications.push({
          id: `exam_${exam.courseName}_${exam.examDate}`,
          type: 'exam',
          icon: 'document-text',
          color: diff <= 2 ? Colors.danger : Colors.warning,
          title: diff === 0 ? '🚨 Thi HÔM NAY!' : `📝 Còn ${diff} ngày thi`,
          body: `${exam.courseName} — ${exam.examDate} ${exam.examTime ? `• Ca: ${exam.examTime}` : ''} ${exam.room ? `• Phòng: ${exam.room}` : ''}`,
          time: diff === 0 ? 'Hôm nay' : `Còn ${diff} ngày`,
          priority: diff <= 2 ? 1 : 2,
        });
      }
    }
  }

  // 2. Nợ học phí
  if (finance && finance.debtTuition > 0) {
    notifications.push({
      id: 'finance_debt',
      type: 'finance',
      icon: 'wallet',
      color: Colors.danger,
      title: '💰 Còn nợ học phí',
      body: `Bạn còn nợ ${finance.debtTuition.toLocaleString('vi-VN')}đ. Vui lòng nộp để tránh bị cấm thi.`,
      time: 'Quan trọng',
      priority: 0.5,
    });
  }

  // 3. Điểm mới
  if (grades && grades.length > 0) {
    const pendingGrades = grades.filter(g => g.totalGrade10 === null || g.totalGrade10 === undefined);
    const completedGrades = grades.filter(g => g.totalGrade10 !== null && g.totalGrade10 !== undefined);

    if (completedGrades.length > 0) {
      const avgGrade = (completedGrades.reduce((s, g) => s + g.totalGrade10, 0) / completedGrades.length).toFixed(1);
      notifications.push({
        id: 'grades_summary',
        type: 'grade',
        icon: 'trophy',
        color: parseFloat(avgGrade) >= 7 ? Colors.success : Colors.warning,
        title: '🏆 Kết quả học tập tích lũy',
        body: `${completedGrades.length} môn đã có điểm, trung bình hệ 10: ${avgGrade}`,
        time: 'Cập nhật',
        priority: 3,
      });
    }

    if (pendingGrades.length > 0) {
      notifications.push({
        id: 'grades_pending',
        type: 'grade',
        icon: 'hourglass-outline',
        color: Colors.accentBlue,
        title: '⏳ Đang chờ điểm môn học',
        body: `${pendingGrades.length} môn chưa có điểm: ${pendingGrades.slice(0, 2).map(g => g.courseName).join(', ')}${pendingGrades.length > 2 ? '...' : ''}`,
        time: 'Đang chờ',
        priority: 4,
      });
    }
  }

  // 4. Thông báo chung — Đồng bộ thành công
  notifications.push({
    id: 'sync_info',
    type: 'info',
    icon: 'checkmark-circle',
    color: Colors.success,
    title: '✅ Dữ liệu đã được đồng bộ',
    body: 'Lịch học, lịch thi, điểm số và học phí đã được cập nhật từ cổng thông tin trường.',
    time: 'Vừa xong',
    priority: 10,
  });

  // Sắp xếp theo priority
  return notifications.sort((a, b) => a.priority - b.priority);
};

export default function NotificationsScreen({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      const [scheduleRes, examsRes, gradesRes, financeRes] = await Promise.all([
        getSchedule(),
        getExams(),
        getGrades(),
        getFinance(),
      ]);

      const notifs = generateNotifications(
        scheduleRes.success ? scheduleRes.data : [],
        examsRes.success ? examsRes.data : [],
        gradesRes.success ? gradesRes.data : [],
        financeRes.success ? financeRes.data : null,
      );
      setNotifications(notifs);
    } catch (err) {
      console.warn('Error loading notifications:', err);
    }
  };

  useEffect(() => {
    loadNotifications().finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, []);

  const getIconBg = (color) => color + '12';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Thông Báo</Text>
        <Text style={styles.headerSubtitle}>Cập nhật & nhắc nhở tự động</Text>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        renderItem={({ item }) => (
          <View style={styles.notifCard}>
            <View style={[styles.notifIcon, { backgroundColor: getIconBg(item.color) }]}>
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <View style={styles.notifContent}>
              <View style={styles.notifHeaderRow}>
                <Text style={styles.notifTitle}>{item.title}</Text>
                <Text style={[styles.notifTime, { color: item.color }]}>{item.time}</Text>
              </View>
              <Text style={styles.notifBody}>{item.body}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={64} color={Colors.borderLight} />
              <Text style={styles.emptyText}>Chưa có thông báo nào</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  notifCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  notifIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  notifContent: { flex: 1 },
  notifHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
  },
  notifTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, flex: 1, marginRight: 8 },
  notifTime: { fontSize: 10, fontWeight: '700' },
  notifBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 16 },
});
