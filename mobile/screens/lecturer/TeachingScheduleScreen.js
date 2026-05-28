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
import { getSchedule } from '../../services/api';
import { Colors, getDayColor } from '../../theme/colors';

const DAY_NAMES = { 2: 'Thứ 2', 3: 'Thứ 3', 4: 'Thứ 4', 5: 'Thứ 5', 6: 'Thứ 6', 7: 'Thứ 7', 8: 'CN' };

export default function TeachingScheduleScreen({ user }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (forceSync = false) => {
    const res = await getSchedule(forceSync);
    if (res.success) {
      setSchedules(res.data || []);
    }
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, []);

  // Nhóm lịch dạy theo ngày trong tuần
  const groupByDay = () => {
    const groups = {};
    for (const s of schedules) {
      const day = s.dayOfWeek || 2;
      if (!groups[day]) groups[day] = [];
      groups[day].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => a - b);
  };

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Lịch Giảng Dạy</Text>
          <Text style={styles.headerSubtitle}>{user?.fullName || 'Giảng viên TUAF'}</Text>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color={Colors.textOnPrimary} />
          ) : (
            <Ionicons name="sync-outline" size={18} color={Colors.textOnPrimary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {schedules.length > 0 ? (
          groupByDay().map(([day, items]) => (
            <View key={day} style={styles.dayGroup}>
              <View style={[styles.dayHeader, { borderLeftColor: getDayColor(parseInt(day)) }]}>
                <Text style={styles.dayName}>{DAY_NAMES[day] || `Thứ ${day}`}</Text>
                <Text style={styles.dayCount}>{items.length} lớp</Text>
              </View>
              {items.map((item, idx) => (
                <View key={idx} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.courseName}>{item.courseName}</Text>
                      {item.classCode ? <Text style={styles.classCode}>{item.classCode}</Text> : null}
                    </View>
                    <View style={styles.creditBadge}>
                      <Text style={styles.creditText}>{item.credits || '?'} TC</Text>
                    </View>
                  </View>
                  <View style={styles.cardDetails}>
                    <View style={styles.detailItem}>
                      <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                      <Text style={styles.detailText}>{item.studyTime || 'Chưa rõ'}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                      <Text style={styles.detailText}>{item.room || 'Chưa rõ'}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ))
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="calendar-outline" size={64} color={Colors.borderLight} />
            <Text style={styles.emptyText}>Chưa có lịch giảng dạy!</Text>
            <Text style={styles.emptySubText}>Bấm đồng bộ để cập nhật từ cổng trường</Text>
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
  syncBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  dayGroup: { marginTop: 8 },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: Colors.surface, borderLeftWidth: 4,
  },
  dayName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  dayCount: { fontSize: 12, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginVertical: 4,
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.borderLight,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  courseName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, lineHeight: 20 },
  classCode: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  creditBadge: {
    backgroundColor: Colors.primary + '12', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, marginLeft: 8,
  },
  creditText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  cardDetails: { flexDirection: 'row', gap: 16, marginTop: 10 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { fontSize: 12, color: Colors.textMuted },
  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 16 },
  emptySubText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
});
