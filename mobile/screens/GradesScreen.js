import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getGradesAll } from '../services/api';
import { Colors, getGradeColor } from '../theme/colors';
import CurriculumView from '../components/CurriculumView';

export default function GradesScreen({ user }) {
  const [semesterGroups, setSemesterGroups] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedSemesters, setExpandedSemesters] = useState({});
  const [activeTab, setActiveTab] = useState('grades'); // 'grades' | 'curriculum'

  const loadData = async () => {
    const res = await getGradesAll();
    if (res.success) {
      setSemesterGroups(res.data || []);
      setSummary(res.summary || null);
      // Auto-expand all semesters
      const expanded = {};
      (res.data || []).forEach((_, idx) => { expanded[idx] = true; });
      setExpandedSemesters(expanded);
    }
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const toggleSemester = (idx) => {
    setExpandedSemesters(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // GPA Circular Progress (simplified SVG-free version)
  const GPACard = ({ gpa, totalCourses, totalSemesters }) => {
    const gpaPercent = gpa ? (gpa / 4) * 100 : 0;
    const gpaLabel = gpa ? gpa.toFixed(2) : '--';

    let gpaStatus = { text: 'Chưa có dữ liệu', color: Colors.textMuted };
    if (gpa >= 3.6) gpaStatus = { text: 'Xuất sắc', color: Colors.gradeA };
    else if (gpa >= 3.2) gpaStatus = { text: 'Giỏi', color: Colors.gradeA };
    else if (gpa >= 2.5) gpaStatus = { text: 'Khá', color: Colors.gradeB };
    else if (gpa >= 2.0) gpaStatus = { text: 'Trung bình', color: Colors.gradeC };
    else if (gpa >= 1.0) gpaStatus = { text: 'Yếu', color: Colors.gradeD };
    else if (gpa !== null) gpaStatus = { text: 'Kém', color: Colors.gradeF };

    return (
      <View style={styles.gpaCard}>
        {/* GPA Circle */}
        <View style={styles.gpaCircleWrap}>
          <View style={[styles.gpaCircleOuter, { borderColor: gpaStatus.color + '30' }]}>
            <View style={[styles.gpaCircleInner, { borderColor: gpaStatus.color }]}>
              <Text style={[styles.gpaValue, { color: gpaStatus.color }]}>{gpaLabel}</Text>
              <Text style={styles.gpaScale}>/4.0</Text>
            </View>
          </View>
          <Text style={[styles.gpaStatusText, { color: gpaStatus.color }]}>{gpaStatus.text}</Text>
        </View>

        {/* Stats */}
        <View style={styles.gpaStats}>
          <View style={styles.gpaStat}>
            <Text style={styles.gpaStatValue}>{totalCourses || 0}</Text>
            <Text style={styles.gpaStatLabel}>Số môn</Text>
          </View>
          <View style={styles.gpaStat}>
            <Text style={styles.gpaStatValue}>{totalSemesters || 0}</Text>
            <Text style={styles.gpaStatLabel}>Học kỳ</Text>
          </View>
        </View>
      </View>
    );
  };

  // Hiển thị tên kỳ dễ đọc
  const formatSemesterName = (semester, schoolYear) => {
    const semNum = semester?.replace('HocKy', '') || '?';
    return `Học kỳ ${semNum} — ${schoolYear || ''}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải bảng điểm...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Điểm Số</Text>
          <Text style={styles.headerSubtitle}>Kết quả học tập toàn khóa</Text>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color={Colors.textOnPrimary} />
          ) : (
            <Ionicons name="sync-outline" size={18} color={Colors.textOnPrimary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Segment Control */}
      <View style={styles.segmentWrap}>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'grades' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('grades')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'grades' ? 'trophy' : 'trophy-outline'}
            size={14}
            color={activeTab === 'grades' ? Colors.textOnPrimary : Colors.textSecondary}
          />
          <Text style={[styles.segmentText, activeTab === 'grades' && styles.segmentTextActive]}>
            Bảng Điểm
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, activeTab === 'curriculum' && styles.segmentBtnActive]}
          onPress={() => setActiveTab('curriculum')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'curriculum' ? 'school' : 'school-outline'}
            size={14}
            color={activeTab === 'curriculum' ? Colors.textOnPrimary : Colors.textSecondary}
          />
          <Text style={[styles.segmentText, activeTab === 'curriculum' && styles.segmentTextActive]}>
            Chương Trình ĐT
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'curriculum' ? (
        <CurriculumView user={user} />
      ) : (
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {/* GPA Summary Card */}
        <GPACard
          gpa={summary?.cumulativeGPA}
          totalCourses={summary?.totalCourses}
          totalSemesters={summary?.totalSemesters}
        />

        {/* Semester Groups */}
        {semesterGroups.length > 0 ? (
          semesterGroups.map((group, idx) => {
            const isExpanded = expandedSemesters[idx];
            const semGpa = group.courses.filter(c => c.totalGrade4 != null);
            const semAvg = semGpa.length > 0
              ? (semGpa.reduce((s, c) => s + c.totalGrade4, 0) / semGpa.length).toFixed(2)
              : null;

            return (
              <View key={idx} style={styles.semesterGroup}>
                <TouchableOpacity style={styles.semesterHeader} onPress={() => toggleSemester(idx)} activeOpacity={0.7}>
                  <View style={styles.semesterHeaderLeft}>
                    <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={18} color={Colors.primary} />
                    <Text style={styles.semesterName}>{formatSemesterName(group.semester, group.schoolYear)}</Text>
                  </View>
                  <View style={styles.semesterHeaderRight}>
                    {semAvg && (
                      <View style={[styles.semGpaBadge, { backgroundColor: getGradeColor(semAvg >= 3.2 ? 'A' : semAvg >= 2.5 ? 'B' : 'C') + '15' }]}>
                        <Text style={[styles.semGpaText, { color: getGradeColor(semAvg >= 3.2 ? 'A' : semAvg >= 2.5 ? 'B' : 'C') }]}>
                          GPA: {semAvg}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.semesterCount}>{group.courses.length} môn</Text>
                  </View>
                </TouchableOpacity>

                {isExpanded && group.courses.map((course, cIdx) => {
                  const gradeColor = getGradeColor(course.letterGrade);
                  return (
                    <View key={cIdx} style={styles.gradeCard}>
                      <View style={styles.gradeCardHeader}>
                        <Text style={styles.gradeCourseName} numberOfLines={2}>{course.courseName}</Text>
                        <View style={[styles.letterBadge, { backgroundColor: gradeColor + '15' }]}>
                          <Text style={[styles.letterText, { color: gradeColor }]}>
                            {course.letterGrade || '-'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.gradeGrid}>
                        <View style={styles.gradeCol}>
                          <Text style={styles.gradeColVal}>{course.processGrade ?? '-'}</Text>
                          <Text style={styles.gradeColLbl}>CC</Text>
                        </View>
                        <View style={styles.gradeColDivider} />
                        <View style={styles.gradeCol}>
                          <Text style={styles.gradeColVal}>{course.midtermGrade ?? '-'}</Text>
                          <Text style={styles.gradeColLbl}>GK</Text>
                        </View>
                        <View style={styles.gradeColDivider} />
                        <View style={styles.gradeCol}>
                          <Text style={styles.gradeColVal}>{course.finalGrade ?? '-'}</Text>
                          <Text style={styles.gradeColLbl}>CK</Text>
                        </View>
                        <View style={styles.gradeColDivider} />
                        <View style={styles.gradeCol}>
                          <Text style={[styles.gradeColVal, { color: gradeColor, fontWeight: '800' }]}>
                            {course.totalGrade10 ?? '-'}
                          </Text>
                          <Text style={[styles.gradeColLbl, { color: gradeColor, fontWeight: '600' }]}>TK10</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="trophy-outline" size={64} color={Colors.borderLight} />
            <Text style={styles.emptyText}>Chưa có dữ liệu điểm số!</Text>
            <Text style={styles.emptySubText}>Hãy bấm đồng bộ lịch sử trong Hồ sơ</Text>
          </View>
        )}
      </ScrollView>
      )}
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
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  syncBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  // Segment Control
  segmentWrap: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  segmentBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary, elevation: 2,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  segmentText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  segmentTextActive: { color: Colors.textOnPrimary },
  // GPA Card
  gpaCard: {
    backgroundColor: Colors.surface, margin: 16, borderRadius: 20, padding: 24,
    elevation: 4, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  gpaCircleWrap: { alignItems: 'center', marginRight: 24 },
  gpaCircleOuter: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  gpaCircleInner: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  gpaValue: { fontSize: 22, fontWeight: '900' },
  gpaScale: { fontSize: 10, color: Colors.textMuted, marginTop: -2 },
  gpaStatusText: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  gpaStats: { flex: 1, gap: 12 },
  gpaStat: {
    backgroundColor: Colors.background, borderRadius: 12, padding: 12,
  },
  gpaStatValue: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  gpaStatLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  // Semester Group
  semesterGroup: { marginTop: 4 },
  semesterHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  semesterHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  semesterName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginLeft: 8 },
  semesterHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  semGpaBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  semGpaText: { fontSize: 11, fontWeight: '700' },
  semesterCount: { fontSize: 11, color: Colors.textMuted },
  // Grade Card
  gradeCard: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginVertical: 5,
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.borderLight,
  },
  gradeCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  gradeCourseName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, flex: 1, marginRight: 10, lineHeight: 19 },
  letterBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, minWidth: 36, alignItems: 'center' },
  letterText: { fontSize: 13, fontWeight: '800' },
  gradeGrid: { flexDirection: 'row', alignItems: 'center' },
  gradeCol: { flex: 1, alignItems: 'center' },
  gradeColVal: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  gradeColLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  gradeColDivider: { width: 1, height: 28, backgroundColor: Colors.borderLight },
  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 16 },
  emptySubText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
});
