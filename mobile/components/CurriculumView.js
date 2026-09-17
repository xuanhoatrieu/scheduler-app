import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getCurriculum } from '../services/api';
import { Colors } from '../theme/colors';

const STATUS_CONFIG = {
  passed: {
    color: Colors.gradeA || '#059669',
    bgColor: '#ECFDF5',
    icon: 'checkmark-circle',
    label: 'Đã đạt',
  },
  failed: {
    color: Colors.gradeF || '#DC2626',
    bgColor: '#FEF2F2',
    icon: 'close-circle',
    label: 'Học lại',
  },
  studying: {
    color: Colors.warning || '#D97706',
    bgColor: '#FFFBEB',
    icon: 'time',
    label: 'Đang học',
  },
  not_started: {
    color: Colors.textMuted || '#9CA3AF',
    bgColor: '#F3F4F6',
    icon: 'ellipse-outline',
    label: 'Chưa học',
  },
};

export default function CurriculumView({ user }) {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [gradReqs, setGradReqs] = useState(null);
  const [byBlock, setByBlock] = useState([]);
  const [bySemester, setBySemester] = useState([]);
  const [viewMode, setViewMode] = useState('semester'); // 'semester' | 'block'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  const loadData = async (force = false) => {
    const res = await getCurriculum(force);
    if (res.success) {
      setData(res.data || []);
      setSummary(res.summary || null);
      setGradReqs(res.graduationRequirements || null);
      setByBlock(res.byBlock || []);
      setBySemester(res.bySemester || []);

      // Auto-expand all groups
      const initialExpanded = {};
      const activeList = viewMode === 'semester' ? (res.bySemester || []) : (res.byBlock || []);
      activeList.forEach((_, idx) => {
        initialExpanded[idx] = true;
      });
      setExpandedGroups(initialExpanded);
    }
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  // Update auto-expand when switching view mode
  const handleSwitchViewMode = (mode) => {
    setViewMode(mode);
    const initialExpanded = {};
    const activeList = mode === 'semester' ? bySemester : byBlock;
    activeList.forEach((_, idx) => {
      initialExpanded[idx] = true;
    });
    setExpandedGroups(initialExpanded);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, [viewMode]);

  const toggleGroup = (idx) => {
    setExpandedGroups((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Đang tải khung chương trình đào tạo...</Text>
      </View>
    );
  }

  const currentGroups = viewMode === 'semester' ? bySemester : byBlock;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
      }
    >
      {/* 1. Progress Summary Card */}
      {summary && (
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.tagStandardRow}>
                <Text style={styles.progressTitle}>Tiến độ tốt nghiệp chuẩn</Text>
                {summary.isStandardCurriculum && (
                  <View style={styles.badgeStandard}>
                    <Text style={styles.badgeStandardText}>Khung QĐ chuẩn</Text>
                  </View>
                )}
              </View>
              <Text style={styles.progressSubtitle}>
                <Text style={styles.progressHighlight}>{summary.passedCredits}</Text> /{' '}
                {summary.totalCredits} tín chỉ tích lũy
              </Text>
              <Text style={styles.progressConditionNote}>
                * Không tính 3 TC GDTC & GDQP (môn điều kiện bắt buộc)
              </Text>
            </View>
            <View style={styles.progressCircle}>
              <Text style={styles.progressPercent}>{summary.progressPercent}%</Text>
              <Text style={styles.progressPercentSub}>hoàn thành</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(summary.progressPercent || 0, 100)}%` },
              ]}
            />
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: STATUS_CONFIG.passed.color }]} />
              <Text style={styles.statText}>
                Đạt: {data.filter((d) => d.status === 'passed' && !d.isCondition).length} môn
              </Text>
            </View>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: STATUS_CONFIG.studying.color }]} />
              <Text style={styles.statText}>Đang học: {summary.studyingCount || 0}</Text>
            </View>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: STATUS_CONFIG.failed.color }]} />
              <Text style={styles.statText}>Học lại: {summary.failedCount || 0}</Text>
            </View>
          </View>
        </View>
      )}

      {/* 2. Chuẩn đầu ra & Điều kiện tốt nghiệp (Graduation Requirements) */}
      {gradReqs && (
        <View style={styles.reqCard}>
          <View style={styles.reqCardHeader}>
            <View style={styles.reqTitleGroup}>
              <Ionicons name="ribbon-outline" size={20} color={Colors.primary} />
              <Text style={styles.reqCardTitle}>Chuẩn đầu ra & Điều kiện ra trường</Text>
            </View>
            <View
              style={[
                styles.reqOverallBadge,
                { backgroundColor: gradReqs.allMet ? '#ECFDF5' : '#FFFBEB' },
              ]}
            >
              <Ionicons
                name={gradReqs.allMet ? 'checkmark-circle' : 'alert-circle'}
                size={14}
                color={gradReqs.allMet ? '#059669' : '#D97706'}
              />
              <Text
                style={[
                  styles.reqOverallText,
                  { color: gradReqs.allMet ? '#059669' : '#D97706' },
                ]}
              >
                {gradReqs.allMet ? 'Đủ điều kiện' : 'Cần hoàn thiện'}
              </Text>
            </View>
          </View>

          {/* 2.1 Giáo dục thể chất */}
          {gradReqs.gdtc && (
            <View style={styles.reqItem}>
              <View style={styles.reqItemTop}>
                <View style={styles.reqItemLabelWrap}>
                  <Ionicons
                    name="fitness-outline"
                    size={16}
                    color={gradReqs.gdtc.isMet ? '#059669' : '#D97706'}
                  />
                  <Text style={styles.reqItemTitle}>1. Giáo dục thể chất (GDTC)</Text>
                </View>
                <View
                  style={[
                    styles.reqItemBadge,
                    { backgroundColor: gradReqs.gdtc.isMet ? '#ECFDF5' : '#FFFBEB' },
                  ]}
                >
                  <Text
                    style={[
                      styles.reqItemBadgeText,
                      { color: gradReqs.gdtc.isMet ? '#059669' : '#D97706' },
                    ]}
                  >
                    {gradReqs.gdtc.isMet ? 'Đạt (3/3 TC)' : `${gradReqs.gdtc.earnedCredits || 0}/3 TC`}
                  </Text>
                </View>
              </View>
              <Text style={styles.reqItemDesc}>{gradReqs.gdtc.details}</Text>
              {gradReqs.gdtc.courses && gradReqs.gdtc.courses.length > 0 && (
                <View style={styles.chipsWrap}>
                  {gradReqs.gdtc.courses.map((c, i) => (
                    <View key={i} style={styles.courseChip}>
                      <Text style={styles.courseChipText}>
                        {c.courseName}: Điểm {c.letterGrade || 'Qua'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* 2.2 Giáo dục quốc phòng */}
          {gradReqs.gdqp && (
            <View style={styles.reqItem}>
              <View style={styles.reqItemTop}>
                <View style={styles.reqItemLabelWrap}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={16}
                    color={gradReqs.gdqp.isMet ? '#059669' : '#DC2626'}
                  />
                  <Text style={styles.reqItemTitle}>2. Giáo dục quốc phòng - An ninh</Text>
                </View>
                <View
                  style={[
                    styles.reqItemBadge,
                    { backgroundColor: gradReqs.gdqp.isMet ? '#ECFDF5' : '#FEF2F2' },
                  ]}
                >
                  <Text
                    style={[
                      styles.reqItemBadgeText,
                      { color: gradReqs.gdqp.isMet ? '#059669' : '#DC2626' },
                    ]}
                  >
                    {gradReqs.gdqp.isMet ? 'Đã hoàn thành' : 'Chưa có điểm'}
                  </Text>
                </View>
              </View>
              <Text style={styles.reqItemDesc}>{gradReqs.gdqp.details}</Text>
            </View>
          )}

          {/* 2.3 Chuẩn Tin học */}
          {gradReqs.tinHoc && (
            <View style={styles.reqItem}>
              <View style={styles.reqItemTop}>
                <View style={styles.reqItemLabelWrap}>
                  <Ionicons
                    name="hardware-chip-outline"
                    size={16}
                    color={gradReqs.tinHoc.isMet ? '#059669' : '#D97706'}
                  />
                  <Text style={styles.reqItemTitle}>3. Chuẩn đầu ra Tin học (≥ Điểm C)</Text>
                </View>
                <View
                  style={[
                    styles.reqItemBadge,
                    { backgroundColor: gradReqs.tinHoc.isMet ? '#ECFDF5' : '#FFFBEB' },
                  ]}
                >
                  <Text
                    style={[
                      styles.reqItemBadgeText,
                      { color: gradReqs.tinHoc.isMet ? '#059669' : '#D97706' },
                    ]}
                  >
                    {gradReqs.tinHoc.isMet
                      ? `Đạt (${gradReqs.tinHoc.currentGrade})`
                      : (gradReqs.tinHoc.currentGrade ? `Điểm ${gradReqs.tinHoc.currentGrade} (Chưa đạt)` : 'Chưa học')}
                  </Text>
                </View>
              </View>
              <Text style={styles.reqCourseNote}>
                Môn: {gradReqs.tinHoc.courseName} ({gradReqs.tinHoc.courseCode})
              </Text>
              <Text style={styles.reqItemDesc}>{gradReqs.tinHoc.details}</Text>
            </View>
          )}

          {/* 2.4 Chuẩn Ngoại ngữ */}
          {gradReqs.ngoaiNgu && (
            <View style={[styles.reqItem, { borderBottomWidth: 0, paddingBottom: 0 }]}>
              <View style={styles.reqItemTop}>
                <View style={styles.reqItemLabelWrap}>
                  <Ionicons
                    name="language-outline"
                    size={16}
                    color={gradReqs.ngoaiNgu.isMet ? '#059669' : '#D97706'}
                  />
                  <Text style={styles.reqItemTitle}>4. Chuẩn đầu ra Ngoại ngữ (≥ Điểm C)</Text>
                </View>
                <View
                  style={[
                    styles.reqItemBadge,
                    { backgroundColor: gradReqs.ngoaiNgu.isMet ? '#ECFDF5' : '#FFFBEB' },
                  ]}
                >
                  <Text
                    style={[
                      styles.reqItemBadgeText,
                      { color: gradReqs.ngoaiNgu.isMet ? '#059669' : '#D97706' },
                    ]}
                  >
                    {gradReqs.ngoaiNgu.isMet ? 'Đạt cả 3 học phần' : 'Chưa đạt chuẩn C'}
                  </Text>
                </View>
              </View>
              <Text style={styles.reqCourseNote}>
                Yêu cầu: Cả 3 học phần Tiếng Anh 1, 2, 3 đều phải đạt từ điểm C trở lên
              </Text>
              {gradReqs.ngoaiNgu.courses && (
                <View style={styles.subCourseList}>
                  {gradReqs.ngoaiNgu.courses.map((c, i) => (
                    <View key={i} style={styles.subCourseRow}>
                      <Ionicons
                        name={c.isMet ? 'checkmark-circle' : 'close-circle'}
                        size={14}
                        color={c.isMet ? '#059669' : '#DC2626'}
                      />
                      <Text style={styles.subCourseName}>
                        {c.courseName} ({c.courseCode}):
                      </Text>
                      <Text
                        style={[
                          styles.subCourseGrade,
                          { color: c.isMet ? '#059669' : '#DC2626' },
                        ]}
                      >
                        {c.letterGrade ? `Điểm ${c.letterGrade} (${c.isMet ? 'Đạt' : 'Chưa đạt C'})` : 'Chưa học'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* 3. Dual-View Segmented Control */}
      <View style={styles.viewModeContainer}>
        <TouchableOpacity
          style={[
            styles.viewModeTab,
            viewMode === 'semester' && styles.viewModeTabActive,
          ]}
          onPress={() => handleSwitchViewMode('semester')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={viewMode === 'semester' ? '#FFFFFF' : Colors.textSecondary}
          />
          <Text
            style={[
              styles.viewModeTabText,
              viewMode === 'semester' && styles.viewModeTabTextActive,
            ]}
          >
            Theo học kỳ
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.viewModeTab,
            viewMode === 'block' && styles.viewModeTabActive,
          ]}
          onPress={() => handleSwitchViewMode('block')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="library-outline"
            size={16}
            color={viewMode === 'block' ? '#FFFFFF' : Colors.textSecondary}
          />
          <Text
            style={[
              styles.viewModeTabText,
              viewMode === 'block' && styles.viewModeTabTextActive,
            ]}
          >
            Theo khối kiến thức
          </Text>
        </TouchableOpacity>
      </View>

      {/* 4. Groups Accordion (bySemester or byBlock) */}
      {currentGroups.length > 0 ? (
        currentGroups.map((group, groupIdx) => {
          const isExpanded = expandedGroups[groupIdx] !== false;
          const groupName =
            viewMode === 'semester'
              ? group.semesterName || `Học kỳ ${group.semester}`
              : group.blockName || 'Khối kiến thức';
          const items = group.courses || [];
          const totalTC = group.totalCredits || 0;
          const passedTC = group.passedCredits || 0;
          const passedCount = group.passedCourses || 0;

          return (
            <View key={groupIdx} style={styles.groupCard}>
              <TouchableOpacity
                style={styles.groupHeader}
                onPress={() => toggleGroup(groupIdx)}
                activeOpacity={0.7}
              >
                <View style={styles.groupHeaderLeft}>
                  <Ionicons
                    name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                    size={18}
                    color={Colors.primary}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.groupName} numberOfLines={2}>
                      {groupName}
                    </Text>
                    <Text style={styles.groupMeta}>
                      {passedCount}/{items.length} môn • {passedTC}/{totalTC} TC
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {isExpanded &&
                items.map((course, cIdx) => {
                  const config = STATUS_CONFIG[course.status] || STATUS_CONFIG.not_started;
                  return (
                    <View
                      key={cIdx}
                      style={[
                        styles.courseCard,
                        { borderLeftColor: config.color },
                      ]}
                    >
                      <View style={styles.courseCardLeft}>
                        <Ionicons name={config.icon} size={18} color={config.color} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <View style={styles.courseNameRow}>
                            <Text style={styles.courseCardName}>{course.courseName}</Text>
                          </View>
                          <View style={styles.courseInfoRow}>
                            <Text style={styles.courseCardCredits}>
                              {course.credits > 0 ? `${course.credits} TC` : ''}
                              {course.courseCode ? ` • ${course.courseCode}` : ''}
                            </Text>
                            {course.isCondition && (
                              <View style={styles.conditionTag}>
                                <Text style={styles.conditionTagText}>Điều kiện</Text>
                              </View>
                            )}
                            {course.isElective && (
                              <View style={styles.electiveTag}>
                                <Text style={styles.electiveTagText}>Tự chọn</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                      <View style={[styles.gradeBadge, { backgroundColor: config.bgColor }]}>
                        <Text style={[styles.gradeText, { color: config.color }]}>
                          {course.letterGrade || config.label}
                        </Text>
                      </View>
                    </View>
                  );
                })}
            </View>
          );
        })
      ) : (
        <View style={styles.emptyWrap}>
          <Ionicons name="school-outline" size={64} color={Colors.borderLight} />
          <Text style={styles.emptyText}>Chưa có dữ liệu CTĐT!</Text>
          <Text style={styles.emptySubText}>Bấm kéo xuống để làm mới dữ liệu</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontSize: 14 },

  // Progress Card
  progressCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 20,
    padding: 18,
    elevation: 3,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  tagStandardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  progressTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  badgeStandard: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  badgeStandardText: { fontSize: 10, fontWeight: '700', color: '#2E7D32' },
  progressSubtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  progressHighlight: { fontSize: 18, fontWeight: '900', color: Colors.primary },
  progressConditionNote: { fontSize: 11, color: Colors.textMuted, marginTop: 3, fontStyle: 'italic' },
  progressCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
    marginLeft: 10,
  },
  progressPercent: { fontSize: 16, fontWeight: '900', color: Colors.primary },
  progressPercentSub: { fontSize: 9, color: Colors.primary, fontWeight: '600', marginTop: -2 },
  progressBarBg: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    height: 8,
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },

  // Graduation Requirements Card
  reqCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 18,
    padding: 16,
    elevation: 3,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reqCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  reqTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  reqCardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  reqOverallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  reqOverallText: { fontSize: 11, fontWeight: '700' },
  reqItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  reqItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reqItemLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  reqItemTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  reqItemBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  reqItemBadgeText: { fontSize: 11, fontWeight: '700' },
  reqItemDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 3, lineHeight: 16 },
  reqCourseNote: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  courseChip: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  courseChipText: { fontSize: 11, color: '#166534', fontWeight: '600' },
  subCourseList: { marginTop: 6, gap: 4 },
  subCourseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subCourseName: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  subCourseGrade: { fontSize: 11, fontWeight: '700' },

  // Dual-View Segmented Control
  viewModeContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
  },
  viewModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  viewModeTabActive: {
    backgroundColor: Colors.primary,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  viewModeTabText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  viewModeTabTextActive: { color: '#FFFFFF', fontWeight: '700' },

  // Group Accordion
  groupCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  groupHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  groupName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, lineHeight: 18 },
  groupMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  // Course Card
  courseCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  courseCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  courseNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  courseCardName: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, lineHeight: 17 },
  courseInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  courseCardCredits: { fontSize: 11, color: Colors.textMuted },
  conditionTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  conditionTagText: { fontSize: 9, color: '#B45309', fontWeight: '700' },
  electiveTag: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  electiveTagText: { fontSize: 9, color: '#4338CA', fontWeight: '700' },
  gradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 44,
    alignItems: 'center',
    marginLeft: 8,
  },
  gradeText: { fontSize: 11, fontWeight: '700' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 12 },
  emptySubText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
});
