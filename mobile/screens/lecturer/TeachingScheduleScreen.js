import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getSchedule, getScheduleSemesters } from '../../services/api';
import { Colors, getDayColor } from '../../theme/colors';
import StudentAttendanceScreen from './StudentAttendanceScreen';

const DAY_NAMES = {
  0: 'Chưa xếp thứ / Khác',
  2: 'Thứ 2',
  3: 'Thứ 3',
  4: 'Thứ 4',
  5: 'Thứ 5',
  6: 'Thứ 6',
  7: 'Thứ 7',
  8: 'Chủ Nhật',
};

/**
 * Quy đổi tiết học sang khung giờ thực tế tại TUAF
 */
const getPeriodTimeStr = (periodText) => {
  if (!periodText) return 'Chưa xếp tiết';
  if (periodText.includes('Chưa xếp')) return periodText;

  const m = periodText.match(/(\d+)(?:\s*-\s*(\d+))?/);
  if (!m) return periodText;
  const startPeriod = parseInt(m[1], 10) || 1;
  const endPeriod = parseInt(m[2], 10) || startPeriod;

  const startTimes = {
    1: '07:00', 2: '07:55', 3: '08:50', 4: '09:55', 5: '10:50',
    6: '13:00', 7: '13:55', 8: '14:50', 9: '15:55', 10: '16:50',
  };
  const endTimes = {
    1: '07:50', 2: '08:45', 3: '09:40', 4: '10:45', 5: '11:40',
    6: '13:50', 7: '14:45', 8: '15:40', 9: '16:45', 10: '17:40',
  };

  const startStr = startTimes[startPeriod] || '';
  const endStr = endTimes[endPeriod] || '';
  if (startStr && endStr) {
    return `${startStr} - ${endStr} (${periodText})`;
  }
  return periodText;
};

/**
 * Xác định trạng thái của giai đoạn học:
 * - 'past': Đã kết thúc (trước ngày hôm nay)
 * - 'active': Đang hiện hành (hôm nay nằm trong khoảng học)
 * - 'upcoming': Chưa diễn ra (sau ngày hôm nay)
 */
const getTeachingPeriodStatus = (studyTime, schoolYear) => {
  if (!studyTime || typeof studyTime !== 'string') return 'active';

  let startYear = new Date().getFullYear();
  let endYear = startYear;
  if (schoolYear && typeof schoolYear === 'string') {
    const yearMatches = schoolYear.match(/(\d{4})\s*-\s*(\d{4})/);
    if (yearMatches) {
      startYear = parseInt(yearMatches[1], 10);
      endYear = parseInt(yearMatches[2], 10);
    }
  }

  // Format DD/MM/YYYY - DD/MM/YYYY
  const fullMatch = studyTime.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fullMatch) {
    const startDate = new Date(parseInt(fullMatch[3], 10), parseInt(fullMatch[2], 10) - 1, parseInt(fullMatch[1], 10), 0, 0, 0);
    const endDate = new Date(parseInt(fullMatch[6], 10), parseInt(fullMatch[5], 10) - 1, parseInt(fullMatch[4], 10), 23, 59, 59);
    const now = new Date();
    if (endDate < now) return 'past';
    if (startDate > now) return 'upcoming';
    return 'active';
  }

  // Format DD/MM - DD/MM
  const shortMatch = studyTime.match(/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/);
  if (shortMatch) {
    const startDay = parseInt(shortMatch[1], 10);
    const startMonth = parseInt(shortMatch[2], 10);
    const endDay = parseInt(shortMatch[3], 10);
    const endMonth = parseInt(shortMatch[4], 10);

    let sYear = (startMonth >= 8) ? startYear : endYear;
    let eYear = (endMonth >= 8 && endMonth >= startMonth) ? startYear : endYear;
    if (endMonth < startMonth) {
      eYear = sYear + 1;
    }

    const startDate = new Date(sYear, startMonth - 1, startDay, 0, 0, 0);
    const endDate = new Date(eYear, endMonth - 1, endDay, 23, 59, 59);
    const now = new Date();
    if (endDate < now) return 'past';
    if (startDate > now) return 'upcoming';
    return 'active';
  }

  return 'active';
};

