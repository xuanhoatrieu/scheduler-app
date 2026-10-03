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
import { useFocusEffect } from '@react-navigation/native';
import { getAnnouncements, getFinance, getNews, markAnnouncementRead } from '../services/api';
import { getClassSessions, hasRealExamTime } from '../services/reminderPlanner';
import { getRecentGradeEvents, loadCurrentEventData } from '../services/reminderSync';
import { Colors } from '../theme/colors';
import { atTime, dateKey, parseFullDate, startOfDay } from '../utils/scheduleDate';

const DAY_MS = 24 * 60 * 60 * 1000;
// Thời gian tối đa coi một buổi thi là "đang diễn ra" sau giờ bắt đầu
const EXAM_ONGOING_MINUTES = 120;

/** Liên kết http(s) trong nội dung văn bản thuần của thông báo Nhà trường */
const extractPlainLinks = (text) => {
  const out = [];
  const re = /https?:\/\/[^\s<>"')]+/gi;
  let m;
  while ((m = re.exec(text || '')) !== null) {
    const url = m[0].replace(/[.,;:!?]+$/, '');
    if (!out.some((l) => l.url === url)) out.push({ url, text: 'Mở liên kết đính kèm' });
  }
  return out.slice(0, 10);
};

const formatShortDate = (ts) => {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Chỉ liệt kê SỰ KIỆN CÓ THẬT của tài khoản đang đăng nhập:
 * - Buổi học/dạy HÔM NAY chưa kết thúc (mỗi khoảng tiết một mục; không có lịch → không có mục)
 * - Lịch thi trong 7 ngày tới (đọc được ngày thi)
 * - Điểm mới / điểm thay đổi trong 7 ngày qua (sinh viên)
 * - Còn nợ học phí (sinh viên)
 */
const buildPersonalNotifications = ({ schedule, exams, finance, gradeEvents, role, now = new Date() }) => {
  const notifications = [];
  const isLecturer = role === 'lecturer';
  const today = startOfDay(now);

  // 1. Buổi học / dạy hôm nay
  getClassSessions(schedule, { from: now, days: 1 })
    .filter((s) => s.endAt > now)
    .forEach((s, idx) => {
      const ongoing = s.startAt <= now;
      notifications.push({
        id: `class_${s.key}`,
        type: 'reminder',
        icon: 'alarm-outline',
        color: Colors.accentPurple,
        title: ongoing
          ? (isLecturer ? '🟢 Đang trong giờ dạy' : '🟢 Đang trong giờ học')
          : (isLecturer ? '⏰ Lịch dạy hôm nay' : '⏰ Lịch học hôm nay'),
        body: `Môn "${s.courseName}" • Tiết ${s.periodText} (${s.startTime}–${s.endTime})${s.room ? ` • Phòng ${s.room}` : ''}`,
        time: ongoing ? 'Đang diễn ra' : `Lúc ${s.startTime}`,
        priority: idx * 0.001,
      });
    });

  // 2. Lịch thi trong 7 ngày tới
  const seenExam = new Set();
  for (const exam of exams || []) {
    if (!exam || !exam.courseName) continue;
    const date = parseFullDate(exam.examDate);
    if (!date) continue;
    const diff = Math.round((startOfDay(date) - today) / DAY_MS);
    if (diff < 0 || diff > 7) continue;

    const realTime = hasRealExamTime(exam);
    if (diff === 0 && realTime) {
      const start = atTime(date, String(exam.startTime).trim());
      if (now.getTime() > start.getTime() + EXAM_ONGOING_MINUTES * 60 * 1000) continue; // đã thi xong
    }
    const key = `${dateKey(date)}|${exam.startTime || ''}|${exam.courseCode || exam.courseName}|${exam.className || ''}`;
    if (seenExam.has(key)) continue;
    seenExam.add(key);

    const timeStr = realTime ? ` • ${exam.startTime}` : (exam.examTime ? ` • ${exam.examTime}` : '');
    const classStr = isLecturer && exam.className ? ` • Lớp ${exam.className}` : '';
    notifications.push({
      id: `exam_${key}`,
      type: 'exam',
      icon: 'document-text',
      color: diff <= 2 ? Colors.danger : Colors.warning,
      title: diff === 0 ? '🚨 Thi HÔM NAY!' : `📝 Còn ${diff} ngày thi`,
      body: `${exam.courseName} — ${exam.examDate}${timeStr}${classStr}${exam.room ? ` • Phòng: ${exam.room}` : ''}`,
      time: diff === 0 ? 'Hôm nay' : `Còn ${diff} ngày`,
      priority: diff <= 2 ? 1 : 2,
    });
  }

  // 3. Điểm mới / điểm thay đổi (chỉ khi thực sự có thay đổi, do ReminderSync phát hiện)
  (gradeEvents || []).forEach((e, idx) => {
    const score = [e.totalGrade10 !== null && e.totalGrade10 !== undefined ? String(e.totalGrade10) : '', e.letterGrade ? `(${e.letterGrade})` : '']
      .filter(Boolean)
      .join(' ');
    notifications.push({
      id: `grade_${e.at}_${idx}`,
      type: 'grade',
      icon: 'trophy',
      color: Colors.success,
      title: e.type === 'changed' ? '📊 Điểm vừa được cập nhật' : '📊 Có điểm mới',
      body: `${e.courseName}${score ? `: ${score}` : ''}`,
      time: formatShortDate(e.at),
      priority: 0.8,
    });
  });

  // 4. Nợ học phí (sinh viên)
  if (!isLecturer) {
    const actualDebt = finance?.overallDebt !== undefined ? finance.overallDebt : (finance?.debtTuition || 0);
    if (actualDebt > 0) {
      notifications.push({
        id: 'finance_debt',
        type: 'finance',
        icon: 'wallet',
        color: Colors.danger,
        title: '💰 Còn nợ học phí',
        body: `Bạn còn nợ ${actualDebt.toLocaleString('vi-VN')}đ. Vui lòng nộp để tránh bị cấm thi.`,
        time: 'Quan trọng',
        priority: 0.5,
      });
    }
  }

  return notifications.sort((a, b) => a.priority - b.priority);
};

export default function NotificationsScreen({ user, route }) {
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'school'
  const [personalNotifs, setPersonalNotifs] = useState([]);
  const [schoolNews, setSchoolNews] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedNews, setSelectedNews] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAnnouncements = async () => {
    const res = await getAnnouncements();
    if (res.success) {
      setAnnouncements(res.data);
      setUnreadCount(res.unread);
    }
  };

  const loadAllData = async () => {
    try {
      const role = user?.role;
      const isStudent = role === 'student';
      const [eventData, financeRes, newsRes, gradeEvents] = await Promise.all([
        loadCurrentEventData(user),
        isStudent ? getFinance() : Promise.resolve(null),
        getNews(),
        isStudent ? getRecentGradeEvents(user) : Promise.resolve([]),
        loadAnnouncements(),
      ]);

      setPersonalNotifs(
        buildPersonalNotifications({
          schedule: eventData.schedule,
          exams: eventData.exams,
          finance: financeRes && financeRes.success ? financeRes.data : null,
          gradeEvents,
          role,
          now: new Date(),
        })
      );

      if (newsRes.success && newsRes.data) {
        setSchoolNews(newsRes.data);
      }
    } catch (err) {
      console.warn('Error loading notifications data:', err);
    }
  };

  useEffect(() => {
    // Đổi tài khoản → xóa ngay hộp thư cũ trước khi tải của tài khoản mới
    setAnnouncements([]);
    setUnreadCount(0);
    loadAllData().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username, user?.role]);

  // Quay lại tab → làm mới hộp thư Nhà trường (nhẹ, chỉ 1 request)
  useFocusEffect(
    useCallback(() => {
      loadAnnouncements();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.username, user?.role])
  );

  // Mở từ push của Nhà trường → chuyển sang mục "Nhà Trường"
  const openedAt = route?.params?.at;
  useEffect(() => {
    if (route?.params?.tab === 'school') {
      setActiveTab('school');
      loadAnnouncements();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedAt]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username, user?.role]);

  const openItem = (item) => {
    setSelectedNews(item);
    if (item._kind === 'ann' && !item.read) {
      setAnnouncements((list) => list.map((a) => (a.id === item.id ? { ...a, read: true } : a)));
      setUnreadCount((n) => Math.max(0, n - 1));
      markAnnouncementRead(item.id);
    }
  };

  const schoolItems = [
    ...announcements.map((a) => ({ ...a, _kind: 'ann', _key: `ann_${a.id}` })),
    ...schoolNews.map((n) => ({ ...n, _kind: 'news', _key: `news_${n.id || n.newsId}` })),
  ];

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
              Nhà Trường ({schoolItems.length})
            </Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
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

      {/* Tab 2: Thông báo Admin gửi riêng (trên cùng) + tin chính thức từ tblNews */}
      {activeTab === 'school' && (
        <FlatList
          data={schoolItems}
          keyExtractor={(item) => item._key}
          contentContainerStyle={styles.listPadding}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
          }
          renderItem={({ item }) => (item._kind === 'ann' ? (
            <TouchableOpacity
              style={[styles.newsCard, !item.read && styles.annCardUnread]}
              activeOpacity={0.8}
              onPress={() => openItem(item)}
            >
              <View style={styles.newsHeaderRow}>
                <View style={[styles.newsBadge, styles.annBadge]}>
                  <Ionicons name="megaphone" size={12} color={Colors.accentPurple} />
                  <Text style={[styles.newsBadgeText, { color: Colors.accentPurple }]} numberOfLines={1}>
                    {item.senderLabel || 'Nhà trường'}
                  </Text>
                </View>
                <View style={styles.annMetaRight}>
                  {!item.read && <View style={styles.unreadDot} />}
                  <Text style={styles.newsDate}>{formatDate(item.createdAt)}</Text>
                </View>
              </View>

              <Text style={[styles.newsTitle, !item.read && styles.annTitleUnread]} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.newsSummary} numberOfLines={2}>
                {item.body}
              </Text>

              <View style={styles.newsFooter}>
                <Text style={styles.newsReadMore}>{item.read ? 'Xem lại' : 'Đọc thông báo'}</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.newsCard}
              activeOpacity={0.8}
              onPress={() => openItem(item)}
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
          ))}
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
            const isAnn = selectedNews._kind === 'ann';
            const links = isAnn
              ? extractPlainLinks(selectedNews.body)
              : extractLinksFromHtml(selectedNews.content || selectedNews.summary);
            const cleanContent = isAnn
              ? selectedNews.body
              : cleanHtmlTags(selectedNews.content || selectedNews.summary || 'Nội dung chi tiết thông báo đã được đăng tải trên Cổng thông tin sinh viên.');

            return (
              <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={styles.newsBadgeLarge}>
                  <Ionicons name={isAnn ? 'megaphone' : 'school'} size={14} color={Colors.primary} />
                  <Text style={styles.newsBadgeLargeText}>
                    {isAnn ? `Thông báo từ ${selectedNews.senderLabel || 'Nhà trường'}` : 'Thông báo chính thức từ Nhà trường'}
                  </Text>
                </View>

                <Text style={styles.modalArticleTitle}>{selectedNews.title}</Text>

                <View style={styles.modalMetaRow}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.modalMetaText}>Ngày đăng: {formatDate(isAnn ? selectedNews.createdAt : selectedNews.postDate)}</Text>
                </View>

                <View style={styles.divider} />

                <Text style={styles.modalArticleContent} selectable={isAnn}>
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

  // Thông báo Admin gửi
  annCardUnread: { borderColor: Colors.accentPurple + '55', backgroundColor: Colors.accentPurple + '08' },
  annBadge: { backgroundColor: Colors.accentPurple + '18', maxWidth: '70%' },
  annMetaRight: { flexDirection: 'row', alignItems: 'center' },
  annTitleUnread: { fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger, marginRight: 6 },
  unreadBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center', marginLeft: 6,
  },
  unreadBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

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
