import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
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
import { getDashboardReport, getDashboardToday } from '../../services/api';
import { Colors } from '../../theme/colors';

const STATUS_COLORS = {
  on_time: Colors.success,
  late: Colors.danger,
  early_leave: Colors.warning,
  absent: Colors.danger,
  exempt: Colors.info,
  pending: Colors.textMuted,
};

const STATUS_LABELS = {
  on_time: 'Dung gio',
  late: 'Di muon',
  early_leave: 'Ve som',
  absent: 'Vang mat',
  exempt: 'Duoc mien',
  pending: 'Chua ghi',
};

const PIE_SIZE = 120;

const formatTime = (dateStr) => {
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

function StatCircle({ value, color, label }) {
  return (
    <View style={styles.circleStat}>
      <View style={[styles.circle, { borderColor: color }]}>
        <Text style={[styles.circleValue, { color }]}>{value}</Text>
      </View>
      <Text style={styles.circleLabel}>{label}</Text>
    </View>
  );
}

function PieChart({ data, size = PIE_SIZE }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <View style={[styles.pieContainer, { width: size, height: size }]}>
        <View style={[styles.pieCircle, { backgroundColor: Colors.borderLight }]} />
      </View>
    );
  }

  let cumulative = 0;
  const segments = data.filter(d => d.value > 0).map(d => {
    const start = cumulative / total;
    cumulative += d.value;
    const end = cumulative / total;
    return { ...d, start, end };
  });

  return (
    <View style={[styles.pieContainer, { width: size, height: size }]}>
      {segments.map((seg, idx) => {
        const rotation = seg.start * 360;
        const arc = (seg.end - seg.start) * 360;
        return (
          <View
            key={idx}
            style={[
              styles.pieSlice,
              {
                width: size, height: size,
                transform: [{ rotate: `${rotation}deg` }],
              },
            ]}
          >
            <View
              style={[
                styles.pieArc,
                {
                  width: size, height: size,
                  borderColor: seg.color,
                  borderWidth: size * 0.25,
                  borderRadius: size / 2,
                  transform: [{ rotate: `${arc}deg` }],
                },
              ]}
            />
          </View>
        );
      })}
      <View style={[styles.pieCenter, { width: size * 0.5, height: size * 0.5 }]}>
        <Text style={styles.pieTotal}>{total}</Text>
        <Text style={styles.pieTotalLabel}>Lop</Text>
      </View>
    </View>
  );
}