export default function TeachingScheduleScreen({ user, onSwitchRole }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attendanceModalSchedule, setAttendanceModalSchedule] = useState(null);

  const [semesters, setSemesters] = useState([]);
  const [selectedSemIdx, setSelectedSemIdx] = useState(0);
  const [expandedCards, setExpandedCards] = useState({});

  const toggleCard = (key, defaultExpanded) => {
    setExpandedCards(prev => {
      const current = prev[key] !== undefined ? prev[key] : defaultExpanded;
      return { ...prev, [key]: !current };
    });
  };

  const loadData = async (forceSync = false, semIdx = null, customSemesters = null) => {
    const list = customSemesters || semesters;
    const sem = list[semIdx ?? selectedSemIdx];
    const semParam = sem ? sem.semester : null;
    const yearParam = sem ? sem.schoolYear : null;

    const res = await getSchedule(forceSync, semParam, yearParam);
    if (res.success) {
      setSchedules(res.data || []);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        const semRes = await getScheduleSemesters();
        let semList = [];
        if (semRes.success && semRes.data && semRes.data.length > 0) {
          semList = semRes.data;
          if (isMounted) setSemesters(semList);
        }

        const currentIdx = semList.findIndex(s => s.current);
        const targetIdx = currentIdx >= 0 ? currentIdx : 0;
        if (isMounted) setSelectedSemIdx(targetIdx);

        await loadData(false, targetIdx, semList);
      } catch (err) {
        console.warn('Lỗi tải học kỳ giảng dạy:', err);
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
    setExpandedCards({});
    await loadData(true);
    setRefreshing(false);
  }, [selectedSemIdx, semesters]);

  const onSelectSemester = async (idx) => {
    if (idx === selectedSemIdx) return;
    setSelectedSemIdx(idx);
    setExpandedCards({});
    setLoading(true);
    await loadData(false, idx);
    setLoading(false);
  };

  // Nhóm lịch dạy theo thứ trong tuần
  const groupByDay = () => {
    const groups = {};
    for (const s of schedules) {
      const day = s.dayOfWeek != null ? s.dayOfWeek : 2;
      if (!groups[day]) groups[day] = [];
      groups[day].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      // Đưa '0' (chưa xếp) về cuối danh sách
      if (a === '0') return 1;
      if (b === '0') return -1;
      return parseInt(a, 10) - parseInt(b, 10);
    });
  };

  // Thống kê nhanh: Đếm theo môn học/lớp học phần duy nhất (tránh nhân bản theo ca/giai đoạn)
  const uniqueClassMap = new Map();
  for (const s of schedules) {
    const key = s.idLopTc ? String(s.idLopTc) : `${s.courseName || ''}_${s.classCode || ''}`;
    if (!uniqueClassMap.has(key)) {
      uniqueClassMap.set(key, s);
    }
  }

  const totalClasses = uniqueClassMap.size;
  const totalCredits = Array.from(uniqueClassMap.values()).reduce(
    (sum, s) => sum + (Number(s.credits) || 0),
    0
  );

  // Số ngày có lịch lên lớp thực tế trong tuần (Thứ 2 đến Chủ nhật)
  const teachingDaysSet = new Set(
    schedules
      .map(s => parseInt(s.dayOfWeek, 10))
      .filter(d => d >= 2 && d <= 8)
  );
  const totalDays = teachingDaysSet.size;
  const dayGroups = groupByDay();

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải lịch giảng dạy...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentSem = semesters[selectedSemIdx];

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Lịch Giảng Dạy</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {user?.fullName || 'Giảng viên TUAF'}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {onSwitchRole && user?.availableRoles?.includes('inspector') && (
            <TouchableOpacity
              style={styles.switchRoleBtn}
              onPress={() => onSwitchRole('inspector')}
              activeOpacity={0.8}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color="#4f46e5" />
              <Text style={styles.switchRoleText}>Thanh tra</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.syncBtn} onPress={onRefresh} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color={Colors.textOnPrimary} />
            ) : (
              <Ionicons name="sync-outline" size={18} color={Colors.textOnPrimary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* SEMESTER PICKER */}
      {semesters.length > 0 && (
        <View style={styles.semPickerContainer}>
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
                <Text
                  numberOfLines={1}
                  style={[
                    styles.semChipText,
                    idx === selectedSemIdx && styles.semChipTextActive,
                  ]}
                >
                  {sem.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* STATS BAR */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalClasses}</Text>
          <Text style={styles.statLabel}>Môn dạy</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalCredits}</Text>
          <Text style={styles.statLabel}>Tín chỉ</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalDays > 0 ? totalDays : (dayGroups.length || 0)}</Text>
          <Text style={styles.statLabel}>Ngày/tuần</Text>
        </View>
      </View>

      {/* SCHEDULE LIST */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {schedules.length > 0 ? (
          dayGroups.map(([day, items]) => {
            const dayNum = parseInt(day, 10);
            const dayColor = getDayColor(dayNum);
            return (
              <View key={day} style={styles.dayGroup}>
                <View style={[styles.dayHeader, { borderLeftColor: dayColor }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.dayDot, { backgroundColor: dayColor }]} />
                    <Text style={[styles.dayName, { color: dayColor }]}>
                      {DAY_NAMES[dayNum] || `Thứ ${day}`}
                    </Text>
                  </View>
                  <View style={[styles.dayCountBadge, { backgroundColor: dayColor + '15' }]}>
                    <Text style={[styles.dayCount, { color: dayColor }]}>{items.length} ca dạy</Text>
                  </View>
                </View>

                {items.map((item, idx) => {
                  const currentSem = semesters[selectedSemIdx];
                  const schoolYear = item.schoolYear || currentSem?.schoolYear;
                  const periodStatus = getTeachingPeriodStatus(item.studyTime, schoolYear);
                  const isPast = periodStatus === 'past';
                  const isUpcoming = periodStatus === 'upcoming';
                  const isActive = periodStatus === 'active';

                  const itemKey = item.id || `${item.idLopTc || 'lop'}_${item.dayOfWeek}_${item.periodText || ''}_${item.studyTime || ''}_${idx}`;
                  const isExpanded = expandedCards[itemKey] !== undefined ? expandedCards[itemKey] : isActive;

                  if (!isExpanded) {
                    return (
                      <TouchableOpacity
                        key={itemKey}
                        style={[
                          styles.cardCollapsed,
                          isPast && styles.cardPastCollapsed,
                          isUpcoming && styles.cardUpcomingCollapsed,
                          isActive && styles.cardActiveCollapsed,
                        ]}
                        onPress={() => toggleCard(itemKey, isActive)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.collapsedLeft}>
                          <View
                            style={[
                              styles.collapsedStatusDot,
                              isPast && { backgroundColor: '#94a3b8' },
                              isUpcoming && { backgroundColor: '#0284c7' },
                              isActive && { backgroundColor: '#16a34a' },
                            ]}
                          />
                          <View style={{ flex: 1 }}>
                            <View style={styles.collapsedHeaderRow}>
                              <Text
                                style={[
                                  styles.collapsedCourseName,
                                  isPast && styles.textPast,
                                ]}
                                numberOfLines={1}
                              >
                                {item.courseName}
                              </Text>
                              {item.credits ? (
                                <Text style={[styles.collapsedCredit, isPast && styles.textPastMuted]}>
                                  {item.credits} TC
                                </Text>
                              ) : null}
                            </View>

                            <View style={styles.collapsedSubRow}>
                              <Text style={[styles.collapsedSubText, isPast && styles.textPastMuted]} numberOfLines={1}>
                                {item.batch ? `${item.batch} • ` : ''}
                                {item.studyTime || 'Chưa rõ TG'}
                                {item.periodText ? ` • Tiết ${item.periodText}` : ''}
                                {item.room ? ` • P.${item.room}` : ''}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={styles.collapsedRight}>
                          <View
                            style={[
                              styles.statusBadge,
                              isPast && styles.badgePast,
                              isUpcoming && styles.badgeUpcoming,
                              isActive && styles.badgeActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                isPast && styles.badgePastText,
                                isUpcoming && styles.badgeUpcomingText,
                                isActive && styles.badgeActiveText,
                              ]}
                            >
                              {isPast ? 'Đã kết thúc' : isUpcoming ? 'Chưa dạy' : 'Đang dạy'}
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-down"
                            size={18}
                            color={isPast ? '#94a3b8' : isUpcoming ? '#0284c7' : '#16a34a'}
                          />
                        </View>
                      </TouchableOpacity>
                    );
                  }

                  // Expanded View
                  return (
                    <View
                      key={itemKey}
                      style={[
                        styles.card,
                        isPast && styles.cardPastExpanded,
                        isActive && styles.cardActiveExpanded,
                        isUpcoming && styles.cardUpcomingExpanded,
                      ]}
                    >
                      {/* Top Row: Course Name, Status Badge, Credits & Collapse Icon */}
                      <TouchableOpacity
                        style={styles.cardTopTouchable}
                        onPress={() => toggleCard(itemKey, isActive)}
                        activeOpacity={0.8}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={[styles.courseName, isPast && styles.textPast]}>
                              {item.courseName}
                            </Text>
                            <View
                              style={[
                                styles.statusBadge,
                                isPast && styles.badgePast,
                                isUpcoming && styles.badgeUpcoming,
                                isActive && styles.badgeActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusBadgeText,
                                  isPast && styles.badgePastText,
                                  isUpcoming && styles.badgeUpcomingText,
                                  isActive && styles.badgeActiveText,
                                ]}
                              >
                                {isPast ? 'Đã kết thúc' : isUpcoming ? 'Chưa dạy' : '● Đang dạy'}
                              </Text>
                            </View>
                          </View>
                          {item.classCode ? (
                            <View style={styles.classCodeWrap}>
                              <Ionicons name="bookmark-outline" size={12} color={isPast ? '#94a3b8' : Colors.textSecondary} />
                              <Text style={[styles.classCode, isPast && styles.textPastMuted]}>{item.classCode}</Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.creditBadge, isPast && styles.creditBadgePast]}>
                            <Text style={[styles.creditText, isPast && styles.creditTextPast]}>
                              {item.credits || '?'} TC
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-up"
                            size={20}
                            color={isPast ? '#94a3b8' : Colors.textSecondary}
                          />
                        </View>
                      </TouchableOpacity>

                      {/* Middle Info Details: Tiết, Phòng, Giai đoạn */}
                      <View style={[styles.cardDetailsBox, isPast && styles.cardDetailsBoxPast]}>
                        {/* Tiết học & Thời gian */}
                        <View style={styles.detailRow}>
                          <View style={[styles.detailIconWrap, isPast && styles.detailIconWrapPast]}>
                            <Ionicons name="time-outline" size={15} color={isPast ? '#94a3b8' : Colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.detailLabel}>Tiết học & Thời gian</Text>
                            <Text style={[styles.detailValue, { color: isPast ? '#64748b' : Colors.primary, fontWeight: '700' }]}>
                              {getPeriodTimeStr(item.periodText)}
                            </Text>
                          </View>
                        </View>

                        {/* Giảng đường / Phòng học */}
                        <View style={styles.detailRow}>
                          <View style={[styles.detailIconWrap, { backgroundColor: isPast ? '#f1f5f9' : '#fef2f2' }]}>
                            <Ionicons name="business-outline" size={15} color={isPast ? '#94a3b8' : '#ef4444'} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.detailLabel}>Giảng đường / Phòng học</Text>
                            <Text style={[styles.detailValue, { color: isPast ? '#64748b' : (item.room ? '#b91c1c' : Colors.textMuted), fontWeight: '700' }]}>
                              {item.room ? `Phòng ${item.room}` : 'Chưa xếp phòng học'}
                            </Text>
                          </View>
                        </View>

                        {/* Giai đoạn / Đợt học */}
                        <View style={styles.detailRow}>
                          <View style={[styles.detailIconWrap, { backgroundColor: isPast ? '#f1f5f9' : '#f0fdf4' }]}>
                            <Ionicons name="calendar-outline" size={15} color={isPast ? '#94a3b8' : '#16a34a'} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.detailLabel}>Giai đoạn & Thời gian học</Text>
                            <Text style={[styles.detailValue, { color: isPast ? '#64748b' : '#15803d', fontWeight: '600' }]}>
                              {item.batch ? `${item.batch} • ` : ''}{item.studyTime || 'Chưa rõ thời gian'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Bottom Action: Điểm danh sinh viên */}
                      <View style={styles.cardBottomRow}>
                        <TouchableOpacity
                          style={[styles.attendanceBtn, isPast && styles.attendanceBtnPast]}
                          onPress={() => setAttendanceModalSchedule(item)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="clipboard-outline" size={15} color="#fff" />
                          <Text style={styles.attendanceBtnText}>Điểm danh sinh viên</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-outline" size={64} color={Colors.borderLight} />
            <Text style={styles.emptyText}>Chưa có lịch giảng dạy kỳ này!</Text>
            <Text style={styles.emptySubText}>Bấm nút đồng bộ góc trên để tải lại từ cổng trường</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={onRefresh}>
              <Text style={styles.emptyBtnText}>Đồng bộ ngay</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* STUDENT ATTENDANCE MODAL */}
      <Modal
        visible={Boolean(attendanceModalSchedule)}
        animationType="slide"
        onRequestClose={() => setAttendanceModalSchedule(null)}
      >
        <StudentAttendanceScreen
          schedule={attendanceModalSchedule}
          onClose={() => setAttendanceModalSchedule(null)}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontSize: 14 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchRoleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#c7d2fe',
  },
  switchRoleText: { fontSize: 13, fontWeight: '700', color: '#4f46e5' },
  syncBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 3,
  },
  // Semester Picker
  semPickerContainer: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingVertical: 8,
  },
  semPickerWrap: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  semChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  semChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  semChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
    marginRight: 6,
  },
  semChipDotActive: {
    backgroundColor: '#fff',
  },
  semChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  semChipTextActive: {
    color: Colors.textOnPrimary,
    fontWeight: '700',
  },
  // Stats Bar
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '800', color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  statDivider: { width: 1, height: 24, backgroundColor: Colors.borderLight },
  // Day Group
  dayGroup: { marginTop: 12 },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: Colors.surface, borderLeftWidth: 4,
    marginBottom: 6,
  },
  dayDot: { width: 8, height: 8, borderRadius: 4 },
  dayName: { fontSize: 15, fontWeight: '800' },
  dayCountBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  dayCount: { fontSize: 11, fontWeight: '700' },
  // Card
  card: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginVertical: 6,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.borderLight,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 5,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  courseName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, lineHeight: 22 },
  classCodeWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  classCode: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  creditBadge: {
    backgroundColor: Colors.primary + '14', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8,
  },
  creditText: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  // Details Box
  cardDetailsBox: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIconWrap: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  detailLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 13, marginTop: 1 },
  cardBottomRow: { marginTop: 12 },
  attendanceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#16a34a', paddingVertical: 9,
    borderRadius: 10,
  },
  attendanceBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cardTopTouchable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardPastExpanded: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  cardActiveExpanded: {
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
  },
  cardUpcomingExpanded: {
    borderLeftWidth: 4,
    borderLeftColor: '#0284c7',
  },
  cardDetailsBoxPast: {
    backgroundColor: '#f1f5f9',
  },
  detailIconWrapPast: {
    backgroundColor: '#e2e8f0',
  },
  creditBadgePast: {
    backgroundColor: '#e2e8f0',
  },
  creditTextPast: {
    color: '#64748b',
  },
  attendanceBtnPast: {
    backgroundColor: '#64748b',
  },
  cardCollapsed: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardPastCollapsed: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    opacity: 0.85,
  },
  cardUpcomingCollapsed: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  cardActiveCollapsed: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
  },
  collapsedLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 8,
  },
  collapsedStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  collapsedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  collapsedCourseName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  collapsedCredit: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  collapsedSubRow: {
    marginTop: 2,
  },
  collapsedSubText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  collapsedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgePast: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  badgePastText: {
    color: '#64748b',
  },
  badgeUpcoming: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  badgeUpcomingText: {
    color: '#0284c7',
  },
  badgeActive: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  badgeActiveText: {
    color: '#15803d',
  },
  textPast: {
    color: '#64748b',
  },
  textPastMuted: {
    color: '#94a3b8',
  },
  emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginTop: 16 },
  emptySubText: { fontSize: 13, color: Colors.textMuted, marginTop: 6, textAlign: 'center' },
  emptyBtn: {
    marginTop: 16, backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
