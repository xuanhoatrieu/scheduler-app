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
  TouchableOpacity,
  View,
} from 'react-native';
import { getSchedule } from '../services/api';
import { Colors, getDayColor } from '../theme/colors';

const DAY_FULL = {
  2: 'Thứ Hai', 3: 'Thứ Ba', 4: 'Thứ Tư', 5: 'Thứ Năm',
  6: 'Thứ Sáu', 7: 'Thứ Bảy', 8: 'Chủ Nhật',
};
const DAY_SHORT = {
  2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T7', 8: 'CN',
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
 * Xác định trạng thái giai đoạn so với ngày hiện tại
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
 * Format date range ngắn gọn: "02/03 → 12/04"
 */
const formatDateRange = (studyTime) => {
  if (!studyTime) return '';
  const parts = studyTime.split('-').map(s => s.trim());
  if (parts.length < 2) return studyTime;
  const short = (str) => {
    const m = str.match(/(\d{1,2})\/(\d{1,2})/);
    return m ? `${m[1]}/${m[2]}` : str;
  };
  return `${short(parts[0])} → ${short(parts[1])}`;
};

/**
 * Quy đổi tiết học sang giờ học thực tế của trường TUAF
 */
const getPeriodTimeStr = (periodText) => {
  if (!periodText) return '';
  const parts = periodText.split('-');
  const startPeriod = parseInt(parts[0]) || 1;
  const endPeriod = parseInt(parts[1]) || startPeriod;

  const startTimes = {
    1: '07:00', 2: '07:55', 3: '08:50', 4: '09:55', 5: '10:50',
    6: '13:00', 7: '13:55', 8: '14:50', 9: '15:55', 10: '16:50'
  };

  const endTimes = {
    1: '07:50', 2: '08:45', 3: '09:40', 4: '10:45', 5: '11:40',
    6: '13:50', 7: '14:45', 8: '15:40', 9: '16:45', 10: '17:40'
  };

  const startStr = startTimes[startPeriod] || '07:00';
  const endStr = endTimes[endPeriod] || '11:40';

  return `${startStr} - ${endStr} (Tiết ${periodText})`;
};

export default function ScheduleScreen({ user }) {
  const [scheduleData, setScheduleData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Semester picker
  const semesters = [
    { label: 'HK2 2025-2026', semester: '2', schoolYear: '2025', current: true },
    { label: 'HK1 2025-2026', semester: '1', schoolYear: '2025' },
    { label: 'HK2 2024-2025', semester: '2', schoolYear: '2024' },
    { label: 'HK1 2024-2025', semester: '1', schoolYear: '2024' },
    { label: 'HK2 2023-2024', semester: '2', schoolYear: '2023' },
    { label: 'HK1 2023-2024', semester: '1', schoolYear: '2023' },
  ];
  const [selectedSemIdx, setSelectedSemIdx] = useState(0);
  const currentSem = semesters[selectedSemIdx];

  const loadData = async (forceSync = false, semIdx = null) => {
    const sem = semesters[semIdx ?? selectedSemIdx];
    let res = await getSchedule(forceSync, sem.semester, sem.schoolYear);
    
    // Nếu không Force Sync nhưng DB trống trơn (res.data rỗng) -> tự động kích hoạt Force Sync để cào dữ liệu từ portal trường
    if (res.success && (!res.data || res.data.length === 0) && !forceSync) {
      console.log(`[Schedule] DB trống cho kỳ ${sem.label} -> Tự động kích hoạt Force Sync...`);
      res = await getSchedule(true, sem.semester, sem.schoolYear);
    }
    
    if (res.success) setScheduleData(res.data || []);
    else setScheduleData([]);
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [selectedSemIdx]);

  const onSelectSemester = async (idx) => {
    if (idx === selectedSemIdx) return;
    setSelectedSemIdx(idx);
    setLoading(true);
    await loadData(false, idx);
    setLoading(false);
  };

  /**
   * Nhóm lịch theo ngày → theo môn → theo giai đoạn
   */
  const groupedData = useMemo(() => {
    const byDay = {};
    for (const item of scheduleData) {
      const day = item.dayOfWeek;
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(item);
    }

    const result = [];
    const sortedDays = Object.keys(byDay).sort((a, b) => parseInt(a) - parseInt(b));

    for (const day of sortedDays) {
      const items = byDay[day];
      const byCourse = {};
      for (const item of items) {
        const key = item.courseName;
        if (!byCourse[key]) byCourse[key] = [];
        byCourse[key].push(item);
      }

      const courses = [];
      for (const [courseName, courseItems] of Object.entries(byCourse)) {
        const byPeriod = {};
        for (const item of courseItems) {
          const period = item.studyTime || 'unknown';
          if (!byPeriod[period]) byPeriod[period] = [];
          byPeriod[period].push(item);
        }

        const periods = Object.entries(byPeriod).map(([studyTime, items]) => ({
          studyTime,
          status: getPeriodStatus(studyTime),
          dateRange: formatDateRange(studyTime),
          items,
        }));

        const order = { active: 0, upcoming: 1, past: 2, unknown: 3 };
        periods.sort((a, b) => order[a.status] - order[b.status]);

        courses.push({ courseName, periods, credits: courseItems[0]?.credits });
      }

      result.push({ day: parseInt(day), courses });
    }

    return result;
  }, [scheduleData]);

  const activeSessions = scheduleData.filter(s => getPeriodStatus(s.studyTime) === 'active').length;
  const totalCourses = [...new Set(scheduleData.map(s => s.courseName))].length;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải lịch học...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Lịch Học</Text>
          <Text style={styles.headerSubtitle}>{currentSem.label}</Text>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color={Colors.textOnPrimary} />
          ) : (
            <Ionicons name="sync-outline" size={18} color={Colors.textOnPrimary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Semester Picker */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.semPickerWrap}
      >
        {semesters.map((sem, idx) => (
          <TouchableOpacity
            key={idx}
            style={[
              styles.semChip,
              idx === selectedSemIdx && styles.semChipActive,
            ]}
            onPress={() => onSelectSemester(idx)}
            activeOpacity={0.7}
          >
            {sem.current && (
              <View style={[styles.semChipDot, idx === selectedSemIdx && styles.semChipDotActive]} />
            )}
            <Text style={[
              styles.semChipText,
              idx === selectedSemIdx && styles.semChipTextActive,
            ]}>
              {sem.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{activeSessions}</Text>
          <Text style={styles.statLabel}>Đang học</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalCourses}</Text>
          <Text style={styles.statLabel}>Môn học</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{groupedData.length}</Text>
          <Text style={styles.statLabel}>Ngày/tuần</Text>
        </View>
      </View>

      {/* Schedule */}
      <FlatList
        data={groupedData}
        keyExtractor={(item) => String(item.day)}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        renderItem={({ item: dayGroup }) => {
          const dayColor = getDayColor(dayGroup.day);
          const dayName = DAY_FULL[dayGroup.day];
          return (
            <View style={styles.dayGroup}>
              {/* Day Header */}
              <View style={styles.dayHeader}>
                <View style={[styles.dayIndicator, { backgroundColor: dayColor }]} />
                <Text style={[styles.dayName, { color: dayColor }]}>{dayName}</Text>
                <View style={[styles.dayCountBadge, { backgroundColor: dayColor + '15' }]}>
                  <Text style={[styles.dayCount, { color: dayColor }]}>{dayGroup.courses.length} môn</Text>
                </View>
              </View>

              {/* Courses */}
              {dayGroup.courses.map((course, cIdx) => (
                <CourseCard key={cIdx} course={course} dayColor={dayColor} />
              ))}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-outline" size={64} color={Colors.borderLight} />
            <Text style={styles.emptyText}>Chưa có dữ liệu lịch học!</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={onRefresh}>
              <Text style={styles.emptyBtnText}>Đồng bộ ngay</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

/**
 * CourseCard: hiển thị 1 môn với nhiều giai đoạn
 * Tích hợp chức năng mở rộng/thu gọn (Expandable/Collapsible) thông minh
 */
function CourseCard({ course, dayColor }) {
  const { courseName, periods, credits } = course;
  const hasActive = periods.some(p => p.status === 'active');
  
  // Lưu trạng thái mở rộng của từng giai đoạn (mặc định: active mở, past/upcoming đóng)
  const [expandedPeriods, setExpandedPeriods] = useState({});

  const togglePeriod = (pIdx) => {
    setExpandedPeriods(prev => ({ ...prev, [pIdx]: !prev[pIdx] }));
  };

  return (
    <View style={styles.courseCard}>
      <View style={[styles.cardAccent, { backgroundColor: dayColor }]} />
      <View style={styles.cardBody}>
        {/* Title */}
        <View style={styles.cardTitleRow}>
          <Text style={styles.courseName} numberOfLines={2}>{courseName}</Text>
          {credits ? (
            <View style={[styles.creditBadge, { backgroundColor: dayColor + '15' }]}>
              <Text style={[styles.creditText, { color: dayColor }]}>{credits} TC</Text>
            </View>
          ) : null}
        </View>

        {/* Periods */}
        {periods.map((period, pIdx) => {
          const isActive = period.status === 'active';
          const isPast = period.status === 'past';
          const isUpcoming = period.status === 'upcoming';

          // Mặc định: active thì mở (true), past và upcoming thì đóng (false)
          const isExpanded = expandedPeriods[pIdx] !== undefined 
            ? expandedPeriods[pIdx] 
            : isActive;

          if (isExpanded) {
            // === ACTIVE/EXPANDED: Full detail ===
            const badgeColor = isActive ? Colors.success : (isPast ? Colors.textMuted : Colors.accentBlue);
            const badgeText = isActive ? 'Đang học' : (isPast ? 'Giai đoạn này đã kết thúc' : 'Chưa bắt đầu');
            const dotColor = isActive ? Colors.success : (isPast ? Colors.border : Colors.accentBlue);

            return (
              <TouchableOpacity 
                key={pIdx} 
                style={[
                  styles.activePeriod, 
                  isPast && styles.pastPeriodFull,
                  isUpcoming && styles.upcomingPeriodFull,
                  { borderLeftWidth: 3, borderLeftColor: badgeColor }
                ]}
                onPress={() => togglePeriod(pIdx)}
                activeOpacity={0.8}
              >
                <View style={styles.activeBadgeRow}>
                  <View style={styles.activeBadge}>
                    <View style={[styles.activeDot, { backgroundColor: dotColor }]} />
                    <Text style={[styles.activeBadgeText, { color: badgeColor }]}>{badgeText}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.activeDateRange}>{period.dateRange}</Text>
                    <Ionicons name="chevron-up" size={14} color={Colors.textMuted} />
                  </View>
                </View>

                {period.items.map((item, iIdx) => (
                  <View key={iIdx} style={{ marginBottom: iIdx < period.items.length - 1 ? 8 : 0 }}>
                    <View style={styles.activeItemTags}>
                      {item.periodText ? (
                        <View style={[styles.infoTag, { backgroundColor: Colors.primary + '08', borderColor: Colors.primary + '20', borderWidth: 0.5 }]}>
                          <Ionicons name="time-outline" size={12} color={Colors.primary} />
                          <Text style={[styles.infoTagText, { color: Colors.primary, fontWeight: '700' }]}>
                            {getPeriodTimeStr(item.periodText)}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.infoTag}>
                        <Ionicons name="location-outline" size={12} color={Colors.accentPink} />
                        <Text style={styles.infoTagText}>{item.room || 'Chưa xếp'}</Text>
                      </View>
                    </View>
                    
                    <View style={[styles.activeItemTags, { marginTop: 6 }]}>
                      {item.teacherName ? (
                        <View style={styles.infoTag}>
                          <Ionicons name="person-outline" size={12} color={Colors.accentPurple} />
                          <Text style={styles.infoTagText}>{item.teacherName}</Text>
                        </View>
                      ) : null}
                      {item.classCode ? (
                        <View style={styles.infoTag}>
                          <Ionicons name="document-text-outline" size={12} color={Colors.textMuted} />
                          <Text style={styles.infoTagText} numberOfLines={1}>{item.classCode}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))}
              </TouchableOpacity>
            );
          } else {
            // === COLLAPSED: Thu nhỏ 1 dòng ===
            const statusIcon = isPast ? 'checkmark-circle-outline' : 'time-outline';
            const statusColor = isPast ? Colors.textMuted : Colors.accentBlue;
            const statusLabel = isPast ? 'Giai đoạn này đã kết thúc' : 'Sắp tới';
            const rooms = [...new Set(period.items.map(i => i.room).filter(Boolean))].join(', ');
            const periodsText = [...new Set(period.items.map(i => i.periodText).filter(Boolean))].join(', ');

            return (
              <TouchableOpacity 
                key={pIdx} 
                style={[styles.collapsedPeriod, isPast && styles.collapsedPast]}
                onPress={() => togglePeriod(pIdx)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                  <Ionicons name={statusIcon} size={14} color={statusColor} />
                  <Text style={[styles.collapsedLabel, { color: statusColor }]} numberOfLines={1}>
                    {statusLabel}
                  </Text>
                  <Text style={styles.collapsedDate}>{period.dateRange}</Text>
                  {periodsText ? <Text style={styles.collapsedRoom} numberOfLines={1}>• Tiết {periodsText}</Text> : null}
                  {rooms ? <Text style={styles.collapsedRoom} numberOfLines={1}>• {rooms}</Text> : null}
                </View>
                <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          }
        })}

        {/* Nếu tất cả đều past hoặc upcoming (không có active) → hiện info từ period đầu tiên */}
        {!hasActive && periods.length > 0 && (
          <View style={styles.noActiveBanner}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.noActiveText}>
              {periods[0].status === 'upcoming' ? 'Môn này chưa bắt đầu' : 'Môn này đã kết thúc'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontSize: 14 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  syncBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },

  // Semester Picker
  semPickerWrap: {
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  semChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  semChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    elevation: 2, shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  semChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  semChipTextActive: { color: Colors.textOnPrimary },
  semChipDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.success, marginRight: 6,
  },
  semChipDotActive: { backgroundColor: Colors.textOnPrimary },

  statsBar: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    paddingVertical: 14, paddingHorizontal: 20, marginBottom: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.borderLight, marginVertical: 4 },

  dayGroup: { marginTop: 16, paddingHorizontal: 16 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dayIndicator: { width: 4, height: 20, borderRadius: 2, marginRight: 10 },
  dayName: { fontSize: 16, fontWeight: '700', flex: 1 },
  dayCountBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  dayCount: { fontSize: 11, fontWeight: '700' },

  // Course Card
  courseCard: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 14,
    marginBottom: 10, overflow: 'hidden',
    elevation: 2, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6,
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  courseName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, lineHeight: 20, flex: 1, marginRight: 8 },
  creditBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  creditText: { fontSize: 11, fontWeight: '700' },

  // Active Period — full detail
  activePeriod: {
    backgroundColor: Colors.primaryBg, borderRadius: 10, padding: 10, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.primaryMuted + '30',
  },
  pastPeriodFull: {
    backgroundColor: Colors.borderLight + '20',
    borderColor: Colors.borderLight + '60',
  },
  upcomingPeriodFull: {
    backgroundColor: Colors.accentBlue + '08',
    borderColor: Colors.accentBlue + '20',
  },
  activeBadgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  activeBadgeText: { fontSize: 11, fontWeight: '700' },
  activeDateRange: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  activeItemTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  infoTag: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: 8, gap: 4,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  infoTagText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500', maxWidth: 160 },

  // Collapsed Period — 1 dòng nhỏ
  collapsedPeriod: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, paddingHorizontal: 6,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
    marginTop: 4,
  },
  collapsedPast: { opacity: 0.5 },
  collapsedLabel: { fontSize: 11, fontWeight: '700', flexShrink: 0 },
  collapsedDate: { fontSize: 11, color: Colors.textMuted, marginLeft: 4, flexShrink: 0 },
  collapsedRoom: { fontSize: 11, color: Colors.textMuted, marginLeft: 4, flex: 1 },

  // No active banner
  noActiveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4,
    paddingHorizontal: 4,
  },
  noActiveText: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },

  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 16 },
  emptyBtn: { marginTop: 16, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { color: Colors.textOnPrimary, fontWeight: '700', fontSize: 14 },
});