export default function InspectorDashboardScreen({ user }) {
  const [activeTab, setActiveTab] = useState('today');
  const [todayData, setTodayData] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  const loadToday = async () => {
    const res = await getDashboardToday();
    if (res.success) setTodayData(res);
  };

  const loadReport = async (period) => {
    const res = await getDashboardReport({ period });
    if (res.success) setReportData(res);
  };

  useEffect(() => {
    Promise.all([loadToday(), loadReport(selectedPeriod)])
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadToday(), loadReport(selectedPeriod)]);
    setRefreshing(false);
  }, [selectedPeriod]);

  const onPeriodChange = async (period) => {
    setSelectedPeriod(period);
    await loadReport(period);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Dang tai bao cao...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const todaySummary = todayData?.summary || {};
  const todayDetails = todayData?.details || [];
  const reportSummary = reportData?.summary || {};
  const byLecturer = reportData?.byLecturer || [];

  const pieData = [
    { name: 'Dung gio', value: todaySummary.onTime || 0, color: Colors.success },
    { name: 'Di muon', value: todaySummary.late || 0, color: Colors.danger },
    { name: 'Ve som', value: todaySummary.earlyLeave || 0, color: Colors.warning },
    { name: 'Chua ghi', value: todaySummary.pending || 0, color: Colors.textMuted },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Bao Cao</Text>
          <Text style={styles.headerSubtitle}>Tong quan diem danh</Text>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color={Colors.textOnPrimary} />
          ) : (
            <Ionicons name="sync-outline" size={18} color={Colors.textOnPrimary} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'today' && styles.tabBtnActive]}
          onPress={() => setActiveTab('today')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'today' && styles.tabBtnTextActive]}>Hom nay</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'report' && styles.tabBtnActive]}
          onPress={() => setActiveTab('report')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'report' && styles.tabBtnTextActive]}>Bao cao</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'today' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Tong quan hom nay</Text>
            <View style={styles.chartRow}>
              <PieChart data={pieData} />
              <View style={styles.legend}>
                {pieData.map((d, i) => (
                  <View key={i} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                    <Text style={styles.legendText}>{d.name}</Text>
                    <Text style={styles.legendValue}>{d.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <StatCircle value={todaySummary.totalClasses || 0} color={Colors.primary} label="Tong lop" />
            <StatCircle value={todaySummary.onTime || 0} color={Colors.success} label="Dung gio" />
            <StatCircle value={todaySummary.late || 0} color={Colors.danger} label="Di muon" />
            <StatCircle value={todaySummary.checkedIn || 0} color={Colors.accentBlue} label="Da ghi" />
          </View>

          <Text style={styles.sectionTitle}>Chi tiet lop hoc</Text>
          {todayDetails.length > 0 ? (
            todayDetails.map((d, idx) => {
              const statusColor = STATUS_COLORS[d.status] || Colors.textMuted;
              const statusLabel = STATUS_LABELS[d.status] || 'Chua xac dinh';
              return (
                <View key={idx} style={[styles.detailCard, { borderLeftColor: statusColor }]}>
                  <View style={styles.detailTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailCourse} numberOfLines={1}>{d.courseName}</Text>
                      <Text style={styles.detailClass}>{d.classCode} - {d.teacherName}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.detailTimes}>
                    <View style={styles.timeItem}>
                      <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                      <Text style={styles.timeText}>Quy dinh: {d.scheduledStart} - {d.scheduledEnd}</Text>
                    </View>
                    {d.checkInTime && (
                      <View style={styles.timeItem}>
                        <Ionicons name="log-in-outline" size={12} color={Colors.primary} />
                        <Text style={[styles.timeText, { color: Colors.primary, fontWeight: '700' }]}>
                          Den: {d.checkInTime}
                          {d.lateMinutes > 0 ? ` (+${d.lateMinutes}p)` : ''}
                        </Text>
                      </View>
                    )}
                    {d.checkOutTime && (
                      <View style={styles.timeItem}>
                        <Ionicons name="log-out-outline" size={12} color={Colors.accentOrange} />
                        <Text style={[styles.timeText, { color: Colors.accentOrange, fontWeight: '700' }]}>
                          Ve: {d.checkOutTime}
                          {d.earlyMinutes > 0 ? ` (-${d.earlyMinutes}p)` : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="calendar-outline" size={48} color={Colors.borderLight} />
              <Text style={styles.emptyText}>Hom nay khong co lop hoc</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.periodBar}>
            {['week', 'month', 'semester'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.periodBtn, selectedPeriod === p && styles.periodBtnActive]}
                onPress={() => onPeriodChange(p)}
              >
                <Text style={[styles.periodBtnText, selectedPeriod === p && styles.periodBtnTextActive]}>
                  {p === 'week' ? 'Tuan' : p === 'month' ? 'Thang' : 'Ky hoc'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Thong ke ky luc</Text>
            <View style={styles.reportStats}>
              <View style={styles.reportStatItem}>
                <Text style={styles.reportStatValue}>{reportSummary.totalRecords || 0}</Text>
                <Text style={styles.reportStatLabel}>Tong buoi</Text>
              </View>
              <View style={styles.reportStatItem}>
                <Text style={[styles.reportStatValue, { color: Colors.success }]}>{reportSummary.onTimePercent || 0}%</Text>
                <Text style={styles.reportStatLabel}>Dung gio</Text>
              </View>
              <View style={styles.reportStatItem}>
                <Text style={[styles.reportStatValue, { color: Colors.danger }]}>{reportSummary.latePercent || 0}%</Text>
                <Text style={styles.reportStatLabel}>Di muon</Text>
              </View>
              <View style={styles.reportStatItem}>
                <Text style={[styles.reportStatValue, { color: Colors.warning }]}>{reportSummary.earlyLeavePercent || 0}%</Text>
                <Text style={styles.reportStatLabel}>Ve som</Text>
              </View>
            </View>
            {reportSummary.avgLateMinutes > 0 && (
              <Text style={styles.avgNote}>
                Thoi gian di muon TB: {reportSummary.avgLateMinutes} phut/buoi
              </Text>
            )}
          </View>

          <Text style={styles.sectionTitle}>Giang vien nhieu vi pham nhat</Text>
          {byLecturer.length > 0 ? (
            byLecturer.slice(0, 10).map((l, idx) => (
              <View key={idx} style={styles.lecturerCard}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lecturerName}>{l.lecturerName}</Text>
                  <Text style={styles.lecturerStats}>
                    {l.totalClasses} buoi - {l.onTime} dung gio, {l.late} muon, {l.absent} vang
                  </Text>
                </View>
                <View style={styles.violationBadge}>
                  <Text style={styles.violationText}>{l.late + l.earlyLeave + l.absent}</Text>
                  <Text style={styles.violationLabel}>VP</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="people-outline" size={48} color={Colors.borderLight} />
              <Text style={styles.emptyText}>Chua co du lieu bao cao</Text>
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
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  syncBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
  },

  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  tabBtnTextActive: { color: Colors.textOnPrimary },

  chartCard: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, padding: 16,
    elevation: 2, shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
  },
  chartTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  chartRow: { flexDirection: 'row', alignItems: 'center' },

  pieContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  pieCircle: { width: '100%', height: '100%', borderRadius: 999 },
  pieSlice: { position: 'absolute', top: 0, left: 0 },
  pieArc: { position: 'absolute', top: 0, left: 0 },
  pieCenter: {
    position: 'absolute', borderRadius: 999, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  pieTotal: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  pieTotalLabel: { fontSize: 10, color: Colors.textMuted },

  legend: { flex: 1, marginLeft: 16, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  legendValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },

  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginHorizontal: 16, marginBottom: 16,
  },
  circleStat: { alignItems: 'center' },
  circle: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  circleValue: { fontSize: 18, fontWeight: '800' },
  circleLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 4, fontWeight: '600' },

  sectionTitle: {
    fontSize: 15, fontWeight: '700', color: Colors.textPrimary,
    marginHorizontal: 16, marginBottom: 10,
  },

  detailCard: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginBottom: 10,
    borderRadius: 12, padding: 14, borderLeftWidth: 4,
  },
  detailTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  detailCourse: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  detailClass: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 20,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  detailTimes: { gap: 4 },
  timeItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 12, color: Colors.textSecondary },

  periodBar: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 4,
  },
  periodBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  periodBtnTextActive: { color: Colors.textOnPrimary },

  reportStats: { flexDirection: 'row', justifyContent: 'space-around' },
  reportStatItem: { alignItems: 'center' },
  reportStatValue: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  reportStatLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },
  avgNote: {
    fontSize: 12, color: Colors.warning, textAlign: 'center',
    marginTop: 12, fontWeight: '600',
  },

  lecturerCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 14, gap: 12,
  },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  lecturerName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  lecturerStats: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  violationBadge: {
    alignItems: 'center', backgroundColor: Colors.danger + '10',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  violationText: { fontSize: 16, fontWeight: '800', color: Colors.danger },
  violationLabel: { fontSize: 9, color: Colors.danger, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, color: Colors.textSecondary, marginTop: 8 },
});
