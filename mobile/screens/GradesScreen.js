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
  const [selectedYearFilter, setSelectedYearFilter] = useState('ALL');
  const [selectedSemFilter, setSelectedSemFilter] = useState('ALL');

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

  // GPA Card với 4 chỉ số thống kê & Thanh tiến độ tốt nghiệp
  const GPACard = ({
    gpa,
    gpa10,
    totalCourses,
    totalSemesters,
    creditsStudied,
    creditsAccumulated,
    failedCredits,
    totalRequiredCredits,
    graduationProgress
  }) => {
    const gpaLabel = gpa ? Number(gpa).toFixed(2) : '--';
    const gpa10Label = gpa10 ? Number(gpa10).toFixed(2) : '--';

    let gpaStatus = { text: 'Chưa có dữ liệu', color: Colors.textMuted };
    if (gpa >= 3.6) gpaStatus = { text: 'Xuất sắc', color: Colors.gradeA };
    else if (gpa >= 3.2) gpaStatus = { text: 'Giỏi', color: Colors.gradeA };
    else if (gpa >= 2.5) gpaStatus = { text: 'Khá', color: Colors.gradeB };
    else if (gpa >= 2.0) gpaStatus = { text: 'Trung bình', color: Colors.gradeC };
    else if (gpa >= 1.0) gpaStatus = { text: 'Yếu', color: Colors.gradeD };
    else if (gpa !== null && gpa !== undefined) gpaStatus = { text: 'Kém', color: Colors.gradeF };

    const progressVal = Number(graduationProgress) || 0;

    return (
      <View style={styles.gpaCard}>
        {/* Top Section: CPA Circle + 4 Stats Grid */}
        <View style={styles.gpaTopRow}>
          {/* CPA Circle */}
          <View style={styles.gpaCircleWrap}>
            <View style={[styles.gpaCircleOuter, { borderColor: gpaStatus.color + '30' }]}>
              <View style={[styles.gpaCircleInner, { borderColor: gpaStatus.color }]}>
                <Text style={[styles.gpaValue, { color: gpaStatus.color }]}>{gpaLabel}</Text>
                <Text style={styles.gpaScale}>/4.0</Text>
              </View>
            </View>
            <Text style={[styles.gpaStatusText, { color: gpaStatus.color }]}>{gpaStatus.text}</Text>
            <Text style={styles.gpa10SubText}>Hệ 10: {gpa10Label}</Text>
          </View>

          {/* Stats 2x2 Grid */}
          <View style={styles.gpaStatsGrid}>
            <View style={styles.statGridRow}>
              <View style={styles.gpaStatItem}>
                <View style={styles.statIconBadge}>
                  <Ionicons name="book-outline" size={13} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gpaStatValue}>{totalCourses || 0}</Text>
                  <Text style={styles.gpaStatLabel} numberOfLines={1}>Số môn học</Text>
                </View>
              </View>

              <View style={styles.gpaStatItem}>
                <View style={[styles.statIconBadge, { backgroundColor: Colors.accentBlue + '15' }]}>
                  <Ionicons name="calendar-outline" size={13} color={Colors.accentBlue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gpaStatValue}>{totalSemesters || 0}</Text>
                  <Text style={styles.gpaStatLabel} numberOfLines={1}>Số học kỳ</Text>
                </View>
              </View>
            </View>

            <View style={styles.statGridRow}>
              <View style={styles.gpaStatItem}>
                <View style={[styles.statIconBadge, { backgroundColor: Colors.accentOrange + '15' }]}>
                  <Ionicons name="layers-outline" size={13} color={Colors.accentOrange} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gpaStatValue}>{creditsStudied || 0}</Text>
                  <Text style={styles.gpaStatLabel} numberOfLines={1}>TC đã học</Text>
                </View>
              </View>

              <View style={styles.gpaStatItem}>
                <View style={[styles.statIconBadge, { backgroundColor: Colors.success + '15' }]}>
                  <Ionicons name="checkmark-circle-outline" size={13} color={Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.gpaStatValue, { color: Colors.success }]}>{creditsAccumulated || 0}</Text>
                  <Text style={styles.gpaStatLabel} numberOfLines={1}>TC tích lũy</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.gpaCardDivider} />

        {/* Graduation Progress Section */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <View style={styles.progressHeaderLeft}>
              <Ionicons name="school" size={16} color={Colors.primary} />
              <Text style={styles.progressTitle}>Tiến độ tốt nghiệp</Text>
            </View>
            <View style={styles.progressPercentBadge}>
              <Text style={styles.progressPercentText}>{progressVal.toFixed(1)}%</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(100, Math.max(0, progressVal))}%` }
              ]}
            />
          </View>

          <View style={styles.progressFooter}>
            <Text style={styles.progressFooterText}>
              Đã tích lũy <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{creditsAccumulated || 0}</Text> / {totalRequiredCredits || 150} tín chỉ
            </Text>
            {failedCredits > 0 && (
              <Text style={styles.progressFailedText}>
                (Trừ {failedCredits} TC môn F)
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  // Hiển thị tên kỳ dễ đọc
  const formatSemesterName = (semester, schoolYear) => {
    const semNum = semester?.replace('HocKy', '') || '?';
    return `Học kỳ ${semNum} (${schoolYear || ''})`;
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
          gpa10={summary?.cumulativeGPA10}
          totalCourses={summary?.totalCourses}
          totalSemesters={summary?.totalSemesters}
          creditsStudied={summary?.creditsStudied}
          creditsAccumulated={summary?.creditsAccumulated}
          failedCredits={summary?.failedCredits}
          totalRequiredCredits={summary?.totalRequiredCredits}
          graduationProgress={summary?.graduationProgress}
        />

        {/* Filter Bar */}
        {semesterGroups.length > 0 && (
          <View style={styles.filterSection}>
            {/* Year Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              <Text style={styles.filterLabel}>Năm:</Text>
              {['ALL', ...new Set(semesterGroups.map(g => g.schoolYear).filter(Boolean))].map((yr, yIdx) => (
                <TouchableOpacity
                  key={yIdx}
                  style={[styles.filterChip, selectedYearFilter === yr && styles.filterChipActive]}
                  onPress={() => setSelectedYearFilter(yr)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, selectedYearFilter === yr && styles.filterChipTextActive]}>
                    {yr === 'ALL' ? 'Tất cả năm' : yr}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Semester Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterScroll, { marginTop: 6 }]}>
              <Text style={styles.filterLabel}>Kỳ:</Text>
              {[
                { id: 'ALL', label: 'Tất cả HK' },
                { id: 'HocKy1', label: 'Học kỳ 1' },
                { id: 'HocKy2', label: 'Học kỳ 2' }
              ].map((semItem, sIdx) => (
                <TouchableOpacity
                  key={sIdx}
                  style={[styles.filterChip, selectedSemFilter === semItem.id && styles.filterChipActive]}
                  onPress={() => setSelectedSemFilter(semItem.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, selectedSemFilter === semItem.id && styles.filterChipTextActive]}>
                    {semItem.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Semester Groups */}
        {(() => {
          const filteredGroups = semesterGroups.filter(g => {
            const matchYear = selectedYearFilter === 'ALL' || g.schoolYear === selectedYearFilter;
            const matchSem = selectedSemFilter === 'ALL' || g.semester === selectedSemFilter;
            return matchYear && matchSem;
          });

          if (filteredGroups.length === 0) {
            return (
              <View style={styles.emptyWrap}>
                <Ionicons name="funnel-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Không tìm thấy kết quả phù hợp với bộ lọc!</Text>
              </View>
            );
          }

          return filteredGroups.map((group, idx) => {
            const isExpanded = expandedSemesters[idx] !== false;
            const semCourses = group.courses || [];
            
            // Tính số TC nếu backend chưa enrich
            const studiedCredits = group.creditsStudied != null
              ? group.creditsStudied
              : semCourses.reduce((sum, c) => sum + (Number(c.credits) || 0), 0);
              
            const accumulatedCredits = group.creditsAccumulated != null
              ? group.creditsAccumulated
              : semCourses.filter(c => c.letterGrade !== 'F' && c.totalGrade4 > 0).reduce((sum, c) => sum + (Number(c.credits) || 0), 0);
              
            const failedCreds = group.failedCredits != null ? group.failedCredits : (studiedCredits - accumulatedCredits);

            // Điểm GPA HK
            const semGpaDisplay = group.semesterGPA != null ? group.semesterGPA.toFixed(2) : null;
            const cumGpaDisplay = group.cumulativeGPA != null ? group.cumulativeGPA.toFixed(2) : null;

            return (
              <View key={idx} style={styles.semesterGroup}>
                <TouchableOpacity style={styles.semesterHeader} onPress={() => toggleSemester(idx)} activeOpacity={0.7}>
                  <View style={styles.semesterHeaderLeft}>
                    <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={18} color={Colors.primary} />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                      <Text style={styles.semesterName}>{formatSemesterName(group.semester, group.schoolYear)}</Text>
                      <Text style={styles.semesterSubDesc}>
                        {semCourses.length} môn • {studiedCredits} TC {failedCreds > 0 ? `(TL: ${accumulatedCredits} TC)` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.semesterHeaderRight}>
                    {semGpaDisplay && (
                      <View style={[styles.semGpaBadge, { backgroundColor: getGradeColor(Number(semGpaDisplay) >= 3.2 ? 'A' : Number(semGpaDisplay) >= 2.5 ? 'B' : 'C') + '15' }]}>
                        <Text style={[styles.semGpaText, { color: getGradeColor(Number(semGpaDisplay) >= 3.2 ? 'A' : Number(semGpaDisplay) >= 2.5 ? 'B' : 'C') }]}>
                          GPA: {semGpaDisplay}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>

                {/* Semester Summary Strip (khi mở rộng) */}
                {isExpanded && (
                  <View style={styles.semSummaryStrip}>
                    <View style={styles.semSummaryCol}>
                      <Text style={styles.semSummaryVal}>{studiedCredits} TC</Text>
                      <Text style={styles.semSummaryLbl}>Đã học</Text>
                    </View>
                    <View style={styles.semSummaryDivider} />
                    <View style={styles.semSummaryCol}>
                      <Text style={[styles.semSummaryVal, { color: Colors.success }]}>{accumulatedCredits} TC</Text>
                      <Text style={styles.semSummaryLbl}>Tích lũy</Text>
                    </View>
                    <View style={styles.semSummaryDivider} />
                    <View style={styles.semSummaryCol}>
                      <Text style={[styles.semSummaryVal, { color: Colors.primary }]}>{semGpaDisplay || '--'}</Text>
                      <Text style={styles.semSummaryLbl}>GPA HK</Text>
                    </View>
                    <View style={styles.semSummaryDivider} />
                    <View style={styles.semSummaryCol}>
                      <Text style={[styles.semSummaryVal, { color: Colors.accentPurple }]}>{cumGpaDisplay || '--'}</Text>
                      <Text style={styles.semSummaryLbl}>CPA lũy kế</Text>
                    </View>
                  </View>
                )}

                {/* Danh sách các môn học trong kỳ */}
                {isExpanded && semCourses.map((course, cIdx) => {
                  const gradeColor = getGradeColor(course.letterGrade);
                  const isFailed = course.letterGrade === 'F';

                  return (
                    <View key={cIdx} style={[styles.gradeCard, isFailed && styles.gradeCardFailed]}>
                      <View style={styles.gradeCardHeader}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.gradeCourseName} numberOfLines={2}>{course.courseName}</Text>
                          <View style={styles.courseMetaRow}>
                            {course.courseCode ? (
                              <Text style={styles.courseCodeText}>{course.courseCode}</Text>
                            ) : null}
                            <View style={styles.creditsPill}>
                              <Text style={styles.creditsPillText}>{course.credits || 0} tín chỉ</Text>
                            </View>
                          </View>
                        </View>
                        <View style={[styles.letterBadge, { backgroundColor: gradeColor + '15' }]}>
                          <Text style={[styles.letterText, { color: gradeColor }]}>
                            {course.letterGrade || '-'}
                          </Text>
                        </View>
                      </View>

                      {/* Cảnh báo môn F */}
                      {isFailed && (
                        <View style={styles.failedNotice}>
                          <Ionicons name="alert-circle-outline" size={13} color={Colors.gradeF} />
                          <Text style={styles.failedNoticeText}>
                            Môn học chưa đạt (F) — Không được tính vào tín chỉ tích lũy
                          </Text>
                        </View>
                      )}

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
                        <View style={styles.gradeColDivider} />
                        <View style={styles.gradeCol}>
                          <Text style={[styles.gradeColVal, { color: gradeColor, fontWeight: '800' }]}>
                            {course.totalGrade4 != null ? Number(course.totalGrade4).toFixed(1) : '-'}
                          </Text>
                          <Text style={[styles.gradeColLbl, { color: gradeColor, fontWeight: '600' }]}>TK4</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          });
        })()}
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
    backgroundColor: Colors.surface, margin: 16, borderRadius: 20, padding: 18,
    elevation: 4, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 12,
  },
  gpaTopRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  gpaCircleWrap: { alignItems: 'center', marginRight: 16 },
  gpaCircleOuter: {
    width: 90, height: 90, borderRadius: 45, borderWidth: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  gpaCircleInner: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  gpaValue: { fontSize: 20, fontWeight: '900' },
  gpaScale: { fontSize: 10, color: Colors.textMuted, marginTop: -2 },
  gpaStatusText: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  gpa10SubText: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },
  
  // Stats 2x2 Grid
  gpaStatsGrid: { flex: 1, gap: 8 },
  statGridRow: { flexDirection: 'row', gap: 8 },
  gpaStatItem: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 12, padding: 8,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  statIconBadge: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  gpaStatValue: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  gpaStatLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },

  // GPA Card Divider & Graduation Progress
  gpaCardDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 14 },
  progressSection: { width: '100%' },
  progressHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  progressHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  progressPercentBadge: {
    backgroundColor: Colors.primary + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  progressPercentText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  progressBarTrack: {
    height: 8, borderRadius: 4, backgroundColor: Colors.borderLight, overflow: 'hidden', marginBottom: 6,
  },
  progressBarFill: {
    height: '100%', borderRadius: 4, backgroundColor: Colors.primary,
  },
  progressFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
  },
  progressFooterText: { fontSize: 11, color: Colors.textSecondary },
  progressFailedText: { fontSize: 11, color: Colors.gradeF, fontWeight: '600' },

  // Semester Group
  semesterGroup: { marginTop: 4 },
  semesterHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  semesterHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  semesterName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  semesterSubDesc: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  semesterHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  semGpaBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  semGpaText: { fontSize: 11, fontWeight: '700' },
  
  // Semester Summary Strip
  semSummaryStrip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceElevated,
    marginHorizontal: 16, marginTop: 6, marginBottom: 4, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.borderLight,
  },
  semSummaryCol: { flex: 1, alignItems: 'center' },
  semSummaryVal: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  semSummaryLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  semSummaryDivider: { width: 1, height: 20, backgroundColor: Colors.borderLight },

  // Grade Card
  gradeCard: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginVertical: 4,
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.borderLight,
  },
  gradeCardFailed: {
    borderColor: Colors.gradeF + '40', backgroundColor: '#FFFDFD',
  },
  gradeCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8,
  },
  gradeCourseName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, lineHeight: 19 },
  courseMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  courseCodeText: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  creditsPill: { backgroundColor: Colors.primaryBg, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 },
  creditsPillText: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  letterBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, minWidth: 36, alignItems: 'center' },
  letterText: { fontSize: 13, fontWeight: '800' },
  failedNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.gradeF + '10', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, marginBottom: 8,
  },
  failedNoticeText: { fontSize: 10, color: Colors.gradeF, fontWeight: '600', flex: 1 },
  gradeGrid: { flexDirection: 'row', alignItems: 'center' },
  gradeCol: { flex: 1, alignItems: 'center' },
  gradeColVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  gradeColLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  gradeColDivider: { width: 1, height: 24, backgroundColor: Colors.borderLight },

  // Filter Section
  filterSection: {
    marginHorizontal: 16, marginBottom: 12, padding: 10,
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  filterScroll: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  filterLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginRight: 4 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.borderLight,
  },
  filterChipActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
  },
  filterChipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.textOnPrimary },
  
  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 12 },
  emptySubText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
});
