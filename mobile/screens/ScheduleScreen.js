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
import { getSchedule, getScheduleSemesters } from '../services/api';
import { Colors, getDayColor } from '../theme/colors';

const DAY_FULL = {
  0: 'Lịch Thực Tập / Chưa Xếp Thứ',
  2: 'Thứ Hai', 3: 'Thứ Ba', 4: 'Thứ Tư', 5: 'Thứ Năm',
  6: 'Thứ Sáu', 7: 'Thứ Bảy', 8: 'Chủ Nhật',
};
const DAY_SHORT = {
  0: 'Khác',
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
 * Xác định trạng thái giai đoạn so với ngày hiện tại:
 * - 'active': Đang trong thời gian học (start <= today <= end)
 * - 'upcoming': Chưa bắt đầu (today < start)
 * - 'past': Đã kết thúc (today > end)
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
 * Tính số ngày còn lại đến khi bắt đầu (dành cho môn sắp học)
 */
const getDaysUntil = (studyTime) => {
  const range = parseStudyTime(studyTime);
  if (!range) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = range.start.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : null;
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

/**
 * Lấy thứ trong tuần theo chuẩn TUAF (2 = Thứ Hai ... 8 = Chủ Nhật)
 */
const getTuafDayOfWeek = (date = new Date()) => {
  const jsDay = date.getDay();
  return jsDay === 0 ? 8 : jsDay + 1;
};

/**
 * Tự động sinh danh sách học kỳ động theo thời gian thực (fallback offline)
 */
const getDynamicSemesters = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  const isSem1 = currentMonth >= 8;
  const activeStartYear = isSem1 ? currentYear : currentYear - 1;
  const activeSem = isSem1 ? '1' : '2';

  const list = [];

  // 1. Luôn bao gồm kỳ sắp tới (tương lai)
  if (isSem1) {
    list.push({
      label: `HK2 ${activeStartYear}-${activeStartYear + 1}`,
      semester: '2',
      schoolYear: String(activeStartYear),
      current: false,
    });
  } else {
    list.push({
      label: `HK1 ${activeStartYear + 1}-${activeStartYear + 2}`,
      semester: '1',
      schoolYear: String(activeStartYear + 1),
      current: false,
    });
  }

  // 2. Kỳ hiện tại
  list.push({
    label: `HK${activeSem} ${activeStartYear}-${activeStartYear + 1}`,
    semester: activeSem,
    schoolYear: String(activeStartYear),
    current: true,
  });

  // 3. Các kỳ trước đó
  if (isSem1) {
    list.push({ label: `HK2 ${activeStartYear - 1}-${activeStartYear}`, semester: '2', schoolYear: String(activeStartYear - 1) });
    list.push({ label: `HK1 ${activeStartYear - 1}-${activeStartYear}`, semester: '1', schoolYear: String(activeStartYear - 1) });
  } else {
    list.push({ label: `HK1 ${activeStartYear}-${activeStartYear + 1}`, semester: '1', schoolYear: String(activeStartYear) });
  }

  const prevBase = isSem1 ? activeStartYear - 2 : activeStartYear - 1;
  for (let y = prevBase; y >= activeStartYear - 4; y--) {
    list.push({ label: `HK2 ${y}-${y + 1}`, semester: '2', schoolYear: String(y) });
    list.push({ label: `HK1 ${y}-${y + 1}`, semester: '1', schoolYear: String(y) });
  }

  return list;
};

export default function ScheduleScreen({ user }) {
  const [scheduleData, setScheduleData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [semesters, setSemesters] = useState(getDynamicSemesters());
  const [selectedSemIdx, setSelectedSemIdx] = useState(0);
  const currentSem = semesters[selectedSemIdx] || semesters[0] || { label: 'Học kỳ' };

  // Bộ lọc trạng thái thông minh: 'active' (mặc định) | 'upcoming' | 'past' | 'all'
  const [statusFilter, setStatusFilter] = useState('active');

  const loadData = async (forceSync = false, semIdx = null, customSemesters = null) => {
    const list = customSemesters || semesters;
    const sem = list[semIdx ?? selectedSemIdx] || list[0];
    if (!sem) return;

    let res = await getSchedule(forceSync, sem.semester, sem.schoolYear);
    
    // Nếu không Force Sync nhưng DB trống trơn -> tự động kích hoạt Force Sync
    if (res.success && (!res.data || res.data.length === 0) && !forceSync) {
      console.log(`[Schedule] DB trống cho kỳ ${sem.label} -> Tự động kích hoạt Force Sync...`);
      res = await getSchedule(true, sem.semester, sem.schoolYear);
    }
    
    if (res.success) setScheduleData(res.data || []);
    else setScheduleData([]);
  };

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        const semRes = await getScheduleSemesters();
        let semList = getDynamicSemesters();
        if (semRes.success && semRes.data && semRes.data.length > 0) {
          semList = semRes.data;
          if (isMounted) setSemesters(semList);
        }
        
        const currentIdx = semList.findIndex(s => s.current);
        const targetIdx = currentIdx >= 0 ? currentIdx : 0;
        if (isMounted) setSelectedSemIdx(targetIdx);
        
        await loadData(false, targetIdx, semList);
      } catch (err) {
        console.warn('Error loading schedule semesters:', err);
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
    if (semRes.success && semRes.data && semRes.data.length > 0) {
      currentList = semRes.data;
      setSemesters(currentList);
    }
    await loadData(true, selectedSemIdx, currentList);
    setRefreshing(false);
  }, [selectedSemIdx, semesters]);

  const onSelectSemester = async (idx) => {
    if (idx === selectedSemIdx) return;
    setSelectedSemIdx(idx);
    setLoading(true);
    await loadData(false, idx);
    setLoading(false);
  };

  // ─── THÔNG TIN HÔM NAY ───
  const todayTuafDay = useMemo(() => getTuafDayOfWeek(), []);
  const todayDateStr = useMemo(() => {
    const now = new Date();
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${dayNames[now.getDay()]}, ${d}/${m}/${y}`;
  }, []);

  // Các buổi học của HÔM NAY (chỉ tính môn đang trong giai đoạn học active)
  const todaySessions = useMemo(() => {
    const list = [];
    for (const item of scheduleData) {
      if (parseInt(item.dayOfWeek) === todayTuafDay) {
        const st = getPeriodStatus(item.studyTime);
        if (st === 'active') {
          list.push(item);
        }
      }
    }
    // Sắp xếp theo tiết bắt đầu
    list.sort((a, b) => {
      const pA = parseInt((a.periodText || '1').split('-')[0]) || 1;
      const pB = parseInt((b.periodText || '1').split('-')[0]) || 1;
      return pA - pB;
    });
    return list;
  }, [scheduleData, todayTuafDay]);

  // Buổi học tiếp theo gần nhất trong tuần nếu hôm nay không có lớp
  const nextSession = useMemo(() => {
    if (todaySessions.length > 0) return null;
    const activeItems = scheduleData.filter(s => getPeriodStatus(s.studyTime) === 'active');
    if (activeItems.length === 0) return null;
    const sorted = [...activeItems].sort((a, b) => {
      let diffA = parseInt(a.dayOfWeek) - todayTuafDay;
      if (diffA <= 0) diffA += 7;
      let diffB = parseInt(b.dayOfWeek) - todayTuafDay;
      if (diffB <= 0) diffB += 7;
      return diffA - diffB;
    });
    return sorted[0] || null;
  }, [scheduleData, todaySessions, todayTuafDay]);

  // ─── THỐNG KÊ SỐ LƯỢNG MÔN THEO TRẠNG THÁI CHO FILTER TABS ───
  const filterCounts = useMemo(() => {
    const activeCourseSet = new Set();
    const upcomingCourseSet = new Set();
    const pastCourseSet = new Set();
    const allCourseSet = new Set();

    for (const item of scheduleData) {
      const cName = item.courseName;
      allCourseSet.add(cName);
      const st = getPeriodStatus(item.studyTime);
      if (st === 'active') activeCourseSet.add(cName);
      else if (st === 'upcoming') upcomingCourseSet.add(cName);
      else if (st === 'past') pastCourseSet.add(cName);
    }

    return {
      active: activeCourseSet.size,
      upcoming: upcomingCourseSet.size,
      past: pastCourseSet.size,
      all: allCourseSet.size
    };
  }, [scheduleData]);

  // Tự động chuyển tab thông minh: Nếu kỳ này không có môn đang học (kỳ cũ) -> chuyển sang 'all'
  useEffect(() => {
    if (scheduleData.length > 0 && filterCounts.active === 0 && statusFilter === 'active') {
      if (filterCounts.upcoming > 0) {
        setStatusFilter('upcoming');
      } else if (filterCounts.past > 0) {
        setStatusFilter('all');
      }
    }
  }, [scheduleData, filterCounts]);

  const FILTER_TABS = [
    { key: 'active', label: 'Đang học', icon: 'radio-button-on', color: Colors.success, count: filterCounts.active },
    { key: 'upcoming', label: 'Sắp học', icon: 'time-outline', color: Colors.accentBlue, count: filterCounts.upcoming },
    { key: 'past', label: 'Đã kết thúc', icon: 'checkmark-circle-outline', color: '#64748B', count: filterCounts.past },
    { key: 'all', label: 'Tất cả', icon: 'albums-outline', color: Colors.primary, count: filterCounts.all },
  ];

  /**
   * Nhóm lịch theo ngày → theo môn → theo giai đoạn (áp dụng bộ lọc trạng thái)
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

        let periods = Object.entries(byPeriod).map(([studyTime, items]) => ({
          studyTime,
          status: getPeriodStatus(studyTime),
          dateRange: formatDateRange(studyTime),
          daysUntil: getDaysUntil(studyTime),
          items,
        }));

        const order = { active: 0, upcoming: 1, past: 2, unknown: 3 };
        periods.sort((a, b) => order[a.status] - order[b.status]);

        // Áp dụng bộ lọc trạng thái nếu không phải 'all'
        if (statusFilter !== 'all') {
          periods = periods.filter(p => p.status === statusFilter);
        }

        // Chỉ đưa môn vào danh sách nếu có ít nhất 1 giai đoạn thỏa mãn bộ lọc
        if (periods.length > 0) {
          courses.push({
            courseName,
            periods,
            credits: courseItems[0]?.credits,
            hasActive: periods.some(p => p.status === 'active')
          });
        }
      }

      if (courses.length > 0) {
        result.push({ day: parseInt(day), courses });
      }
    }

    return result;
  }, [scheduleData, statusFilter]);

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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {/* 🌟 HERO CARD: LỊCH HỌC HÔM NAY */}
        {todaySessions.length > 0 ? (
          <View style={styles.todayHeroCard}>
            <View style={styles.todayHeroHeader}>
              <View style={styles.todayHeroTitleRow}>
                <View style={styles.todayPulseDot} />
                <Text style={styles.todayHeroTitle}>LỊCH HỌC HÔM NAY</Text>
              </View>
              <View style={styles.todayCountBadge}>
                <Text style={styles.todayCountText}>{todaySessions.length} môn học</Text>
              </View>
            </View>
            <Text style={styles.todayHeroDate}>{todayDateStr}</Text>

            {todaySessions.map((session, sIdx) => (
              <View key={sIdx} style={[styles.todaySessionItem, sIdx > 0 && styles.todaySessionDivider]}>
                <View style={styles.todaySessionTop}>
                  <Text style={styles.todaySessionName} numberOfLines={1}>{session.courseName}</Text>
                  <View style={styles.todayRoomBadge}>
                    <Ionicons name="location" size={12} color="#FFFFFF" />
                    <Text style={styles.todayRoomText}>{session.room || 'Chưa xếp'}</Text>
                  </View>
                </View>
                <View style={styles.todaySessionTags}>
                  <View style={styles.todayTagTime}>
                    <Ionicons name="time" size={12} color={Colors.primary} />
                    <Text style={styles.todayTagTimeText}>{getPeriodTimeStr(session.periodText)}</Text>
                  </View>
                  {session.teacherName ? (
                    <View style={styles.todayTagTeacher}>
                      <Ionicons name="person" size={12} color="#4B5563" />
                      <Text style={styles.todayTagTeacherText} numberOfLines={1}>{session.teacherName}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.todayFreeCard}>
            <View style={styles.todayFreeHeader}>
              <Ionicons name="sunny" size={22} color="#F59E0B" />
              <Text style={styles.todayFreeTitle}>Hôm nay bạn không có lịch học! 🎉</Text>
            </View>
            <Text style={styles.todayFreeDate}>{todayDateStr}</Text>
            {nextSession ? (
              <View style={styles.todayNextRow}>
                <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                <Text style={styles.todayNextText} numberOfLines={1}>
                  Lịch tiếp theo: <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{DAY_FULL[nextSession.dayOfWeek]}</Text> • {nextSession.courseName} ({nextSession.room || 'Phòng chưa xếp'})
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* 🌟 BỘ LỌC TRẠNG THÁI THÔNG MINH */}
        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
            {FILTER_TABS.map((tab) => {
              const isActive = statusFilter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.filterChip,
                    isActive && { backgroundColor: tab.color, borderColor: tab.color }
                  ]}
                  onPress={() => setStatusFilter(tab.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={tab.icon}
                    size={12}
                    color={isActive ? '#FFFFFF' : tab.color}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                    {tab.label}
                  </Text>
                  <View style={[styles.filterBadge, isActive ? styles.filterBadgeActive : { backgroundColor: tab.color + '18' }]}>
                    <Text style={[styles.filterBadgeText, isActive ? styles.filterBadgeTextActive : { color: tab.color }]}>
                      {tab.count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Schedule List */}
        {groupedData.length > 0 ? (
          groupedData.map((dayGroup) => {
            const dayColor = getDayColor(dayGroup.day);
            const dayName = DAY_FULL[dayGroup.day];
            const isToday = dayGroup.day === todayTuafDay;

            return (
              <View key={dayGroup.day} style={styles.dayGroup}>
                {/* Day Header */}
                <View style={styles.dayHeader}>
                  <View style={[styles.dayIndicator, { backgroundColor: dayColor }]} />
                  <Text style={[styles.dayName, { color: dayColor }]}>{dayName}</Text>
                  {isToday && (
                    <View style={styles.todayIndicatorBadge}>
                      <Text style={styles.todayIndicatorText}>Hôm nay</Text>
                    </View>
                  )}
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
          })
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-outline" size={60} color={Colors.border} />
            <Text style={styles.emptyTitle}>
              {statusFilter === 'active' && 'Không có môn nào đang học'}
              {statusFilter === 'upcoming' && 'Không có môn nào sắp bắt đầu'}
              {statusFilter === 'past' && 'Chưa có môn nào kết thúc'}
              {statusFilter === 'all' && 'Chưa có dữ liệu lịch học!'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {statusFilter !== 'all'
                ? 'Thử chuyển sang tab "Tất cả" để xem toàn bộ lịch trong học kỳ'
                : 'Nhấn nút bên dưới để tải và đồng bộ lại lịch từ nhà trường'}
            </Text>
            {statusFilter !== 'all' ? (
              <TouchableOpacity style={styles.switchTabBtn} onPress={() => setStatusFilter('all')}>
                <Text style={styles.switchTabBtnText}>Xem tất cả môn học ({filterCounts.all})</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.emptyBtn} onPress={onRefresh}>
                <Text style={styles.emptyBtnText}>Đồng bộ ngay</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * CourseCard: hiển thị môn học kèm Thanh lộ trình giai đoạn (Timeline Stepper)
 */
function CourseCard({ course, dayColor }) {
  const { courseName, periods, credits } = course;
  
  // Mặc định: mở giai đoạn active hoặc giai đoạn đầu tiên
  const [expandedPeriods, setExpandedPeriods] = useState({});

  const togglePeriod = (pIdx) => {
    setExpandedPeriods(prev => ({ ...prev, [pIdx]: !prev[pIdx] }));
  };

  return (
    <View style={styles.courseCard}>
      <View style={[styles.cardAccent, { backgroundColor: dayColor }]} />
      <View style={styles.cardBody}>
        {/* Title & Credits */}
        <View style={styles.cardTitleRow}>
          <Text style={styles.courseName} numberOfLines={2}>{courseName}</Text>
          {credits ? (
            <View style={[styles.creditBadge, { backgroundColor: dayColor + '15' }]}>
              <Text style={[styles.creditText, { color: dayColor }]}>{credits} TC</Text>
            </View>
          ) : null}
        </View>

        {/* 🌟 TIMELINE STEPPER PILLS (Nếu môn học có từ 2 giai đoạn trở lên) */}
        {periods.length > 1 && (
          <View style={styles.stepperRow}>
            {periods.map((p, idx) => {
              const isPActive = p.status === 'active';
              const isPPast = p.status === 'past';
              const pBadgeColor = isPActive ? Colors.success : (isPPast ? '#64748B' : Colors.accentBlue);
              const pIcon = isPActive ? 'radio-button-on' : (isPPast ? 'checkmark-circle' : 'time');
              const pLabel = isPActive ? 'Đang học' : (isPPast ? 'Đã xong' : 'Sắp tới');

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.stepPill,
                    { borderColor: pBadgeColor + '40', backgroundColor: pBadgeColor + '10' }
                  ]}
                  onPress={() => togglePeriod(idx)}
                >
                  <Ionicons name={pIcon} size={11} color={pBadgeColor} />
                  <Text style={[styles.stepPillText, { color: pBadgeColor }]}>
                    GĐ {idx + 1}: {pLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Periods */}
        {periods.map((period, pIdx) => {
          const isActive = period.status === 'active';
          const isPast = period.status === 'past';
          const isUpcoming = period.status === 'upcoming';

          // Mặc định: active mở (true), upcoming mở nếu không có active, past thu gọn
          const isExpanded = expandedPeriods[pIdx] !== undefined 
            ? expandedPeriods[pIdx] 
            : (isActive || (!periods.some(p => p.status === 'active') && pIdx === 0));

          if (isExpanded) {
            // === CHI TIẾT ĐẦY ĐỦ (Active / Upcoming / Expanded) ===
            const badgeColor = isActive ? Colors.success : (isPast ? '#64748B' : Colors.accentBlue);
            const badgeBg = isActive ? '#F0FDF4' : (isPast ? '#F8FAFC' : '#EFF6FF');
            const badgeBorder = isActive ? Colors.success : (isPast ? '#CBD5E1' : Colors.accentBlue);
            
            let badgeText = 'Đang trong thời gian học';
            if (isUpcoming) {
              badgeText = period.daysUntil ? `Bắt đầu sau ${period.daysUntil} ngày` : 'Chưa bắt đầu';
            } else if (isPast) {
              badgeText = 'Giai đoạn này đã kết thúc';
            }

            return (
              <TouchableOpacity 
                key={pIdx} 
                style={[
                  styles.activePeriod, 
                  { backgroundColor: badgeBg, borderLeftColor: badgeBorder }
                ]}
                onPress={() => togglePeriod(pIdx)}
                activeOpacity={0.85}
              >
                <View style={styles.activeBadgeRow}>
                  <View style={styles.activeBadge}>
                    <Ionicons 
                      name={isActive ? 'radio-button-on' : (isPast ? 'checkmark-circle' : 'time')} 
                      size={13} 
                      color={badgeColor} 
                    />
                    <Text style={[styles.activeBadgeText, { color: badgeColor }]}>{badgeText}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.activeDateRange}>{period.dateRange}</Text>
                    <Ionicons name="chevron-up" size={14} color={Colors.textMuted} />
                  </View>
                </View>

                {period.items.map((item, iIdx) => (
                  <View key={iIdx} style={{ marginTop: iIdx > 0 ? 8 : 4 }}>
                    {/* Hàng 1: Tiết học & Phòng học */}
                    <View style={styles.activeItemTags}>
                      {item.periodText ? (
                        <View style={styles.timeTag}>
                          <Ionicons name="time" size={12} color={Colors.primary} />
                          <Text style={styles.timeTagText}>
                            {getPeriodTimeStr(item.periodText)}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.roomTag}>
                        <Ionicons name="location" size={12} color="#DC2626" />
                        <Text style={styles.roomTagText}>Phòng: {item.room || 'Chưa xếp'}</Text>
                      </View>
                    </View>
                    
                    {/* Hàng 2: Giảng viên & Mã lớp */}
                    <View style={[styles.activeItemTags, { marginTop: 6 }]}>
                      {item.teacherName ? (
                        <View style={styles.infoTag}>
                          <Ionicons name="person-outline" size={12} color={Colors.accentPurple} />
                          <Text style={styles.infoTagText} numberOfLines={1}>{item.teacherName}</Text>
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
            // === THU GỌN 1 DÒNG (Dành cho môn đã xong hoặc thu gọn) ===
            const statusIcon = isPast ? 'checkmark-circle' : 'time-outline';
            const statusColor = isPast ? '#64748B' : Colors.accentBlue;
            const statusLabel = isPast ? 'Đã hoàn thành' : 'Sắp tới';
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
                    {statusLabel} ({period.dateRange})
                  </Text>
                  {periodsText ? <Text style={styles.collapsedRoom} numberOfLines={1}>• Tiết {periodsText}</Text> : null}
                  {rooms ? <Text style={styles.collapsedRoom} numberOfLines={1}>• {rooms}</Text> : null}
                </View>
                <Ionicons name="chevron-down" size={14} color="#6B7280" />
              </TouchableOpacity>
            );
          }
        })}
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
  semPickerContainer: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    height: 52, justifyContent: 'center',
  },
  semPickerWrap: {
    paddingHorizontal: 16, alignItems: 'center', flexDirection: 'row', gap: 8,
  },
  semChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14, height: 36, borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#D1D5DB',
  },
  semChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    elevation: 2, shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  semChipText: { 
    fontSize: 13, fontWeight: '700', color: '#374151',
    includeFontPadding: false, textAlignVertical: 'center'
  },
  semChipTextActive: { color: Colors.textOnPrimary },
  semChipDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.success, marginRight: 6,
  },
  semChipDotActive: { backgroundColor: Colors.textOnPrimary },

  // 🌟 HERO CARD HÔM NAY (ACTIVE)
  todayHeroCard: {
    marginHorizontal: 16, marginTop: 14, marginBottom: 6,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: Colors.primaryMuted + '50',
    elevation: 3, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 8,
  },
  todayHeroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  todayHeroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  todayPulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  todayHeroTitle: { fontSize: 12, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5 },
  todayCountBadge: { backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  todayCountText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  todayHeroDate: { fontSize: 13, color: Colors.textSecondary, marginTop: 2, marginBottom: 12 },
  todaySessionItem: { marginTop: 4 },
  todaySessionDivider: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  todaySessionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  todaySessionName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  todayRoomBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.primary, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
  },
  todayRoomText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  todaySessionTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  todayTagTime: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6,
  },
  todayTagTimeText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  todayTagTeacher: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6,
  },
  todayTagTeacherText: { fontSize: 12, color: '#374151', fontWeight: '500', maxWidth: 160 },

  // 🌟 HERO CARD HÔM NAY (NGHỈ)
  todayFreeCard: {
    marginHorizontal: 16, marginTop: 14, marginBottom: 6,
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#FDE68A',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4,
  },
  todayFreeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayFreeTitle: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  todayFreeDate: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, marginLeft: 30 },
  todayNextRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#FEF3C7',
  },
  todayNextText: { fontSize: 12, color: Colors.textSecondary, flex: 1 },

  // 🌟 BỘ LỌC TRẠNG THÁI (STATUS FILTER BAR)
  filterSection: { marginTop: 10, marginBottom: 4 },
  filterBar: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: '#FFFFFF', borderWidth: 1.2, borderColor: '#D1D5DB',
  },
  filterChipText: { fontSize: 12.5, fontWeight: '700', color: '#374151', marginRight: 6 },
  filterChipTextActive: { color: '#FFFFFF' },
  filterBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  filterBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterBadgeText: { fontSize: 11, fontWeight: '700' },
  filterBadgeTextActive: { color: '#FFFFFF' },

  // Danh sách ngày
  dayGroup: { marginTop: 14, paddingHorizontal: 16 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dayIndicator: { width: 4, height: 20, borderRadius: 2, marginRight: 10 },
  dayName: { fontSize: 16, fontWeight: '700', flex: 1 },
  todayIndicatorBadge: {
    backgroundColor: Colors.primary, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, marginRight: 8,
  },
  todayIndicatorText: { fontSize: 10.5, fontWeight: '700', color: '#FFFFFF' },
  dayCountBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  dayCount: { fontSize: 11, fontWeight: '700' },

  // Thẻ môn học
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

  // Timeline Stepper Row
  stepperRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  stepPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1,
  },
  stepPillText: { fontSize: 11, fontWeight: '700' },

  // Giai đoạn đang mở (Active & Full Detail)
  activePeriod: {
    borderRadius: 10, padding: 10, marginBottom: 6,
    borderLeftWidth: 3.5,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  activeBadgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  activeBadgeText: { fontSize: 11.5, fontWeight: '700' },
  activeDateRange: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  activeItemTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeTag: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, gap: 4, borderWidth: 1, borderColor: Colors.primaryMuted + '40',
  },
  timeTagText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },
  roomTag: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, gap: 4, borderWidth: 1, borderColor: '#FECACA',
  },
  roomTagText: { fontSize: 12, color: '#DC2626', fontWeight: '700' },
  infoTag: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, gap: 4, borderWidth: 1, borderColor: Colors.borderLight,
  },
  infoTagText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500', maxWidth: 160 },

  // Giai đoạn thu gọn (1 dòng nhỏ)
  collapsedPeriod: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 7, paddingHorizontal: 10,
    backgroundColor: '#F8FAFC', borderRadius: 8,
    borderWidth: 1, borderColor: '#E2E8F0',
    marginTop: 4,
  },
  collapsedPast: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  collapsedLabel: { fontSize: 11.5, fontWeight: '600', flexShrink: 0 },
  collapsedRoom: { fontSize: 11.5, color: '#0F172A', fontWeight: '600', marginLeft: 2 },

  // Trạng thái trống
  emptyWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginTop: 12, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  switchTabBtn: { marginTop: 14, backgroundColor: Colors.primaryBg, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
  switchTabBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  emptyBtn: { marginTop: 16, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { color: Colors.textOnPrimary, fontWeight: '700', fontSize: 14 },
});
