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
import { getExams, getScheduleSemesters } from '../../services/api';
import { Colors } from '../../theme/colors';

const DAY_NAMES = {
  0: 'Chủ Nhật',
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
};

const TRAINING_SYSTEMS = [
  { key: 'DHCQ', label: 'Chính quy' },
  { key: 'VLVH', label: 'Vừa làm vừa học' },
  { key: 'DTTX', label: 'Từ xa' },
  { key: 'SDH', label: 'Sau ĐH' },
  { key: 'CTTT', label: 'Tiên tiến' },
  { key: 'ALL', label: 'Tất cả hệ' },
];

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

export default function LecturerExamsScreen({ user }) {
  const [examData, setExamData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [semesters, setSemesters] = useState(getDynamicSemesters());
  const [selectedSemIdx, setSelectedSemIdx] = useState(0);
  const [selectedSystem, setSelectedSystem] = useState('DHCQ');

  const currentSem = semesters[selectedSemIdx] || semesters[0] || { label: 'Học kỳ' };
  const currentSysObj = TRAINING_SYSTEMS.find(s => s.key === selectedSystem) || TRAINING_SYSTEMS[0];

  // Tải dữ liệu lịch thi
  const loadData = async (forceSync = false, semIdx = null, customSemList = null, sys = null) => {
    const list = customSemList || semesters;
    const idx = semIdx !== null ? semIdx : selectedSemIdx;
    const sem = list[idx] || list[0];
    const activeSys = sys !== null ? sys : selectedSystem;
    if (!sem) return;

    try {
      const res = await getExams(forceSync, sem.semester, sem.schoolYear, activeSys);
      if (res.success && Array.isArray(res.data)) {
        // Đảm bảo lọc chỉ các môn có lịch thi hợp lệ
        const validExams = res.data.filter(e => e && (e.examDate || e.room || e.examTime));
        setExamData(validExams);
      } else {
        setExamData([]);
      }
    } catch (err) {
      console.warn('Lỗi tải lịch thi giảng viên:', err.message);
      setExamData([]);
    }
  };

  // Khởi tạo danh mục kỳ & tải dữ liệu kỳ hiện hành đồng bộ
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        const res = await getScheduleSemesters();
        let semList = semesters;
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          semList = res.data;
          if (isMounted) setSemesters(semList);
        }

        const currentIdx = semList.findIndex(s => s.current);
        const targetIdx = currentIdx >= 0 ? currentIdx : 0;
        if (isMounted) setSelectedSemIdx(targetIdx);

        await loadData(false, targetIdx, semList, 'DHCQ');
      } catch (err) {
        console.warn('Lỗi khởi tạo học kỳ lịch thi giảng viên:', err.message);
        await loadData(false, 0, null, 'DHCQ');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    init();
    return () => { isMounted = false; };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true, selectedSemIdx, semesters, selectedSystem);
    setRefreshing(false);
  }, [selectedSemIdx, semesters, selectedSystem]);

  const onSelectSemester = async (idx) => {
    if (idx !== selectedSemIdx) {
      setSelectedSemIdx(idx);
      setLoading(true);
      await loadData(false, idx, semesters, selectedSystem);
      setLoading(false);
    }
  };

  const onSelectSystem = async (sysKey) => {
    if (sysKey !== selectedSystem) {
      setSelectedSystem(sysKey);
      setLoading(true);
      await loadData(false, selectedSemIdx, semesters, sysKey);
      setLoading(false);
    }
  };

  const parseExamDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const dmy = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    const ymd = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymd) return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    return null;
  };

  const getDayOfWeekText = (dateStr) => {
    const d = parseExamDate(dateStr);
    if (!d) return '';
    return DAY_NAMES[d.getDay()] || '';
  };

  // Tìm kiếm tức thì
  const filteredExams = useMemo(() => {
    if (!Array.isArray(examData)) return [];
    if (!searchQuery.trim()) return examData;
    const q = searchQuery.toLowerCase().trim();
    return examData.filter(item => {
      if (!item) return false;
      const name = (item.courseName || '').toLowerCase();
      const code = (item.courseCode || '').toLowerCase();
      const cls = (item.className || '').toLowerCase();
      const room = (item.room || '').toLowerCase();
      const proctors = (item.proctors || '').toLowerCase();
      return name.includes(q) || code.includes(q) || cls.includes(q) || room.includes(q) || proctors.includes(q);
    });
  }, [examData, searchQuery]);

  // Thống kê
  const stats = useMemo(() => {
    if (!Array.isArray(examData) || examData.length === 0) {
      return { coursesCount: 0, shiftsCount: 0, totalStudents: 0 };
    }
    const distinctCourses = new Set(examData.map(e => (e ? (e.courseCode || e.courseName) : ''))).size;
    const totalStudents = examData.reduce((sum, e) => sum + ((e && e.studentCount) || 0), 0);
    return {
      coursesCount: distinctCourses,
      shiftsCount: examData.length,
      totalStudents,
    };
  }, [examData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang nạp lịch thi các môn phụ trách...</Text>
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
          <Text style={styles.headerSubtitle}>{currentSem.label} • Hệ {currentSysObj.label}</Text>
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

      {/* Training System Picker */}
      <View style={styles.sysPickerWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sysScroll}>
          {TRAINING_SYSTEMS.map((sys) => {
            const isSelected = sys.key === selectedSystem;
            return (
              <TouchableOpacity
                key={`sys_${sys.key}`}
                style={[styles.sysChip, isSelected && styles.sysChipActive]}
                onPress={() => onSelectSystem(sys.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sysChipText, isSelected && styles.sysChipTextActive]}>
                  {sys.label}
                </Text>
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
            placeholder="Tìm môn học, lớp học phần, phòng thi, giám thị..."
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
        keyExtractor={(item, index) => item.id || `${item.courseCode}_${item.classCode}_${index}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        ListHeaderComponent={
          examData.length > 0 ? (
            <View style={styles.statsCard}>
              <View style={styles.statsCardHeader}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={styles.statsCardTitle}>Chỉ hiển thị các môn phụ trách có xếp lịch thi</Text>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{stats.coursesCount}</Text>
                  <Text style={styles.statLabel}>Môn có lịch thi</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: Colors.primary }]}>{stats.shiftsCount}</Text>
                  <Text style={styles.statLabel}>Ca / Phòng thi</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: '#8B5CF6' }]}>{stats.totalStudents}</Text>
                  <Text style={styles.statLabel}>Tổng SV dự thi</Text>
                </View>
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const dayOfWeek = getDayOfWeekText(item.examDate);

          return (
            <View style={styles.card}>
              {/* Header card */}
              <View style={styles.cardHeader}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.courseName}>{item.courseName}</Text>
                  <View style={styles.metaRow}>
                    {item.courseCode ? (
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeText}>{item.courseCode}</Text>
                      </View>
                    ) : null}
                    {item.credits ? (
                      <Text style={styles.metaText}>{item.credits} tín chỉ</Text>
                    ) : null}
                    {item.examBatch ? (
                      <Text style={styles.metaText}> • {item.examBatch}</Text>
                    ) : null}
                  </View>
                </View>

                {item.studentCount > 0 ? (
                  <View style={styles.studentCountBadge}>
                    <Ionicons name="people" size={13} color="#2563EB" />
                    <Text style={styles.studentCountText}>{item.studentCount} SV</Text>
                  </View>
                ) : null}
              </View>

              {/* Tên lớp học phần */}
              {item.className ? (
                <View style={styles.classRow}>
                  <Ionicons name="school-outline" size={15} color="#64748B" />
                  <Text style={styles.classNameText} numberOfLines={1}>
                    Lớp HP: {item.className}
                  </Text>
                </View>
              ) : null}

              {/* Chi tiết ca thi & phòng */}
              <View style={styles.cardBody}>
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
                  <Text style={[styles.infoValue, { fontWeight: '700', color: Colors.primary }]}>
                    {item.room || 'Chưa xếp'}
                  </Text>
                </View>

                {item.proctors ? (
                  <View style={styles.infoRow}>
                    <View style={[styles.iconWrap, { backgroundColor: '#EDE9FE' }]}>
                      <Ionicons name="person-outline" size={16} color="#8B5CF6" />
                    </View>
                    <Text style={styles.infoLabel}>Cán bộ coi thi:</Text>
                    <Text style={styles.infoValue} numberOfLines={2}>
                      {item.proctors}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Footer card */}
              <View style={styles.cardFooter}>
                <View style={styles.formatBadge}>
                  <Ionicons name="document-text-outline" size={12} color={Colors.primary} />
                  <Text style={styles.formatText}>{item.examFormat || 'Thi viết'}</Text>
                </View>
                {item.examAttempt && item.examAttempt > 1 ? (
                  <View style={[styles.formatBadge, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[styles.formatText, { color: Colors.danger }]}>
                      Thi lần {item.examAttempt}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-outline" size={56} color={Colors.borderLight} />
            <Text style={styles.emptyTitle}>Chưa có lịch thi học phần!</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? 'Không tìm thấy môn phụ trách phù hợp với từ khóa.'
                : `Trong ${currentSem.label} (Hệ ${currentSysObj.label}), các lớp học phần bạn giảng dạy chưa có lịch thi nào được xếp.\n(Bạn có thể chọn hệ đào tạo hoặc học kỳ khác ở thanh chọn phía trên).`}
            </Text>
            {semesters.findIndex(s => s.semester === '2' && String(s.schoolYear).includes('2025')) >= 0 &&
             selectedSemIdx !== semesters.findIndex(s => s.semester === '2' && String(s.schoolYear).includes('2025')) && (
              <TouchableOpacity
                style={[styles.emptySyncBtn, { backgroundColor: '#4F46E5', marginBottom: 10 }]}
                onPress={() => onSelectSemester(semesters.findIndex(s => s.semester === '2' && String(s.schoolYear).includes('2025')))}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar" size={16} color={Colors.textOnPrimary} style={{ marginRight: 6 }} />
                <Text style={styles.emptySyncBtnText}>Xem lịch thi HK2 2025-2026</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.emptySyncBtn} onPress={onRefresh} activeOpacity={0.8}>
              <Ionicons name="sync" size={16} color={Colors.textOnPrimary} style={{ marginRight: 6 }} />
              <Text style={styles.emptySyncBtnText}>Đồng bộ lại từ CSDL</Text>
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
  semPickerWrap: { backgroundColor: Colors.surface, paddingBottom: 6 },
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
  sysPickerWrap: { backgroundColor: Colors.surface, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sysScroll: { paddingHorizontal: 16, gap: 6 },
  sysChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
  },
  sysChipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  sysChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  sysChipTextActive: { color: '#4F46E5', fontWeight: '700' },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC',
    borderRadius: 12, paddingHorizontal: 12, height: 42, borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  listContent: { padding: 16, paddingBottom: 32 },
  statsCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#E2E8F0', elevation: 2, shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6,
  },
  statsCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statsCardTitle: { fontSize: 12, fontWeight: '700', color: '#059669', marginLeft: 6 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, height: 24, backgroundColor: '#E2E8F0' },
  card: {
    backgroundColor: Colors.surface, borderRadius: 18, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#E2E8F0', elevation: 2, shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  courseName: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  codeBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 6 },
  codeText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  metaText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  studentCountBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  studentCountText: { fontSize: 12, fontWeight: '700', color: '#2563EB', marginLeft: 4 },
  classRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 12,
  },
  classNameText: { fontSize: 12, fontWeight: '600', color: '#475569', marginLeft: 6, flex: 1 },
  cardBody: { gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  infoLabel: { fontSize: 13, color: Colors.textSecondary, width: 95, fontWeight: '500' },
  infoValue: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600', flex: 1 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', paddingTop: 10 },
  formatBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryBg,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 8,
  },
  formatText: { fontSize: 11, fontWeight: '600', color: Colors.primary, marginLeft: 4 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginTop: 16 },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  emptySyncBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 20,
  },
  emptySyncBtnText: { color: Colors.textOnPrimary, fontSize: 14, fontWeight: '700' },
});
