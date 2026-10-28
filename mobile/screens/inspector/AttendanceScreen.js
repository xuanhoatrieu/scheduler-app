import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getInspectorClassesByDate, submitAttendance } from '../../services/api';
import { Colors } from '../../theme/colors';

const DAY_NAMES = {
  2: 'Thứ Hai', 3: 'Thứ Ba', 4: 'Thứ Tư', 5: 'Thứ Năm',
  6: 'Thứ Sáu', 7: 'Thứ Bảy', 8: 'Chủ Nhật',
};

const SHIFT_TABS = [
  { key: 'all', label: 'Tất cả', sub: '' },
  { key: 'morning', label: 'Sáng', sub: 'T1-5' },
  { key: 'afternoon', label: 'Chiều', sub: 'T6-10' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chưa kiểm tra' },
  { key: 'normal', label: 'Đúng giờ' },
  { key: 'issue', label: 'Có vấn đề / Đổi giờ' },
];

const STATUS_CONFIG = {
  on_time: { label: 'Đúng giờ', color: '#2e7d32', bg: '#e8f5e9', icon: 'checkmark-circle' },
  late: { label: 'Đi muộn', color: '#e65100', bg: '#fff3e0', icon: 'alert-circle' },
  early_leave: { label: 'Về sớm', color: '#f57c00', bg: '#fff8e1', icon: 'time' },
  rescheduled_permitted: { label: 'Đổi giờ (Có phép)', color: '#0277bd', bg: '#e1f5fe', icon: 'swap-horizontal' },
  rescheduled_unpermitted: { label: 'Tự ý đổi giờ', color: '#c62828', bg: '#ffebee', icon: 'close-circle' },
  rescheduled: { label: 'Đổi giờ', color: '#0277bd', bg: '#e1f5fe', icon: 'swap-horizontal' },
  substitute: { label: 'Dạy thay', color: '#5c6bc0', bg: '#ede7f6', icon: 'people' },
  absent: { label: 'Vắng / Bỏ tiết', color: '#c62828', bg: '#ffebee', icon: 'close-circle' },
  exempt: { label: 'Được miễn', color: '#00838f', bg: '#e0f7fa', icon: 'shield-checkmark' },
  pending: { label: 'Chưa kiểm tra', color: Colors.textMuted, bg: '#f5f5f5', icon: 'help-circle' },
};

const formatTime = (dateStr) => {
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

// Hàm tiện ích chuyển HH:MM thành số phút trong ngày
const timeToMinutes = (str) => {
  if (!str || typeof str !== 'string' || !str.includes(':')) return null;
  const [h, m] = str.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

// Chuyển số phút trong ngày thành chuỗi HH:MM
const minutesToTime = (totalMins) => {
  let mins = Math.max(0, Math.min(1439, Math.round(totalMins)));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Cộng số phút vào HH:MM
const addMinutesToTime = (timeStr, mins) => {
  const base = timeToMinutes(timeStr);
  if (base == null) return timeStr || '';
  return minutesToTime(base + (parseInt(mins, 10) || 0));
};

// Trừ số phút từ HH:MM
const subtractMinutesFromTime = (timeStr, mins) => {
  const base = timeToMinutes(timeStr);
  if (base == null) return timeStr || '';
  return minutesToTime(base - (parseInt(mins, 10) || 0));
};

// Tính khoảng cách phút giữa 2 mốc giờ HH:MM
const getDiffMinutes = (startTimeStr, endTimeStr) => {
  const t1 = timeToMinutes(startTimeStr);
  const t2 = timeToMinutes(endTimeStr);
  if (t1 == null || t2 == null) return 0;
  return Math.max(0, t2 - t1);
};

// Phân tích linh hoạt thông tin tiết học ở phía client (dự phòng khi dữ liệu cache thiếu blockInfo)
const resolveClientBlockInfo = (cls) => {
  if (cls.blockKey && cls.shiftKey) {
    return {
      startPeriod: cls.startPeriod || 1,
      endPeriod: cls.endPeriod || 3,
      shiftKey: cls.shiftKey,
      blockKey: cls.blockKey,
      blockTitle: cls.blockTitle || `Tiết ${cls.periodText || '1-3'}`,
      blockTimeRange: cls.blockTimeRange || `${cls.scheduledStart || '07:00'} - ${cls.scheduledEnd || '09:45'}`,
      blockOrder: cls.blockOrder || 10,
    };
  }
  const clean = String(cls.periodText || '1-3').replace(/[^\d-]/g, '');
  const parts = clean.split('-').map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0);
  const startP = parts[0] || 1;
  const endP = parts.length > 1 ? Math.max(parts[0], parts[1]) : startP;
  const shiftKey = startP >= 11 ? 'evening' : startP >= 6 ? 'afternoon' : 'morning';
  const shiftName = shiftKey === 'morning' ? 'Sáng' : shiftKey === 'afternoon' ? 'Chiều' : 'Tối';

  return {
    startPeriod: startP,
    endPeriod: endP,
    shiftKey,
    blockKey: `${shiftKey}_${startP}_${endP}`,
    blockTitle: `Ca ${shiftName} • Tiết ${startP} - ${endP}`,
    blockTimeRange: `${cls.scheduledStart || '07:00'} - ${cls.scheduledEnd || '11:40'}`,
    blockOrder: startP * 10 + endP,
  };
};

export default function AttendanceScreen({ user, onSwitchRole }) {
  const getTodayStr = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [currentDate, setCurrentDate] = useState(getTodayStr());
  const [classes, setClasses] = useState([]);
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Bộ lọc & Tìm kiếm
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedBlocks, setCollapsedBlocks] = useState({});

  // Modal chọn ngày nhanh
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [customDateInput, setCustomDateInput] = useState('');

  // Modal ghi nhận sự vụ
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('on_time');
  const [hasPermission, setHasPermission] = useState(true);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [lateMinutes, setLateMinutes] = useState('0');
  const [earlyMinutes, setEarlyMinutes] = useState('0');
  const [rescheduledDate, setRescheduledDate] = useState('');
  const [rescheduledReason, setRescheduledReason] = useState('');
  const [substituteTeacher, setSubstituteTeacher] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const loadData = async (dateStr = currentDate) => {
    setLoading(true);
    try {
      const res = await getInspectorClassesByDate(dateStr);
      if (res.success) {
        setClasses(res.data || []);
        setDayOfWeek(res.dayOfWeek || 0);
      } else {
        setClasses([]);
      }
    } catch (e) {
      setClasses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(currentDate);
  }, [currentDate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(currentDate);
    setRefreshing(false);
  }, [currentDate]);

  const changeDate = (days) => {
    const parts = (currentDate || getTodayStr()).split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setCurrentDate(`${year}-${month}-${day}`);
  };

  const goToToday = () => {
    setCurrentDate(getTodayStr());
  };

  // Đếm số lớp theo từng buổi (Sáng / Chiều / Tối)
  const shiftCounts = useMemo(() => {
    const counts = { all: classes.length, morning: 0, afternoon: 0, evening: 0 };
    for (const c of classes) {
      const info = resolveClientBlockInfo(c);
      if (counts[info.shiftKey] != null) {
        counts[info.shiftKey] += 1;
      }
    }
    return counts;
  }, [classes]);

  // Lọc và sắp xếp lớp học theo tiến trình thời gian trong ngày
  const filteredAndSortedClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = classes.filter(cls => {
      const info = resolveClientBlockInfo(cls);

      // 1. Lọc theo buổi học
      if (selectedShift !== 'all' && info.shiftKey !== selectedShift) {
        return false;
      }

      // 2. Lọc theo trạng thái kiểm tra
      const attStatus = cls.attendance?.status || 'pending';
      if (selectedStatusFilter === 'pending' && attStatus !== 'pending') {
        return false;
      }
      if (selectedStatusFilter === 'normal' && attStatus !== 'on_time') {
        return false;
      }
      if (selectedStatusFilter === 'issue' && (attStatus === 'pending' || attStatus === 'on_time')) {
        return false;
      }

      // 3. Tìm kiếm từ khóa
      if (q) {
        const course = (cls.courseName || '').toLowerCase();
        const code = (cls.classCode || '').toLowerCase();
        const teacher = (cls.teacherName || '').toLowerCase();
        const room = (cls.room || '').toLowerCase();
        if (!course.includes(q) && !code.includes(q) && !teacher.includes(q) && !room.includes(q)) {
          return false;
        }
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const infoA = resolveClientBlockInfo(a);
      const infoB = resolveClientBlockInfo(b);
      if (infoA.startPeriod !== infoB.startPeriod) return infoA.startPeriod - infoB.startPeriod;
      if (infoA.endPeriod !== infoB.endPeriod) return infoA.endPeriod - infoB.endPeriod;
      const tCmp = String(a.scheduledStart || '').localeCompare(String(b.scheduledStart || ''));
      if (tCmp !== 0) return tCmp;
      return String(a.room || '').localeCompare(String(b.room || ''), 'vi');
    });
  }, [classes, selectedShift, selectedStatusFilter, searchQuery]);

  // Gom nhóm linh hoạt theo Khung Tiết (Period Blocks)
  const periodBlocks = useMemo(() => {
    const map = new Map();
    for (const cls of filteredAndSortedClasses) {
      const info = resolveClientBlockInfo(cls);
      if (!map.has(info.blockKey)) {
        map.set(info.blockKey, {
          blockKey: info.blockKey,
          blockTitle: info.blockTitle,
          blockTimeRange: info.blockTimeRange,
          blockOrder: info.blockOrder,
          shiftKey: info.shiftKey,
          startPeriod: info.startPeriod,
          endPeriod: info.endPeriod,
          items: [],
          checkedCount: 0,
          issueCount: 0,
        });
      }
      const group = map.get(info.blockKey);
      group.items.push(cls);
      const st = cls.attendance?.status || 'pending';
      if (st !== 'pending') group.checkedCount += 1;
      if (st !== 'pending' && st !== 'on_time') group.issueCount += 1;
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.startPeriod !== b.startPeriod) return a.startPeriod - b.startPeriod;
      if (a.endPeriod !== b.endPeriod) return a.endPeriod - b.endPeriod;
      return a.blockOrder - b.blockOrder;
    });
  }, [filteredAndSortedClasses]);

  const toggleBlock = (blockKey) => {
    setCollapsedBlocks(prev => ({
      ...prev,
      [blockKey]: !prev[blockKey],
    }));
  };

  const toggleAllBlocks = () => {
    const allCollapsed = periodBlocks.every(b => collapsedBlocks[b.blockKey]);
    if (allCollapsed) {
      setCollapsedBlocks({});
    } else {
      const next = {};
      for (const b of periodBlocks) next[b.blockKey] = true;
      setCollapsedBlocks(next);
    }
  };

  const openModal = (cls) => {
    setSelectedClass(cls);
    setSubmitError('');

    const scheduledStart = cls.scheduledStart || '07:00';
    const scheduledEnd = cls.scheduledEnd || '10:45';

    if (cls.attendance) {
      const att = cls.attendance;
      const status = att.status === 'pending' ? 'on_time' : att.status;
      setSelectedStatus(status);
      setHasPermission(att.hasPermission !== false);
      setCheckInTime(att.checkInTime ? formatTime(att.checkInTime) : (status === 'absent' ? '' : scheduledStart));
      setCheckOutTime(att.checkOutTime ? formatTime(att.checkOutTime) : (status === 'absent' ? '' : scheduledEnd));
      setLateMinutes(String(att.lateMinutes || '0'));
      setEarlyMinutes(String(att.earlyMinutes || '0'));
      setRescheduledDate(att.rescheduledDate || '');
      setRescheduledReason(att.rescheduledReason || '');
      setSubstituteTeacher(att.substituteTeacher || '');
      setNote(att.note || '');
    } else {
      setSelectedStatus('on_time');
      setHasPermission(true);
      setCheckInTime(scheduledStart);
      setCheckOutTime(scheduledEnd);
      setLateMinutes('0');
      setEarlyMinutes('0');
      setRescheduledDate('');
      setRescheduledReason('');
      setSubstituteTeacher('');
      setNote('');
    }
    setModalVisible(true);
  };

  const handleSelectStatus = (newStatus) => {
    setSelectedStatus(newStatus);
    const scheduledStart = selectedClass?.scheduledStart || '07:00';
    const scheduledEnd = selectedClass?.scheduledEnd || '10:45';

    if (newStatus === 'on_time') {
      setCheckInTime(scheduledStart);
      setCheckOutTime(scheduledEnd);
      setLateMinutes('0');
      setEarlyMinutes('0');
    } else if (newStatus === 'late') {
      const currentLate = parseInt(lateMinutes, 10) || 15;
      const mins = currentLate > 0 ? currentLate : 15;
      setLateMinutes(String(mins));
      setCheckInTime(addMinutesToTime(scheduledStart, mins));
      setCheckOutTime(scheduledEnd);
      setEarlyMinutes('0');
    } else if (newStatus === 'early_leave') {
      const currentEarly = parseInt(earlyMinutes, 10) || 15;
      const mins = currentEarly > 0 ? currentEarly : 15;
      setEarlyMinutes(String(mins));
      setCheckInTime(scheduledStart);
      setCheckOutTime(subtractMinutesFromTime(scheduledEnd, mins));
      setLateMinutes('0');
    } else if (newStatus === 'absent') {
      setCheckInTime('');
      setCheckOutTime('');
      setLateMinutes('0');
      setEarlyMinutes('0');
    } else {
      if (!checkInTime) setCheckInTime(scheduledStart);
      if (!checkOutTime) setCheckOutTime(scheduledEnd);
    }
  };

  const handleLateMinutesChange = (text) => {
    const clean = text.replace(/[^0-9]/g, '');
    setLateMinutes(clean);
    const mins = parseInt(clean, 10) || 0;
    const scheduledStart = selectedClass?.scheduledStart || '07:00';
    setCheckInTime(addMinutesToTime(scheduledStart, mins));
  };

  const handleQuickLate = (mins) => {
    setLateMinutes(String(mins));
    const scheduledStart = selectedClass?.scheduledStart || '07:00';
    setCheckInTime(addMinutesToTime(scheduledStart, mins));
  };

  const handleCheckInTimeChange = (text) => {
    setCheckInTime(text);
    if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
      const scheduledStart = selectedClass?.scheduledStart || '07:00';
      const diff = getDiffMinutes(scheduledStart, text);
      setLateMinutes(String(diff));
    }
  };

  const handleEarlyMinutesChange = (text) => {
    const clean = text.replace(/[^0-9]/g, '');
    setEarlyMinutes(clean);
    const mins = parseInt(clean, 10) || 0;
    const scheduledEnd = selectedClass?.scheduledEnd || '10:45';
    setCheckOutTime(subtractMinutesFromTime(scheduledEnd, mins));
  };

  const handleQuickEarly = (mins) => {
    setEarlyMinutes(String(mins));
    const scheduledEnd = selectedClass?.scheduledEnd || '10:45';
    setCheckOutTime(subtractMinutesFromTime(scheduledEnd, mins));
  };

  const handleCheckOutTimeChange = (text) => {
    setCheckOutTime(text);
    if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
      const scheduledEnd = selectedClass?.scheduledEnd || '10:45';
      const diff = getDiffMinutes(text, scheduledEnd);
      setEarlyMinutes(String(diff));
    }
  };

  const handleSubmit = async () => {
    if (!selectedClass) return;
    setSubmitting(true);
    setSubmitError('');

    const now = new Date();
    let checkInDate = null;
    let checkOutDate = null;

    if (selectedStatus !== 'absent') {
      if (checkInTime && /^([01]\d|2[0-3]):([0-5]\d)$/.test(checkInTime)) {
        const [h, m] = checkInTime.split(':').map(Number);
        checkInDate = new Date(now);
        checkInDate.setHours(h, m, 0, 0);
      }

      if (checkOutTime && /^([01]\d|2[0-3]):([0-5]\d)$/.test(checkOutTime)) {
        const [h, m] = checkOutTime.split(':').map(Number);
        checkOutDate = new Date(now);
        checkOutDate.setHours(h, m, 0, 0);
      }
    }

    const payload = {
      scheduleId: selectedClass.scheduleId,
      date: currentDate,
      status: selectedStatus,
      checkInTime: checkInDate ? checkInDate.toISOString() : null,
      checkOutTime: checkOutDate ? checkOutDate.toISOString() : null,
      lateMinutes: selectedStatus === 'late' ? (parseInt(lateMinutes, 10) || 0) : 0,
      earlyMinutes: selectedStatus === 'early_leave' ? (parseInt(earlyMinutes, 10) || 0) : 0,
      hasPermission: selectedStatus === 'rescheduled' || selectedStatus === 'substitute' ? hasPermission : null,
      rescheduledDate: selectedStatus === 'rescheduled' ? rescheduledDate : null,
      rescheduledReason: selectedStatus === 'rescheduled' ? rescheduledReason : '',
      substituteTeacher: selectedStatus === 'substitute' ? substituteTeacher : '',
      note,
    };

    const res = await submitAttendance(payload);
    setSubmitting(false);

    if (res.success) {
      setModalVisible(false);
      await loadData(currentDate);
    } else {
      setSubmitError(res.message || 'Lỗi ghi nhận kết quả thanh tra!');
    }
  };

  const isToday = currentDate === getTodayStr();
  const totalChecked = useMemo(
    () => classes.filter(c => c.attendance && c.attendance.status !== 'pending').length,
    [classes]
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Thanh Tra Giảng Dạy</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {user?.fullName || 'Thanh tra viên'} • Đã KT {totalChecked}/{classes.length} lớp
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {onSwitchRole && (
            <TouchableOpacity
              style={styles.switchRoleHeaderBtn}
              onPress={() => onSwitchRole('lecturer')}
              activeOpacity={0.8}
            >
              <Ionicons name="school-outline" size={15} color="#16a34a" />
              <Text style={styles.switchRoleHeaderText}>Giảng viên</Text>
            </TouchableOpacity>
          )}
          <View style={styles.headerCountBadge}>
            <Text style={styles.headerCountVal}>{classes.length}</Text>
            <Text style={styles.headerCountLbl}>lớp</Text>
          </View>
        </View>
      </View>

      {/* DATE NAVIGATOR BAR */}
      <View style={styles.dateNavWrap}>
        <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeDate(-1)}>
          <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dateCenter}
          onPress={() => {
            setCustomDateInput(currentDate);
            setDateModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar" size={16} color={Colors.primary} />
          <Text style={styles.dateText}>
            {DAY_NAMES[dayOfWeek] || ''}, {currentDate.split('-').reverse().join('/')}
          </Text>
          <Ionicons name="caret-down" size={12} color={Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeDate(1)}>
          <Ionicons name="chevron-forward" size={18} color={Colors.textPrimary} />
        </TouchableOpacity>

        {!isToday && (
          <TouchableOpacity style={styles.todayBtn} onPress={goToToday}>
            <Text style={styles.todayBtnText}>Hôm nay</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* BỘ LỌC BUỔI HỌC (SHIFT TABS) */}
      <View style={styles.shiftTabsWrap}>
        {SHIFT_TABS.map(tab => {
          const isSelected = selectedShift === tab.key;
          const count = shiftCounts[tab.key] || 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.shiftTabBtn, isSelected && styles.shiftTabBtnActive]}
              onPress={() => setSelectedShift(tab.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.shiftTabLabel, isSelected && styles.shiftTabLabelActive]}>
                {tab.label}
              </Text>
              <View style={[styles.shiftCountBadge, isSelected && styles.shiftCountBadgeActive]}>
                <Text style={[styles.shiftCountText, isSelected && styles.shiftCountTextActive]}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* THANH TÌM KIẾM & LỌC TRẠNG THÁI */}
      <View style={styles.filterSection}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm giảng viên, môn học, mã lớp, số phòng..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statusFilterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {STATUS_FILTERS.map(sf => {
              const active = selectedStatusFilter === sf.key;
              return (
                <TouchableOpacity
                  key={sf.key}
                  style={[styles.statusFilterChip, active && styles.statusFilterChipActive]}
                  onPress={() => setSelectedStatusFilter(sf.key)}
                >
                  <Text style={[styles.statusFilterText, active && styles.statusFilterTextActive]}>
                    {sf.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {periodBlocks.length > 1 && (
            <TouchableOpacity style={styles.collapseAllBtn} onPress={toggleAllBlocks}>
              <Ionicons
                name={periodBlocks.every(b => collapsedBlocks[b.blockKey]) ? 'expand-outline' : 'contract-outline'}
                size={14}
                color={Colors.primary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* DANH SÁCH LỚP THEO KHUNG TIẾT LINH HOẠT (ACCORDION) */}
      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải danh sách lớp học phần...</Text>
        </View>
      ) : periodBlocks.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        >
          <Ionicons name="clipboard-outline" size={64} color={Colors.borderLight} />
          <Text style={styles.emptyText}>
            {classes.length === 0
              ? 'Không có lớp học nào trong ngày này!'
              : 'Không có lớp học phù hợp với bộ lọc!'}
          </Text>
          <Text style={styles.emptySub}>
            {classes.length === 0
              ? 'Vui lòng chọn ngày khác để kiểm tra'
              : 'Thử chọn lại buổi học hoặc xóa từ khóa tìm kiếm'}
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        >
          {periodBlocks.map(block => {
            const isCollapsed = Boolean(collapsedBlocks[block.blockKey]);
            return (
              <View key={block.blockKey} style={styles.blockContainer}>
                {/* HEADER KHUNG TIẾT (ACCORDION) */}
                <TouchableOpacity
                  style={styles.blockHeader}
                  onPress={() => toggleBlock(block.blockKey)}
                  activeOpacity={0.8}
                >
                  <View style={styles.blockHeaderLeft}>
                    <View style={styles.blockIconWrap}>
                      <Ionicons
                        name={
                          block.shiftKey === 'morning'
                            ? 'sunny-outline'
                            : block.shiftKey === 'afternoon'
                            ? 'partly-sunny-outline'
                            : 'moon-outline'
                        }
                        size={16}
                        color={Colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.blockTitleText}>{block.blockTitle}</Text>
                      <Text style={styles.blockTimeText}>Khung giờ chuẩn: {block.blockTimeRange}</Text>
                    </View>
                  </View>

                  <View style={styles.blockHeaderRight}>
                    {block.issueCount > 0 && (
                      <View style={styles.blockIssueBadge}>
                        <Text style={styles.blockIssueBadgeText}>{block.issueCount} lưu ý</Text>
                      </View>
                    )}
                    <View style={styles.blockCountPill}>
                      <Text style={styles.blockCountText}>
                        {block.checkedCount}/{block.items.length} lớp
                      </Text>
                    </View>
                    <Ionicons
                      name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                      size={18}
                      color={Colors.textSecondary}
                    />
                  </View>
                </TouchableOpacity>

                {/* DANH SÁCH LỚP TRONG KHUNG TIẾT */}
                {!isCollapsed &&
                  block.items.map(item => {
                    let statusKey = item.attendance?.status || 'pending';
                    if (statusKey === 'rescheduled') {
                      statusKey =
                        item.attendance?.hasPermission === false
                          ? 'rescheduled_unpermitted'
                          : 'rescheduled_permitted';
                    }
                    const statusConf = STATUS_CONFIG[statusKey] || STATUS_CONFIG.pending;

                    return (
                      <TouchableOpacity
                        key={item.scheduleId}
                        style={styles.card}
                        onPress={() => openModal(item)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.cardTop}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={styles.courseName} numberOfLines={2}>
                              {item.courseName}
                            </Text>
                            <Text style={styles.classCode}>{item.classCode}</Text>
                          </View>

                          {/* BADGE PHÒNG HỌC & TÒA NHÀ NỔI BẬT */}
                          <View style={styles.roomHighlightBadge}>
                            <Ionicons name="location" size={13} color="#fff" />
                            <Text style={styles.roomHighlightText} numberOfLines={1}>
                              {item.room || 'Chưa xếp phòng'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.cardDetails}>
                          <View style={styles.detailRowBetween}>
                            <View style={styles.detailRow}>
                              <Ionicons name="person-outline" size={14} color="#5c6bc0" />
                              <Text style={styles.detailText}>
                                GV: <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{item.teacherName || 'Chưa rõ'}</Text>
                              </Text>
                            </View>

                            {item.studentCount > 0 && (
                              <View style={styles.studentCountChip}>
                                <Ionicons name="people-outline" size={12} color="#0284c7" />
                                <Text style={styles.studentCountChipText}>{item.studentCount} SV</Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.detailRowBetween}>
                            <View style={styles.detailRow}>
                              <Ionicons name="time-outline" size={14} color={Colors.primary} />
                              <Text style={styles.detailText}>
                                {item.scheduledStart} - {item.scheduledEnd} (Tiết {item.periodText})
                              </Text>
                            </View>

                            <View
                              style={[
                                styles.statusBadge,
                                { backgroundColor: statusConf.bg, borderColor: statusConf.color },
                              ]}
                            >
                              <Ionicons name={statusConf.icon} size={12} color={statusConf.color} />
                              <Text style={[styles.statusText, { color: statusConf.color }]}>
                                {statusConf.label}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* RESULT DETAILS */}
                        {item.attendance && (
                          <View style={styles.resultBox}>
                            {item.attendance.status === 'absent' ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Ionicons name="close-circle" size={16} color="#c62828" />
                                <Text style={[styles.resultNote, { color: '#c62828', fontWeight: '700' }]}>
                                  Giảng viên vắng mặt / Bỏ tiết giảng dạy
                                </Text>
                              </View>
                            ) : item.attendance.status === 'rescheduled' ? (
                              <View style={{ gap: 2 }}>
                                <Text
                                  style={[
                                    styles.resultNote,
                                    {
                                      color: item.attendance.hasPermission ? '#0277bd' : '#c62828',
                                      fontWeight: '700',
                                    },
                                  ]}
                                >
                                  {item.attendance.hasPermission
                                    ? '✔ Đổi giờ: Có đề nghị/phê duyệt trước'
                                    : '✘ Đổi giờ: Tự ý đổi (Không phép)'}
                                </Text>
                                {item.attendance.rescheduledDate ? (
                                  <Text style={styles.resultNote}>
                                    Lịch học bù: {item.attendance.rescheduledDate}
                                  </Text>
                                ) : null}
                                {item.attendance.rescheduledReason ? (
                                  <Text style={styles.resultNote}>
                                    Lý do: {item.attendance.rescheduledReason}
                                  </Text>
                                ) : null}
                              </View>
                            ) : item.attendance.status === 'substitute' ? (
                              <Text style={[styles.resultNote, { color: '#5c6bc0', fontWeight: '700' }]}>
                                Dạy thay bởi: {item.attendance.substituteTeacher || 'GV khác'}
                              </Text>
                            ) : (
                              <View style={{ flexDirection: 'row', gap: 14 }}>
                                <Text style={styles.resultTime}>
                                  Vào: {item.attendance.checkInTime ? formatTime(item.attendance.checkInTime) : '--:--'}
                                  {item.attendance.lateMinutes > 0 ? ` (+${item.attendance.lateMinutes}p)` : ''}
                                </Text>
                                <Text style={styles.resultTime}>
                                  Ra: {item.attendance.checkOutTime ? formatTime(item.attendance.checkOutTime) : '--:--'}
                                  {item.attendance.earlyMinutes > 0 ? ` (-${item.attendance.earlyMinutes}p)` : ''}
                                </Text>
                              </View>
                            )}
                            {item.attendance.note ? (
                              <Text style={styles.resultNote}>Ghi chú: {item.attendance.note}</Text>
                            ) : null}
                          </View>
                        )}

                        <View style={styles.cardFooter}>
                          <Text style={styles.footerHint}>
                            {item.attendance ? 'Chạm để cập nhật biên bản' : 'Chạm để ghi nhận sự vụ'}
                          </Text>
                          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* MODAL CHỌN NGÀY NHANH */}
      <Modal
        visible={dateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { paddingBottom: 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn ngày kiểm tra</Text>
              <TouchableOpacity onPress={() => setDateModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#555" />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Nhập ngày (Định dạng YYYY-MM-DD):</Text>
            <TextInput
              style={styles.textInput}
              placeholder="VD: 2026-10-20"
              placeholderTextColor={Colors.textMuted}
              value={customDateInput}
              onChangeText={setCustomDateInput}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.submitBtn, { flex: 1, marginTop: 0, backgroundColor: '#64748B' }]}
                onPress={() => {
                  setCurrentDate(getTodayStr());
                  setDateModalVisible(false);
                }}
              >
                <Text style={styles.submitBtnText}>Hôm nay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { flex: 1, marginTop: 0 }]}
                onPress={() => {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(customDateInput.trim())) {
                    setCurrentDate(customDateInput.trim());
                    setDateModalVisible(false);
                  }
                }}
              >
                <Text style={styles.submitBtnText}>Áp dụng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL GHI NHẬN SỰ VỤ THANH TRA */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Biên Bản Kiểm Tra</Text>
                <Text style={styles.modalSub}>{selectedClass?.courseName} • Phòng {selectedClass?.room}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#555" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }}>
              {/* TKB SCHEDULE INFO BADGE */}
              <View style={styles.tkbReferenceCard}>
                <View style={styles.tkbRefRow}>
                  <Ionicons name="time" size={15} color={Colors.primary} />
                  <Text style={styles.tkbRefText}>
                    Giờ chuẩn TKB: <Text style={{ fontWeight: '800' }}>{selectedClass?.scheduledStart} - {selectedClass?.scheduledEnd}</Text> (Tiết {selectedClass?.periodText})
                  </Text>
                </View>
                <View style={[styles.tkbRefRow, { marginTop: 4 }]}>
                  <Ionicons name="location" size={15} color="#e91e63" />
                  <Text style={styles.tkbRefSub}>
                    Phòng: <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{selectedClass?.room || 'Chưa rõ'}</Text> • GV: <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{selectedClass?.teacherName || 'Chưa rõ'}</Text>
                  </Text>
                </View>
              </View>

              {/* STATUS SELECTION CHIPS */}
              <Text style={styles.inputLabel}>Tình trạng giảng dạy:</Text>
              <View style={styles.statusSelectGrid}>
                {[
                  { id: 'on_time', label: 'Đúng giờ', icon: 'checkmark-circle', color: '#2e7d32' },
                  { id: 'late', label: 'Đến muộn', icon: 'alert-circle', color: '#e65100' },
                  { id: 'early_leave', label: 'Về sớm', icon: 'time', color: '#f57c00' },
                  { id: 'rescheduled', label: 'Đổi giờ', icon: 'swap-horizontal', color: '#0277bd' },
                  { id: 'substitute', label: 'Dạy thay', icon: 'people', color: '#5c6bc0' },
                  { id: 'absent', label: 'Vắng/Bỏ tiết', icon: 'close-circle', color: '#c62828' },
                ].map(st => {
                  const isSelected = selectedStatus === st.id;
                  return (
                    <TouchableOpacity
                      key={st.id}
                      style={[
                        styles.statusSelectBtn,
                        isSelected && { backgroundColor: st.color, borderColor: st.color }
                      ]}
                      onPress={() => handleSelectStatus(st.id)}
                    >
                      <Ionicons name={st.icon} size={15} color={isSelected ? '#fff' : st.color} />
                      <Text style={[styles.statusSelectText, isSelected && { color: '#fff' }]}>{st.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* CONDITIONAL: ABSENT NOTICE */}
              {selectedStatus === 'absent' && (
                <View style={styles.absentNoticeBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="alert-circle" size={20} color="#c62828" />
                    <Text style={styles.absentNoticeTitle}>Ghi nhận vi phạm: Bỏ tiết / Vắng mặt</Text>
                  </View>
                  <Text style={styles.absentNoticeSub}>
                    Lớp học không diễn ra theo thời khóa biểu. Dữ liệu sẽ được ghi nhận vào biên bản vi phạm và báo cáo trực tiếp đến Ban Giám hiệu.
                  </Text>
                </View>
              )}

              {/* CONDITIONAL: RESCHEDULED PERMISSION SWITCH */}
              {selectedStatus === 'rescheduled' && (
                <View style={styles.rescheduledBox}>
                  <Text style={styles.inputLabel}>Xác nhận đề nghị đổi giờ:</Text>
                  <View style={styles.permRow}>
                    <TouchableOpacity
                      style={[styles.permBtn, hasPermission && styles.permBtnActiveGreen]}
                      onPress={() => setHasPermission(true)}
                    >
                      <Ionicons name="checkmark-circle" size={16} color={hasPermission ? '#fff' : '#2e7d32'} />
                      <Text style={[styles.permBtnText, hasPermission && { color: '#fff' }]}>Có phép (Đã có đề nghị)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.permBtn, !hasPermission && styles.permBtnActiveRed]}
                      onPress={() => setHasPermission(false)}
                    >
                      <Ionicons name="close-circle" size={16} color={!hasPermission ? '#fff' : '#c62828'} />
                      <Text style={[styles.permBtnText, !hasPermission && { color: '#fff' }]}>Không phép (Tự ý đổi)</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: 10 }]}>Ngày học bù dự kiến:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="VD: 2026-09-22"
                    placeholderTextColor={Colors.textMuted}
                    value={rescheduledDate}
                    onChangeText={setRescheduledDate}
                  />

                  <Text style={[styles.inputLabel, { marginTop: 10 }]}>Lý do đổi giờ / học bù:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="VD: Bận công tác Hội đồng trường..."
                    placeholderTextColor={Colors.textMuted}
                    value={rescheduledReason}
                    onChangeText={setRescheduledReason}
                  />
                </View>
              )}

              {/* CONDITIONAL: SUBSTITUTE TEACHER */}
              {selectedStatus === 'substitute' && (
                <View style={styles.substituteBox}>
                  <Text style={styles.inputLabel}>Họ tên giảng viên dạy thay:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Nhập họ tên giảng viên dạy thay..."
                    placeholderTextColor={Colors.textMuted}
                    value={substituteTeacher}
                    onChangeText={setSubstituteTeacher}
                  />
                </View>
              )}

              {/* CONDITIONAL: LATE / EARLY MINUTES / ON_TIME */}
              {(selectedStatus === 'late' || selectedStatus === 'early_leave' || selectedStatus === 'on_time') && (
                <View style={styles.timeInputsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Giờ đến thực tế (HH:MM):</Text>
                    <TextInput
                      style={[styles.textInput, selectedStatus === 'late' && styles.textInputHighlight]}
                      placeholder={selectedClass?.scheduledStart || '07:00'}
                      placeholderTextColor={Colors.textMuted}
                      value={checkInTime}
                      onChangeText={handleCheckInTimeChange}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Giờ về thực tế (HH:MM):</Text>
                    <TextInput
                      style={[styles.textInput, selectedStatus === 'early_leave' && styles.textInputHighlight]}
                      placeholder={selectedClass?.scheduledEnd || '10:45'}
                      placeholderTextColor={Colors.textMuted}
                      value={checkOutTime}
                      onChangeText={handleCheckOutTimeChange}
                    />
                  </View>
                </View>
              )}

              {/* SỐ PHÚT ĐẾN MUỘN */}
              {selectedStatus === 'late' && (
                <View style={styles.minutesBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.inputLabel}>Số phút đến muộn:</Text>
                    <Text style={styles.autoCalcHint}>
                      Giờ đến: {checkInTime || '--:--'}
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.textInput, { fontWeight: '700', fontSize: 15, color: '#e65100' }]}
                    placeholder="VD: 15"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={lateMinutes}
                    onChangeText={handleLateMinutesChange}
                  />
                  <View style={styles.quickMinutesRow}>
                    <Text style={styles.quickMinutesLabel}>Chọn nhanh:</Text>
                    {[5, 10, 15, 20, 30, 45].map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.quickMinuteBtn,
                          parseInt(lateMinutes, 10) === m && styles.quickMinuteBtnActiveLate
                        ]}
                        onPress={() => handleQuickLate(m)}
                      >
                        <Text style={[
                          styles.quickMinuteBtnText,
                          parseInt(lateMinutes, 10) === m && { color: '#fff' }
                        ]}>+{m}p</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* SỐ PHÚT VỀ SỚM */}
              {selectedStatus === 'early_leave' && (
                <View style={styles.minutesBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.inputLabel}>Số phút về sớm:</Text>
                    <Text style={[styles.autoCalcHint, { color: '#f57c00' }]}>
                      Giờ về: {checkOutTime || '--:--'}
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.textInput, { fontWeight: '700', fontSize: 15, color: '#f57c00' }]}
                    placeholder="VD: 15"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={earlyMinutes}
                    onChangeText={handleEarlyMinutesChange}
                  />
                  <View style={styles.quickMinutesRow}>
                    <Text style={styles.quickMinutesLabel}>Chọn nhanh:</Text>
                    {[5, 10, 15, 20, 30, 45].map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.quickMinuteBtn,
                          parseInt(earlyMinutes, 10) === m && styles.quickMinuteBtnActiveEarly
                        ]}
                        onPress={() => handleQuickEarly(m)}
                      >
                        <Text style={[
                          styles.quickMinuteBtnText,
                          parseInt(earlyMinutes, 10) === m && { color: '#fff' }
                        ]}>-{m}p</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* GENERAL NOTE */}
              <View style={{ marginTop: 10 }}>
                <Text style={styles.inputLabel}>Ghi chú thêm của thanh tra viên:</Text>
                <TextInput
                  style={[styles.textInput, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="Nhập ghi chú hoặc biên bản tóm tắt..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  value={note}
                  onChangeText={setNote}
                />
              </View>

              {submitError ? (
                <Text style={styles.submitErrorText}>{submitError}</Text>
              ) : null}
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Lưu Biên Bản Thanh Tra</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  headerCountBadge: {
    alignItems: 'center', justifyContent: 'center',
    width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary,
  },
  headerCountVal: { fontSize: 15, fontWeight: '800', color: '#fff' },
  headerCountLbl: { fontSize: 9, color: '#fff', marginTop: -2 },
  dateNavWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  dateNavBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center',
  },
  dateCenter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#f8fafc',
  },
  dateText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  todayBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: Colors.primary + '15',
  },
  todayBtnText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  shiftTabsWrap: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  shiftTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    gap: 5,
  },
  shiftTabBtnActive: {
    backgroundColor: Colors.primary,
  },
  shiftTabLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  shiftTabLabelActive: { color: '#fff' },
  shiftCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  shiftCountBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  shiftCountText: { fontSize: 10, fontWeight: '800', color: Colors.textPrimary },
  shiftCountTextActive: { color: '#fff' },

  filterSection: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary, paddingVertical: 0 },
  statusFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusFilterChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusFilterChipActive: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary,
  },
  statusFilterText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  statusFilterTextActive: { color: Colors.primary, fontWeight: '800' },
  collapseAllBtn: {
    width: 30,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },

  blockContainer: {
    marginTop: 12,
    marginHorizontal: 14,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  blockHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  blockIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockTitleText: { fontSize: 13, fontWeight: '800', color: '#1e1b4b' },
  blockTimeText: { fontSize: 11, color: '#4338ca', fontWeight: '600', marginTop: 1 },
  blockHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  blockIssueBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  blockIssueBadgeText: { fontSize: 10, fontWeight: '800', color: '#dc2626' },
  blockCountPill: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  blockCountText: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  loadingText: { marginTop: 10, fontSize: 13, color: Colors.textSecondary },
  emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyText: { fontSize: 15, fontWeight: '700', color: Colors.textMuted, marginTop: 12, textAlign: 'center' },
  emptySub: { fontSize: 12, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },

  card: {
    backgroundColor: Colors.surface,
    marginTop: 8,
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  courseName: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, lineHeight: 19 },
  classCode: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },
  roomHighlightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#be123c',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    maxWidth: 150,
  },
  roomHighlightText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDetails: { marginTop: 10, gap: 6 },
  detailRowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  detailText: { fontSize: 12, color: Colors.textSecondary },
  studentCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  studentCountChipText: { fontSize: 11, fontWeight: '700', color: '#0369a1' },

  resultBox: {
    marginTop: 10, padding: 8, borderRadius: 8,
    backgroundColor: '#f8f9fa', borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  resultTime: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  resultNote: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  footerHint: { fontSize: 11, color: Colors.primary, fontWeight: '600' },

  // MODAL
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 20, paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  modalSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0',
    alignItems: 'center', justifyContent: 'center',
  },
  tkbReferenceCard: {
    backgroundColor: '#f0f4ff', padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#d0deff', marginBottom: 4,
  },
  tkbRefRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tkbRefText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  tkbRefSub: { fontSize: 12, color: Colors.textSecondary },
  inputLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6, marginTop: 8 },
  statusSelectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusSelectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fafafa',
  },
  statusSelectText: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  absentNoticeBox: {
    marginTop: 10, padding: 12, borderRadius: 10,
    backgroundColor: '#ffebee', borderWidth: 1, borderColor: '#ffcdd2',
  },
  absentNoticeTitle: { fontSize: 13, fontWeight: '800', color: '#c62828' },
  absentNoticeSub: { fontSize: 11, color: '#b71c1c', marginTop: 4, lineHeight: 16 },
  rescheduledBox: {
    marginTop: 10, padding: 12, borderRadius: 10,
    backgroundColor: '#f5f9ff', borderWidth: 1, borderColor: '#bbdefb',
  },
  permRow: { flexDirection: 'row', gap: 8 },
  permBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff',
  },
  permBtnActiveGreen: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  permBtnActiveRed: { backgroundColor: '#c62828', borderColor: '#c62828' },
  permBtnText: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },
  substituteBox: {
    marginTop: 10, padding: 12, borderRadius: 10,
    backgroundColor: '#f3e5f5', borderWidth: 1, borderColor: '#e1bee7',
  },
  timeInputsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  textInput: {
    borderWidth: 1, borderColor: Colors.borderLight, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: Colors.textPrimary,
    backgroundColor: '#fff',
  },
  textInputHighlight: {
    borderColor: '#ff9800', backgroundColor: '#fffdf7',
  },
  minutesBox: {
    marginTop: 8, padding: 10, borderRadius: 10,
    backgroundColor: '#fff8e1', borderWidth: 1, borderColor: '#ffe082',
  },
  autoCalcHint: { fontSize: 12, fontWeight: '800', color: '#e65100' },
  quickMinutesRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8,
  },
  quickMinutesLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', marginRight: 2 },
  quickMinuteBtn: {
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd',
  },
  quickMinuteBtnActiveLate: { backgroundColor: '#e65100', borderColor: '#e65100' },
  quickMinuteBtnActiveEarly: { backgroundColor: '#f57c00', borderColor: '#f57c00' },
  quickMinuteBtnText: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },
  submitErrorText: {
    marginTop: 8, fontSize: 12, fontWeight: '700', color: '#c62828', textAlign: 'center',
  },
  submitBtn: {
    marginTop: 16, backgroundColor: Colors.primary, paddingVertical: 13,
    borderRadius: 10, alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  switchRoleHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#86efac',
    gap: 4,
  },
  switchRoleHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },
});
