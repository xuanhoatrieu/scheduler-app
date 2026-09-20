import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getExams, getScheduleSemesters } from '../services/api';
import { scheduleExamReminders } from '../services/notificationService';
import { Colors } from '../theme/colors';

const DAY_NAMES = {
  0: 'Chủ Nhật',
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
};

const getDynamicSemesters = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const isSem1 = currentMonth >= 8;
  const activeStartYear = isSem1 ? currentYear : currentYear - 1;
  const activeSem = isSem1 ? '1' : '2';

  const list = [];
  list.push({
    label: `HK${activeSem} ${activeStartYear}-${activeStartYear + 1}`,
    semester: activeSem,
    schoolYear: String(activeStartYear),
    current: true,
  });

  for (let y = activeStartYear; y >= activeStartYear - 2; y--) {
    if (y !== activeStartYear || activeSem !== '2') {
      list.push({ label: `HK2 ${y}-${y + 1}`, semester: '2', schoolYear: String(y) });
    }
    if (y !== activeStartYear || activeSem !== '1') {
      list.push({ label: `HK1 ${y}-${y + 1}`, semester: '1', schoolYear: String(y) });
    }
  }
  return list;
};

export default function ExamsScreen({ user }) {
  const [examData, setExamData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [semesters, setSemesters] = useState(getDynamicSemesters());
  const [selectedSemIdx, setSelectedSemIdx] = useState(() => {
    const dyn = getDynamicSemesters();
    const curIdx = dyn.findIndex(s => s.current);
    return curIdx >= 0 ? curIdx : 0;
  });

  const currentSem = semesters[selectedSemIdx] || semesters[0] || { label: 'Học kỳ' };

  // Tải dữ liệu lịch thi
  const loadData = async (forceSync = false, semIdx = null, customSemList = null) => {
    const list = customSemList || semesters;
    const idx = semIdx !== null ? semIdx : selectedSemIdx;
    const sem = list[idx] || list[0];
    if (!sem) return;
    try {
      const res = await getExams(forceSync, sem.semester, sem.schoolYear, 'ALL');
      if (res.success && Array.isArray(res.data)) {
        setExamData(res.data);
        // Tự động lên lịch nhắc nhở 30 phút và 15 phút ra màn hình khóa có chuông
        scheduleExamReminders(res.data);
      } else {
        setExamData([]);
      }
    } catch (err) {
      console.warn('Lỗi tải lịch thi sinh viên:', err.message);
      setExamData([]);
    }
  };

  // Khởi tạo: Tải danh mục học kỳ và LUÔN chọn kỳ hiện tại (current: true)
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        const res = await getScheduleSemesters();
        let semList = getDynamicSemesters();
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          semList = res.data;
          if (isMounted) setSemesters(semList);
        }

        const currentIdx = semList.findIndex(s => s.current);
        const targetIdx = currentIdx >= 0 ? currentIdx : 0;
        if (isMounted) setSelectedSemIdx(targetIdx);

        await loadData(false, targetIdx, semList);
      } catch (err) {
        console.warn('Lỗi tải danh mục học kỳ lịch thi:', err.message);
        await loadData(false, 0);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    init();
    return () => { isMounted = false; };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const semRes = await getScheduleSemesters();
    let currentList = semesters;
    if (semRes.success && Array.isArray(semRes.data) && semRes.data.length > 0) {
      currentList = semRes.data;
      setSemesters(currentList);
    }
    await loadData(true, selectedSemIdx, currentList);
    setRefreshing(false);
  }, [selectedSemIdx, semesters]);

  const onSelectSemester = async (idx) => {
    if (idx !== selectedSemIdx) {
      setSelectedSemIdx(idx);
      setLoading(true);
      await loadData(false, idx);
      setLoading(false);
    }
  };

  // Tính countdown và ngày thi
  const parseExamDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const dmy = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) {
      return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    }
    const ymd = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymd) {
      return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    }
    return null;
  };

  const getCountdown = (dateStr) => {
    const examDate = parseExamDate(dateStr);
    if (!examDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
  };

  const getCountdownBadgeStyle = (days) => {
    if (days === null) return { bg: Colors.borderLight, text: Colors.textMuted, label: 'Chưa rõ' };
    if (days < 0) return { bg: '#F3F4F6', text: Colors.textMuted, label: 'Đã thi' };
    if (days === 0) return { bg: '#FEE2E2', text: Colors.danger, label: '🚨 HÔM NAY' };
    if (days <= 3) return { bg: '#FEE2E2', text: Colors.danger, label: `Còn ${days} ngày` };
    if (days <= 7) return { bg: '#FEF3C7', text: Colors.warning, label: `Còn ${days} ngày` };
    return { bg: Colors.primaryBg, text: Colors.primary, label: `Còn ${days} ngày` };
  };

  const getDayOfWeekText = (dateStr) => {
    const examDate = parseExamDate(dateStr);
    if (!examDate) return '';
    return DAY_NAMES[examDate.getDay()] || '';
  };

  // Lọc tìm kiếm
  const filteredExams = useMemo(() => {
    if (!Array.isArray(examData)) return [];
    if (!searchQuery.trim()) return examData;
    const q = searchQuery.toLowerCase().trim();
    return examData.filter(item => {
      if (!item) return false;
      const name = (item.courseName || '').toLowerCase();
      const code = (item.courseCode || '').toLowerCase();
      const room = (item.room || '').toLowerCase();
      const sbd = (item.seatNumber || '').toLowerCase();
      return name.includes(q) || code.includes(q) || room.includes(q) || sbd.includes(q);
    });
  }, [examData, searchQuery]);

  // Môn thi gần nhất (Upcoming Hero Card)
  const nextExam = useMemo(() => {
    if (!examData || !Array.isArray(examData) || examData.length === 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = examData
      .filter(item => item && item.examDate)
      .map(item => ({ item, date: parseExamDate(item.examDate) }))
      .filter(x => x.date && x.date >= today)
      .sort((a, b) => a.date - b.date);

    return upcoming.length > 0 ? upcoming[0].item : null;
  }, [examData]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let passed = 0;
    let upcoming = 0;

    if (Array.isArray(examData)) {
      examData.forEach(item => {
        if (!item || !item.examDate) return;
        const d = parseExamDate(item.examDate);
        if (d) {
          if (d < today) passed++;
          else upcoming++;
        }
      });
    }

    return { total: examData ? examData.length : 0, passed, upcoming };
  }, [examData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải lịch thi từ CSDL...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Lịch Thi</Text>
          <Text style={styles.headerSubtitle}>{currentSem.label} • Xếp lịch đào tạo</Text>
        </View>
        <TouchableOpacity
          style={styles.syncBtn}
          onPress={onRefresh}
          disabled={refreshing}
          activeOpacity={0.7}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={Colors.textOnPrimary} />
          ) : (
            <Ionicons name="sync-outline" size={18} color={Colors.textOnPrimary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Semester Picker */}
      <View style={styles.semPickerWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.semScroll}>
          {semesters.map((sem, idx) => {
            const isSelected = idx === selectedSemIdx;
            return (
              <TouchableOpacity
                key={`sem_${idx}_${sem.semester}_${sem.schoolYear}`}
                style={[styles.semChip, isSelected && styles.semChipActive]}
                onPress={() => onSelectSemester(idx)}
                activeOpacity={0.7}
              >
                <Text style={[styles.semChipText, isSelected && styles.semChipTextActive]}>
                  {sem.label}
                </Text>
                {sem.current && (
                  <View style={[styles.currentDot, isSelected && styles.currentDotActive]} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search Input */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm môn học, mã môn, phòng thi, SBD..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={filteredExams}
        keyExtractor={(item, index) => item.id || `${item.courseCode}_${item.examDate}_${index}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        ListHeaderComponent={
          <>
            {/* Hero Card: Môn thi gần nhất */}
            {nextExam && !searchQuery ? (
              <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                  <View style={styles.heroTagWrap}>
                    <Ionicons name="flame" size={14} color="#EF4444" />
                    <Text style={styles.heroTagText}>MÔN THI TIẾP THEO</Text>
                  </View>
                  {(() => {
                    const cd = getCountdown(nextExam.examDate);
                    const b = getCountdownBadgeStyle(cd);
                    return (
                      <View style={[styles.heroCountdownBadge, { backgroundColor: b.bg }]}>
                        <Text style={[styles.heroCountdownText, { color: b.text }]}>{b.label}</Text>
                      </View>
                    );
                  })()}
                </View>

                <Text style={styles.heroCourseName} numberOfLines={2}>
                  {nextExam.courseName}
                </Text>
                {nextExam.courseCode ? (
                  <Text style={styles.heroCourseCode}>Mã HP: {nextExam.courseCode}</Text>
                ) : null}

                <View style={styles.heroGrid}>
                  <View style={styles.heroGridItem}>
                    <Ionicons name="calendar" size={15} color="#3B82F6" />
                    <Text style={styles.heroGridText}>
                      {getDayOfWeekText(nextExam.examDate)}, {nextExam.examDate}
                    </Text>
                  </View>
                  <View style={styles.heroGridItem}>
                    <Ionicons name="time" size={15} color="#F59E0B" />
                    <Text style={styles.heroGridText}>
                      {nextExam.examTime || nextExam.examShift || 'Chưa xếp giờ'}
                    </Text>
                  </View>
                  <View style={styles.heroGridItem}>
                    <Ionicons name="location" size={15} color="#EC4899" />
                    <Text style={styles.heroGridText}>
                      Phòng: {nextExam.room || 'Chưa xếp'}
                    </Text>
                  </View>
                  {nextExam.seatNumber ? (
                    <View style={styles.heroGridItem}>
                      <Ionicons name="id-card" size={15} color="#10B981" />
                      <Text style={[styles.heroGridText, { fontWeight: '700', color: '#10B981' }]}>
                        SBD: {nextExam.seatNumber}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Banner nhắc nhở có chuông */}
                <View style={styles.heroNotifBanner}>
                  <Ionicons name="notifications" size={14} color="#2563EB" />
                  <Text style={styles.heroNotifBannerText}>
                    Đã kích hoạt chuông & thông báo màn hình khóa trước 30m & 15m
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Quick Stats */}
            {examData.length > 0 ? (
              <View style={styles.statsBar}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{stats.total}</Text>
                  <Text style={styles.statLabel}>Môn thi</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: Colors.primary }]}>{stats.upcoming}</Text>
                  <Text style={styles.statLabel}>Sắp thi</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: Colors.textMuted }]}>{stats.passed}</Text>
                  <Text style={styles.statLabel}>Đã thi</Text>
                </View>
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => {
          const countdown = getCountdown(item.examDate);
          const badgeStyle = getCountdownBadgeStyle(countdown);
          const dayOfWeek = getDayOfWeekText(item.examDate);

          return (
            <View style={styles.examCard}>
              {/* Header card */}
              <View style={styles.examCardHeader}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.examCourseName}>{item.courseName}</Text>
                  <View style={styles.examMetaRow}>
                    {item.courseCode ? (
                      <Text style={styles.examMetaCode}>Mã: {item.courseCode}</Text>
                    ) : null}
                    {item.credits ? (
                      <Text style={styles.examMetaCredits}> • {item.credits} tín chỉ</Text>
                    ) : null}
                    {item.examAttempt && item.examAttempt > 1 ? (
                      <View style={styles.retakeBadge}>
                        <Text style={styles.retakeBadgeText}>Thi lần {item.examAttempt}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={[styles.countdownBadge, { backgroundColor: badgeStyle.bg }]}>
                  <Text style={[styles.countdownText, { color: badgeStyle.text }]}>
                    {badgeStyle.label}
                  </Text>
                </View>
              </View>

              {/* Chi tiết lịch thi */}
              <View style={styles.examCardBody}>
                <View style={styles.infoRow}>
                  <View style={[styles.iconWrap, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="calendar-outline" size={16} color="#3B82F6" />
                  </View>
                  <Text style={styles.infoLabel}>Ngày thi:</Text>
                  <Text style={styles.infoValue}>
                    {dayOfWeek ? `${dayOfWeek}, ` : ''}{item.examDate || 'Chưa xếp'}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <View style={[styles.iconWrap, { backgroundColor: '#FEF3C7' }]}>
                    <Ionicons name="time-outline" size={16} color="#F59E0B" />
                  </View>
                  <Text style={styles.infoLabel}>Ca / Giờ:</Text>
                  <Text style={styles.infoValue}>
                    {item.examTime || item.examShift || 'Chưa xếp'}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <View style={[styles.iconWrap, { backgroundColor: '#FCE7F3' }]}>
                    <Ionicons name="location-outline" size={16} color="#EC4899" />
                  </View>
                  <Text style={styles.infoLabel}>Phòng thi:</Text>
                  <Text style={[styles.infoValue, { fontWeight: '700' }]}>
                    {item.room || 'Chưa xếp'}
                  </Text>
                </View>

                {item.seatNumber ? (
                  <View style={styles.infoRow}>
                    <View style={[styles.iconWrap, { backgroundColor: '#D1FAE5' }]}>
                      <Ionicons name="id-card-outline" size={16} color="#10B981" />
                    </View>
                    <Text style={styles.infoLabel}>Số báo danh:</Text>
                    <View style={styles.sbdBadge}>
                      <Text style={styles.sbdText}>{item.seatNumber}</Text>
                    </View>
                  </View>
                ) : null}

                {item.proctors ? (
                  <View style={styles.infoRow}>
                    <View style={[styles.iconWrap, { backgroundColor: '#EDE9FE' }]}>
                      <Ionicons name="people-outline" size={16} color="#8B5CF6" />
                    </View>
                    <Text style={styles.infoLabel}>Giám thị:</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>{item.proctors}</Text>
                  </View>
                ) : null}
              </View>

              {/* Footer card */}
              <View style={styles.examCardFooter}>
                <View style={styles.formatChip}>
                  <Ionicons name="document-text-outline" size={12} color={Colors.primary} />
                  <Text style={styles.formatChipText}>{item.examFormat || 'Thi viết'}</Text>
                </View>
                {item.examBatch ? (
                  <View style={[styles.formatChip, { backgroundColor: '#F3F4F6' }]}>
                    <Text style={[styles.formatChipText, { color: Colors.textSecondary }]}>
                      {item.examBatch}
                    </Text>
                  </View>
                ) : null}
                <View style={{ flex: 1 }} />
                <View style={styles.alarmIndicator}>
                  <Ionicons name="alarm" size={13} color="#10B981" />
                  <Text style={styles.alarmText}>Nhắc 30m & 15m</Text>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-outline" size={60} color={Colors.borderLight} />
            <Text style={styles.emptyTitle}>Chưa có lịch thi!</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? 'Không tìm thấy môn thi phù hợp với từ khóa.'
                : `Học kỳ ${currentSem.label} hiện chưa có môn thi nào được xếp.`}
            </Text>
            <TouchableOpacity style={styles.emptySyncBtn} onPress={onRefresh} activeOpacity={0.8}>
              <Ionicons name="sync" size={16} color={Colors.textOnPrimary} style={{ marginRight: 6 }} />
              <Text style={styles.emptySyncBtnText}>Đồng bộ CSDL Nhà trường</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontSize: 14, fontWeight: '500' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  syncBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4,
  },
  semPickerWrap: { backgroundColor: Colors.surface, paddingBottom: 10 },
  semScroll: { paddingHorizontal: 16, gap: 8 },
  semChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent',
  },
  semChipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  semChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  semChipTextActive: { color: Colors.primary, fontWeight: '700' },
  currentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.textMuted, marginLeft: 6 },
  currentDotActive: { backgroundColor: Colors.primary },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC',
    borderRadius: 12, paddingHorizontal: 12, height: 42, borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  listContent: { padding: 16, paddingBottom: 32 },
  heroCard: {
    backgroundColor: '#1E293B', borderRadius: 20, padding: 20, marginBottom: 16,
    elevation: 6, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heroTagWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  heroTagText: { fontSize: 11, fontWeight: '800', color: '#EF4444', marginLeft: 4, letterSpacing: 0.5 },
  heroCountdownBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  heroCountdownText: { fontSize: 11, fontWeight: '700' },
  heroCourseName: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', lineHeight: 24, marginBottom: 4 },
  heroCourseCode: { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginBottom: 14 },
  heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  heroGridItem: { flexDirection: 'row', alignItems: 'center', width: '47%' },
  heroGridText: { fontSize: 13, color: '#E2E8F0', marginLeft: 6, fontWeight: '500' },
  heroNotifBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(37, 99, 235, 0.15)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#3B82F6',
  },
  heroNotifBannerText: { fontSize: 11, color: '#93C5FD', marginLeft: 8, fontWeight: '600', flex: 1 },
  statsBar: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, height: 24, backgroundColor: '#E2E8F0' },
  examCard: {
    backgroundColor: Colors.surface, borderRadius: 18, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#E2E8F0', elevation: 2, shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6,
  },
  examCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  examCourseName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, lineHeight: 22 },
  examMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  examMetaCode: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  examMetaCredits: { fontSize: 12, color: Colors.textSecondary },
  retakeBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8 },
  retakeBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.danger },
  countdownBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  countdownText: { fontSize: 11, fontWeight: '700' },
  examCardBody: { gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  infoLabel: { fontSize: 13, color: Colors.textSecondary, width: 80, fontWeight: '500' },
  infoValue: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600', flex: 1 },
  sbdBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sbdText: { fontSize: 13, fontWeight: '800', color: '#065F46' },
  examCardFooter: { flexDirection: 'row', alignItems: 'center', paddingTop: 10 },
  formatChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryBg,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 8,
  },
  formatChipText: { fontSize: 11, fontWeight: '600', color: Colors.primary, marginLeft: 4 },
  alarmIndicator: { flexDirection: 'row', alignItems: 'center' },
  alarmText: { fontSize: 11, fontWeight: '600', color: '#10B981', marginLeft: 4 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginTop: 16 },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  emptySyncBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 20,
  },
  emptySyncBtnText: { color: Colors.textOnPrimary, fontSize: 14, fontWeight: '700' },
});
