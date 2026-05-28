import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getExams } from '../services/api';
import { Colors } from '../theme/colors';

export default function ExamsScreen({ user }) {
  const [examData, setExamData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (forceSync = false) => {
    const res = await getExams(forceSync);
    if (res.success) setExamData(res.data);
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  }, []);

  // Tính countdown đến ngày thi
  const getCountdown = (dateStr) => {
    if (!dateStr) return null;
    // Try parsing various date formats
    const parts = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (!parts) return null;
    const examDate = new Date(parseInt(parts[3]), parseInt(parts[2]) - 1, parseInt(parts[1]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getCountdownStyle = (days) => {
    if (days === null) return { bg: Colors.borderLight, text: Colors.textMuted };
    if (days < 0) return { bg: '#F3F4F6', text: Colors.textMuted };
    if (days <= 3) return { bg: '#FEE2E2', text: Colors.danger };
    if (days <= 7) return { bg: '#FEF3C7', text: Colors.warning };
    return { bg: Colors.primaryBg, text: Colors.primary };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải lịch thi...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Lịch Thi</Text>
          <Text style={styles.headerSubtitle}>Học kỳ 2 • 2025-2026</Text>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color={Colors.textOnPrimary} />
          ) : (
            <Ionicons name="sync-outline" size={18} color={Colors.textOnPrimary} />
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={examData}
        keyExtractor={(item, index) => item.id || index.toString()}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        renderItem={({ item }) => {
          const countdown = getCountdown(item.examDate);
          const countStyle = getCountdownStyle(countdown);

          return (
            <View style={styles.examCard}>
              <View style={styles.examHeader}>
                <View style={styles.examHeaderLeft}>
                  <View style={[styles.examIcon, { backgroundColor: Colors.accentPurple + '15' }]}>
                    <Ionicons name="document-text" size={20} color={Colors.accentPurple} />
                  </View>
                  <Text style={styles.examCourseName} numberOfLines={2}>{item.courseName}</Text>
                </View>
                {countdown !== null && (
                  <View style={[styles.countdownBadge, { backgroundColor: countStyle.bg }]}>
                    <Text style={[styles.countdownText, { color: countStyle.text }]}>
                      {countdown < 0 ? 'Đã thi' : countdown === 0 ? 'Hôm nay' : `${countdown} ngày`}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.examBody}>
                <View style={styles.examInfoRow}>
                  <Ionicons name="calendar-outline" size={15} color={Colors.accentBlue} />
                  <Text style={styles.examInfoLabel}>Ngày thi</Text>
                  <Text style={styles.examInfoValue}>{item.examDate || 'Chưa xác định'}</Text>
                </View>
                <View style={styles.examInfoRow}>
                  <Ionicons name="time-outline" size={15} color={Colors.accentOrange} />
                  <Text style={styles.examInfoLabel}>Ca thi</Text>
                  <Text style={styles.examInfoValue}>{item.examTime || 'Chưa xác định'}</Text>
                </View>
                <View style={styles.examInfoRow}>
                  <Ionicons name="location-outline" size={15} color={Colors.accentPink} />
                  <Text style={styles.examInfoLabel}>Phòng</Text>
                  <Text style={styles.examInfoValue}>{item.room || 'Chưa xếp'}</Text>
                </View>
                {item.seatNumber ? (
                  <View style={styles.examInfoRow}>
                    <Ionicons name="person-outline" size={15} color={Colors.success} />
                    <Text style={styles.examInfoLabel}>SBD</Text>
                    <Text style={styles.examInfoValue}>{item.seatNumber}</Text>
                  </View>
                ) : null}
              </View>

              {item.examFormat ? (
                <View style={styles.examFooter}>
                  <View style={styles.formatBadge}>
                    <Text style={styles.formatText}>{item.examFormat}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="document-text-outline" size={64} color={Colors.borderLight} />
            <Text style={styles.emptyText}>Chưa có thông tin lịch thi!</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={onRefresh}>
              <Text style={styles.emptyBtnText}>Đồng bộ ngay</Text>
            </TouchableOpacity>
          </View>
        }
      />
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
  examCard: {
    backgroundColor: Colors.surface, borderRadius: 18, padding: 18, marginBottom: 12,
    elevation: 3, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8,
  },
  examHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  examHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  examIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  examCourseName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flex: 1, lineHeight: 20 },
  countdownBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  countdownText: { fontSize: 11, fontWeight: '700' },
  examBody: { gap: 8 },
  examInfoRow: { flexDirection: 'row', alignItems: 'center' },
  examInfoLabel: { fontSize: 13, color: Colors.textSecondary, marginLeft: 8, width: 70 },
  examInfoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  examFooter: { marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10 },
  formatBadge: { backgroundColor: Colors.primaryBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  formatText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 16 },
  emptyBtn: { marginTop: 16, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { color: Colors.textOnPrimary, fontWeight: '700', fontSize: 14 },
});
