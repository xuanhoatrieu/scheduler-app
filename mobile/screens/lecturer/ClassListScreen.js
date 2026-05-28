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
import { getLecturerClasses } from '../../services/api';
import { Colors } from '../../theme/colors';

export default function ClassListScreen({ user }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState({});

  const loadData = async () => {
    const res = await getLecturerClasses();
    if (res.success) {
      setClasses(res.data || []);
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

  const toggleExpand = (idx) => {
    setExpandedIdx(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải danh sách lớp...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Lớp Học</Text>
          <Text style={styles.headerSubtitle}>Các lớp đang phụ trách</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{classes.length}</Text>
          <Text style={styles.countLabel}>lớp</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {classes.length > 0 ? (
          classes.map((cls, idx) => {
            const isExpanded = expandedIdx[idx];
            return (
              <TouchableOpacity
                key={idx}
                style={styles.card}
                onPress={() => toggleExpand(idx)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseName}>{cls.courseName}</Text>
                    <Text style={styles.classCode}>{cls.classCode}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <View style={styles.creditBadge}>
                      <Text style={styles.creditText}>{cls.credits || '?'} TC</Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.textMuted}
                    />
                  </View>
                </View>

                {isExpanded && cls.schedules && cls.schedules.length > 0 && (
                  <View style={styles.detailSection}>
                    <View style={styles.divider} />
                    <Text style={styles.detailTitle}>Lịch dạy chi tiết:</Text>
                    {cls.schedules.map((sch, sIdx) => (
                      <View key={sIdx} style={styles.detailRow}>
                        <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                        <Text style={styles.detailText}>
                          Thứ {sch.dayOfWeek} • {sch.studyTime || 'Chưa rõ'} • {sch.room || ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.semesterRow}>
                  <Ionicons name="bookmark-outline" size={12} color={Colors.textMuted} />
                  <Text style={styles.semesterText}>{cls.semester} — {cls.schoolYear}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={64} color={Colors.borderLight} />
            <Text style={styles.emptyText}>Chưa có lớp nào!</Text>
            <Text style={styles.emptySubText}>Đồng bộ lịch dạy để cập nhật danh sách lớp</Text>
          </View>
        )}
      </ScrollView>
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
  countBadge: {
    alignItems: 'center', backgroundColor: Colors.primary,
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center',
    elevation: 3, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  countText: { fontSize: 18, fontWeight: '800', color: Colors.textOnPrimary },
  countLabel: { fontSize: 9, color: Colors.textOnPrimary, marginTop: -2 },
  card: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginTop: 12,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.borderLight,
    elevation: 2, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  courseName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, lineHeight: 21 },
  classCode: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  cardRight: { alignItems: 'center', gap: 6 },
  creditBadge: {
    backgroundColor: Colors.primary + '12', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8,
  },
  creditText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  detailSection: { marginTop: 8 },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 8 },
  detailTitle: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  detailText: { fontSize: 12, color: Colors.textPrimary },
  semesterRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  semesterText: { fontSize: 11, color: Colors.textMuted },
  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 16 },
  emptySubText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
});
