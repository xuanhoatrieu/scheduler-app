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
    color: Colors.gradeA || '#22C55E',
    bgColor: (Colors.gradeA || '#22C55E') + '12',
    icon: 'checkmark-circle',
    label: 'Đã đạt',
  },
  failed: {
    color: Colors.gradeF || '#EF4444',
    bgColor: (Colors.gradeF || '#EF4444') + '12',
    icon: 'close-circle',
    label: 'Học lại',
  },
  studying: {
    color: Colors.warning || '#F59E0B',
    bgColor: (Colors.warning || '#F59E0B') + '12',
    icon: 'time',
    label: 'Đang học',
  },
  not_started: {
    color: Colors.textMuted || '#9CA3AF',
    bgColor: Colors.background || '#F3F4F6',
    icon: 'ellipse-outline',
    label: 'Chưa học',
  },
};

export default function CurriculumView({ user }) {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedBlocks, setExpandedBlocks] = useState({});

  const loadData = async () => {
    const res = await getCurriculum();
    if (res.success) {
      setData(res.data || []);
      setSummary(res.summary || null);
      // Auto-expand all blocks
      const blocks = {};
      const grouped = groupByBlock(res.data || []);
      grouped.forEach((_, idx) => { blocks[idx] = true; });
      setExpandedBlocks(blocks);
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

  const toggleBlock = (idx) => {
    setExpandedBlocks(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Nhóm theo knowledgeBlock
  const groupByBlock = (items) => {
    const groups = {};
    for (const item of items) {
      const block = item.knowledgeBlock || 'Chung';
      if (!groups[block]) groups[block] = [];
      groups[block].push(item);
    }
    return Object.entries(groups);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Đang tải chương trình đào tạo...</Text>
      </View>
    );
  }

  const grouped = groupByBlock(data);

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
      }
    >
      {/* Progress Summary Card */}
      {summary && (
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.progressTitle}>Tiến độ học tập</Text>
              <Text style={styles.progressSubtitle}>
                {summary.passedCredits}/{summary.totalCredits} tín chỉ
              </Text>
            </View>
            <View style={styles.progressCircle}>
              <Text style={styles.progressPercent}>{summary.progressPercent}%</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(summary.progressPercent, 100)}%` }
              ]}
            />
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: STATUS_CONFIG.passed.color }]} />
              <Text style={styles.statText}>
                Đạt: {data.filter(d => d.status === 'passed').length}
              </Text>
            </View>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: STATUS_CONFIG.studying.color }]} />
              <Text style={styles.statText}>
                Đang học: {summary.studyingCount}
              </Text>
            </View>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: STATUS_CONFIG.failed.color }]} />
              <Text style={styles.statText}>
                Học lại: {summary.failedCount}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Knowledge Block Groups */}
      {grouped.length > 0 ? (
        grouped.map(([blockName, items], blockIdx) => {
          const isExpanded = expandedBlocks[blockIdx];
          const passedInBlock = items.filter(i => i.status === 'passed').length;
          const blockCredits = items.reduce((s, i) => s + (i.credits || 0), 0);

          return (
            <View key={blockIdx} style={styles.blockGroup}>
              <TouchableOpacity
                style={styles.blockHeader}
                onPress={() => toggleBlock(blockIdx)}
                activeOpacity={0.7}
              >
                <View style={styles.blockHeaderLeft}>
                  <Ionicons
                    name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                    size={18}
                    color={Colors.primary}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.blockName} numberOfLines={2}>{blockName}</Text>
                    <Text style={styles.blockMeta}>
                      {passedInBlock}/{items.length} môn • {blockCredits} TC
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {isExpanded && items.map((course, cIdx) => {
                const config = STATUS_CONFIG[course.status] || STATUS_CONFIG.not_started;
                return (
                  <View key={cIdx} style={[styles.courseCard, { borderLeftColor: config.color }]}>
                    <View style={styles.courseCardLeft}>
                      <Ionicons name={config.icon} size={18} color={config.color} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.courseCardName}>{course.courseName}</Text>
                        <Text style={styles.courseCardCredits}>
                          {course.credits > 0 ? `${course.credits} TC` : ''}
                          {course.courseCode ? ` • ${course.courseCode}` : ''}
                        </Text>
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
          <Text style={styles.emptySubText}>Bấm đồng bộ trong Hồ sơ để cập nhật</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontSize: 14 },
  // Progress Card
  progressCard: {
    backgroundColor: Colors.surface, margin: 16, borderRadius: 20, padding: 20,
    elevation: 4, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 12,
  },
  progressHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  progressTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  progressSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  progressCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: Colors.primary,
  },
  progressPercent: { fontSize: 15, fontWeight: '900', color: Colors.primary },
  progressBarBg: {
    height: 8, backgroundColor: Colors.background, borderRadius: 4, overflow: 'hidden',
  },
  progressBarFill: {
    height: 8, backgroundColor: Colors.primary, borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around', marginTop: 14,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  // Block Group
  blockGroup: { marginTop: 4 },
  blockHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  blockHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  blockName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, lineHeight: 18 },
  blockMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  // Course Card
  courseCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, marginHorizontal: 16, marginVertical: 3,
    borderRadius: 12, padding: 12, borderLeftWidth: 3,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  courseCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  courseCardName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, lineHeight: 18 },
  courseCardCredits: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  gradeBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    minWidth: 50, alignItems: 'center', marginLeft: 8,
  },
  gradeText: { fontSize: 12, fontWeight: '700' },
  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 16 },
  emptySubText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
});
