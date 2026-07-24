import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getSchedule, getExams, getGrades, getFinance, getNews } from '../services/api';
import { Colors } from '../theme/colors';

/**
 * Quy đổi tiết học sang giờ bắt đầu thực tế của trường TUAF
 */
const getStartTimeByPeriod = (periodText) => {
  if (!periodText) return '07:00';
  const firstPeriod = parseInt(periodText.split('-')[0]) || 1;
  
  if (firstPeriod === 1) return '07:00';
  if (firstPeriod === 2) return '07:55';
  if (firstPeriod === 3) return '08:50';
  if (firstPeriod === 4) return '09:55';
  if (firstPeriod === 5) return '10:50';
  
  if (firstPeriod === 6) return '13:00';
  if (firstPeriod === 7) return '13:55';
  if (firstPeriod === 8) return '14:50';
  if (firstPeriod === 9) return '15:55';
  if (firstPeriod === 10) return '16:50';
  
  return '07:00';
};

const subtractMinutesFromTime = (timeStr, mins) => {
  const [h, m] = timeStr.split(':').map(Number);
  let totalMins = h * 60 + m - mins;
  if (totalMins < 0) totalMins += 24 * 60;
  const hours = Math.floor(totalMins / 60).toString().padStart(2, '0');
  const minutes = (totalMins % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

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

const getPeriodStatus = (studyTime) => {
  const range = parseStudyTime(studyTime);
  if (!range) return 'unknown';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today < range.start) return 'upcoming';
  if (today > range.end) return 'past';
  return 'active';
};

const generatePersonalNotifications = (schedule, exams, grades, finance) => {
  const notifications = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Lịch đi học hôm nay (30m và 15m)
  if (schedule && schedule.length > 0) {
    const dayOfWeekIndex = today.getDay();
    const currentDayOfWeek = dayOfWeekIndex === 0 ? 8 : dayOfWeekIndex + 1;

    const todayClasses = schedule.filter(
      item => item.dayOfWeek === currentDayOfWeek && getPeriodStatus(item.studyTime) === 'active'
    );

    todayClasses.forEach((classItem) => {
      const startTime = getStartTimeByPeriod(classItem.periodText);
      const room = classItem.room || 'Chưa xếp';
      const courseName = classItem.courseName;

      const time30m = subtractMinutesFromTime(startTime, 30);
      const time15m = subtractMinutesFromTime(startTime, 15);

      notifications.push({
        id: `class_reminder_30m_${classItem.id || classItem.courseName}_${startTime}`,
        type: 'reminder',
        icon: 'alarm-outline',
        color: Colors.accentPurple,
        title: '🚨 Nhắc lịch học [Trước 30 phút]',
        body: `Môn "${courseName}" sẽ bắt đầu lúc ${startTime} tại phòng ${room}. Chuẩn bị sách vở và di chuyển đến trường nào!`,
        time: `Lúc ${time30m}`,
        priority: 0.1,
      });

      notifications.push({
        id: `class_reminder_15m_${classItem.id || classItem.courseName}_${startTime}`,
        type: 'reminder',
        icon: 'alert-circle',
        color: Colors.danger,
        title: '⏰ Nhắc lịch học [Khẩn cấp - 15 phút]',
        body: `Chỉ còn 15 phút nữa là bắt đầu môn "${courseName}" tại phòng ${room} (giờ học: ${startTime}). Khẩn trương di chuyển thôi!`,
        time: `Lúc ${time15m}`,
        priority: 0.2,
      });
    });
  }

  // 2. Lịch thi sắp tới
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

  // 3. Nợ học phí
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

  // 4. Kết quả học tập
  if (grades && grades.length > 0) {
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
  }

  // 5. Thông báo hệ thống
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

  return notifications.sort((a, b) => a.priority - b.priority);
};

export default function NotificationsScreen({ user }) {
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'school'
  const [personalNotifs, setPersonalNotifs] = useState([]);
  const [schoolNews, setSchoolNews] = useState([]);
  const [selectedNews, setSelectedNews] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAllData = async () => {
    try {
      const [scheduleRes, examsRes, gradesRes, financeRes, newsRes] = await Promise.all([
        getSchedule(),
        getExams(),
        getGrades(),
        getFinance(),
        getNews(),
      ]);

      const pNotifs = generatePersonalNotifications(
        scheduleRes.success ? scheduleRes.data : [],
        examsRes.success ? examsRes.data : [],
        gradesRes.success ? gradesRes.data : [],
        financeRes.success ? financeRes.data : null,
      );
      setPersonalNotifs(pNotifs);

      if (newsRes.success && newsRes.data) {
        setSchoolNews(newsRes.data);
      }
    } catch (err) {
      console.warn('Error loading notifications data:', err);
    }
  };

  useEffect(() => {
    loadAllData().finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  }, []);

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  const cleanHtmlTags = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
  };

  const extractLinksFromHtml = (html) => {
    if (!html) return [];
    const links = [];
    const regex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      let url = match[1];
      let text = match[2].replace(/<[^>]*>?/gm, '').trim();
      if (url.startsWith('/')) {
        url = `https://sinhvien.tuaf.edu.vn${url}`;
      }
      if (url && !links.some(l => l.url === url)) {
        links.push({ url, text: text || 'Xem văn bản / liên kết đính kèm' });
      }
    }
    return links;
  };

  const getIconBg = (color) => color + '15';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header & Segmented Tab Controls */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Thông Báo</Text>
        <Text style={styles.headerSubtitle}>Cập nhật lịch học & tin tức Nhà trường</Text>

        <View style={styles.segmentedContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'personal' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('personal')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="person-circle-outline"
              size={18}
              color={activeTab === 'personal' ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.segmentText, activeTab === 'personal' && styles.segmentTextActive]}>
              Lịch Cá Nhân ({personalNotifs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'school' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('school')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="megaphone-outline"
              size={18}
              color={activeTab === 'school' ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.segmentText, activeTab === 'school' && styles.segmentTextActive]}>
              Nhà Trường ({schoolNews.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab 1: Personal Notifications List */}
      {activeTab === 'personal' && (
        <FlatList
          data={personalNotifs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPadding}
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
                <Ionicons name="notifications-off-outline" size={56} color={Colors.borderLight} />
                <Text style={styles.emptyText}>Không có nhắc nhở nào</Text>
              </View>
            )
          }
        />
      )}

      {/* Tab 2: Official School Announcements (tblNews) */}
      {activeTab === 'school' && (
        <FlatList
          data={schoolNews}
          keyExtractor={(item) => String(item.id || item.newsId)}
          contentContainerStyle={styles.listPadding}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.newsCard}
              activeOpacity={0.8}
              onPress={() => setSelectedNews(item)}
            >
              <View style={styles.newsHeaderRow}>
                <View style={styles.newsBadge}>
                  <Ionicons name="school-outline" size={12} color={Colors.primary} />
                  <Text style={styles.newsBadgeText}>Phòng Đào Tạo</Text>
                </View>
                <Text style={styles.newsDate}>{formatDate(item.postDate)}</Text>
              </View>

              <Text style={styles.newsTitle} numberOfLines={2}>
                {item.title}
              </Text>

              {item.summary ? (
                <Text style={styles.newsSummary} numberOfLines={2}>
                  {cleanHtmlTags(item.summary)}
                </Text>
              ) : null}

              <View style={styles.newsFooter}>
                <Text style={styles.newsReadMore}>Xem chi tiết thông báo</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.emptyWrap}>
                <Ionicons name="newspaper-outline" size={56} color={Colors.borderLight} />
                <Text style={styles.emptyText}>Chưa có thông báo mới từ Nhà trường</Text>
              </View>
            )
          }
        />
      )}

      {/* Modal Reader View for School Announcements */}
      <Modal
        visible={Boolean(selectedNews)}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedNews(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setSelectedNews(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>Chi Tiết Thông Báo</Text>
            <View style={{ width: 36 }} />
          </View>

          {selectedNews && (() => {
            const links = extractLinksFromHtml(selectedNews.content || selectedNews.summary);
            const cleanContent = cleanHtmlTags(selectedNews.content || selectedNews.summary || 'Nội dung chi tiết thông báo đã được đăng tải trên Cổng thông tin sinh viên.');

            return (
              <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={styles.newsBadgeLarge}>
                  <Ionicons name="school" size={14} color={Colors.primary} />
                  <Text style={styles.newsBadgeLargeText}>Thông báo chính thức từ Nhà trường</Text>
                </View>

                <Text style={styles.modalArticleTitle}>{selectedNews.title}</Text>

                <View style={styles.modalMetaRow}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.modalMetaText}>Ngày đăng: {formatDate(selectedNews.postDate)}</Text>
                </View>

                <View style={styles.divider} />

                <Text style={styles.modalArticleContent}>
                  {cleanContent}
                </Text>

                {/* Interactive Document / Link Cards */}
                {links.length > 0 && (
                  <View style={styles.linksSection}>
                    <Text style={styles.linksSectionTitle}>📎 VĂN BẢN & LIÊN KẾT ĐÍNH KÈM ({links.length}):</Text>
                    {links.map((link, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.linkCard}
                        activeOpacity={0.8}
                        onPress={() => Linking.openURL(link.url).catch(err => console.warn('Lỗi mở liên kết:', err))}
                      >
                        <View style={styles.linkIconWrap}>
                          <Ionicons name="document-attach-outline" size={20} color={Colors.primary} />
                        </View>
                        <View style={styles.linkInfo}>
                          <Text style={styles.linkText} numberOfLines={2}>{link.text}</Text>
                          <Text style={styles.linkUrl} numberOfLines={1}>{link.url}</Text>
                        </View>
                        <Ionicons name="open-outline" size={18} color={Colors.primary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>
            );
          })()}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2, marginBottom: 14 },

  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: Colors.surface,
    elevation: 2,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginLeft: 6,
  },
  segmentTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },

  listPadding: { padding: 16, paddingBottom: 28 },

  // Personal Notif Card
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

  // School News Card
  newsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    elevation: 2,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  newsHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  newsBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primaryLight + '20',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
  },
  newsBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary, marginLeft: 4 },
  newsDate: { fontSize: 11, color: Colors.textMuted },
  newsTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, lineHeight: 21, marginBottom: 6 },
  newsSummary: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 12 },
  newsFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
    paddingTop: 8, marginTop: 4,
  },
  newsReadMore: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginRight: 4 },

  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 14 },

  // Modal Reader Styles
  modalContainer: { flex: 1, backgroundColor: Colors.surface },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  modalHeaderTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  modalBody: { flex: 1, padding: 20 },
  newsBadgeLarge: {
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryLight + '25',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, marginBottom: 12,
  },
  newsBadgeLargeText: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginLeft: 6 },
  modalArticleTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, lineHeight: 28, marginBottom: 10 },
  modalMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  modalMetaText: { fontSize: 12, color: Colors.textMuted, marginLeft: 6 },
  modalArticleContent: { fontSize: 15, color: Colors.textPrimary, lineHeight: 24, marginBottom: 20 },

  // Link Section Styles
  linksSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  linksSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  linkIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  linkInfo: { flex: 1, marginRight: 8 },
  linkText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, lineHeight: 18 },
  linkUrl: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});
