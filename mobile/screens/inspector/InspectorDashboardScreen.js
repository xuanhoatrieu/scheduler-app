import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getDashboardReport,
  getDashboardToday,
  sendInspectorEmailReport,
} from '../../services/api';
import { Colors } from '../../theme/colors';

const STATUS_CONFIG = {
  on_time: { label: 'Đúng giờ', color: '#2e7d32', bg: '#e8f5e9' },
  late: { label: 'Đi muộn', color: '#e65100', bg: '#fff3e0' },
  early_leave: { label: 'Về sớm', color: '#f57c00', bg: '#fff8e1' },
  rescheduled_permitted: { label: 'Đổi giờ (Có phép)', color: '#0277bd', bg: '#e1f5fe' },
  rescheduled_unpermitted: { label: 'Tự ý đổi giờ', color: '#c62828', bg: '#ffebee' },
  substitute: { label: 'Dạy thay', color: '#5c6bc0', bg: '#ede7f6' },
  absent: { label: 'Vắng / Bỏ tiết', color: '#c62828', bg: '#ffebee' },
  exempt: { label: 'Được miễn', color: '#00838f', bg: '#e0f7fa' },
  pending: { label: 'Chưa ghi', color: Colors.textMuted, bg: '#f5f5f5' },
};

const getStatusInfo = (d) => {
  if (d.status === 'rescheduled') {
    if (d.hasPermission === true) {
      return STATUS_CONFIG.rescheduled_permitted;
    }
    return STATUS_CONFIG.rescheduled_unpermitted;
  }
  return STATUS_CONFIG[d.status] || STATUS_CONFIG.pending;
};

const PIE_SIZE = 120;

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
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
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
                width: size,
                height: size,
                transform: [{ rotate: `${rotation}deg` }],
              },
            ]}
          >
            <View
              style={[
                styles.pieArc,
                {
                  width: size,
                  height: size,
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
        <Text style={styles.pieTotalLabel}>Lớp</Text>
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
  const [sendingEmail, setSendingEmail] = useState(false);

  const loadToday = async () => {
    const res = await getDashboardToday();
    if (res.success) setTodayData(res);
  };

  const loadReport = async (period) => {
    const res = await getDashboardReport({ period });
    if (res.success) setReportData(res);
  };

  useEffect(() => {
    Promise.all([loadToday(), loadReport(selectedPeriod)]).finally(() =>
      setLoading(false)
    );
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

  // Xử lý gửi email báo cáo hôm nay cho Ban Giám hiệu
  const handleSendTodayEmail = () => {
    const date = todayData?.date;
    Alert.alert(
      'Gửi Báo Cáo Ban Giám Hiệu',
      `Báo cáo thanh tra ngày ${date || 'hôm nay'} sẽ được tổng hợp tự động và gửi qua hệ thống Google Workspace đến Hiệu trưởng và Ban Giám hiệu.\n\nBạn có muốn gửi ngay không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Gửi ngay',
          onPress: async () => {
            setSendingEmail(true);
            try {
              const res = await sendInspectorEmailReport({
                periodType: 'daily',
                from: date,
                to: date,
              });
              if (res.success) {
                Alert.alert(
                  'Thành công',
                  `Đã gửi báo cáo thanh tra thành công đến:\n${res.recipients?.join(', ') || 'Ban Giám hiệu'}`
                );
              } else {
                Alert.alert('Không thành công', res.message || 'Lỗi gửi email báo cáo');
              }
            } catch (err) {
              Alert.alert('Lỗi', 'Không thể kết nối đến máy chủ gửi email!');
            } finally {
              setSendingEmail(false);
            }
          },
        },
      ]
    );
  };

  // Xử lý gửi email báo cáo theo kỳ (Tuần / Tháng)
  const handleSendPeriodEmail = () => {
    const label = selectedPeriod === 'week' ? 'Tuần' : selectedPeriod === 'month' ? 'Tháng' : 'Kỳ học';
    Alert.alert(
      `Gửi Báo Cáo ${label}`,
      `Gửi bảng tổng hợp thanh tra ${label.toLowerCase()} đến Ban Giám hiệu qua email TUAF Google Workspace?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Gửi ngay',
          onPress: async () => {
            setSendingEmail(true);
            try {
              const res = await sendInspectorEmailReport({
                periodType: selectedPeriod,
                from: reportData?.from,
                to: reportData?.to,
              });
              if (res.success) {
                Alert.alert('Thành công', `Đã gửi báo cáo ${label.toLowerCase()} thành công!`);
              } else {
                Alert.alert('Không thành công', res.message || 'Lỗi gửi email');
              }
            } catch (err) {
              Alert.alert('Lỗi', 'Không thể kết nối đến máy chủ gửi email!');
            } finally {
              setSendingEmail(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải báo cáo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const todaySummary = todayData?.summary || {};
  const todayDetails = todayData?.details || [];
  const reportSummary = reportData?.summary || {};
  const byLecturer = reportData?.byLecturer || [];

  const pieData = [
    { name: 'Đúng giờ', value: todaySummary.onTime || 0, color: '#2e7d32' },
    { name: 'Đi muộn', value: todaySummary.late || 0, color: '#e65100' },
    { name: 'Về sớm', value: todaySummary.earlyLeave || 0, color: '#f57c00' },
    { name: 'Bỏ tiết', value: todaySummary.absent || 0, color: '#c62828' },
    { name: 'Đổi giờ (CP)', value: todaySummary.rescheduledPermitted || 0, color: '#0277bd' },
    { name: 'Tự ý đổi', value: todaySummary.rescheduledUnpermitted || 0, color: '#880e4f' },
    { name: 'Dạy thay', value: todaySummary.substitute || 0, color: '#5c6bc0' },
    { name: 'Chưa ghi', value: todaySummary.pending || 0, color: Colors.textMuted },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Báo Cáo</Text>
          <Text style={styles.headerSubtitle}>Tổng quan kiểm tra giảng dạy</Text>
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
          <Text style={[styles.tabBtnText, activeTab === 'today' && styles.tabBtnTextActive]}>Hôm nay</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'report' && styles.tabBtnActive]}
          onPress={() => setActiveTab('report')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'report' && styles.tabBtnTextActive]}>Báo cáo</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'today' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          {/* Biểu đồ phân bổ hôm nay */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Tình hình giảng dạy hôm nay ({todayData?.date || ''})</Text>
            <View style={styles.chartRow}>
              <PieChart data={pieData} />
              <View style={styles.legend}>
                {pieData.map((d, i) => (
                  <View key={i} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                    <Text style={styles.legendText} numberOfLines={1}>{d.name}</Text>
                    <Text style={styles.legendValue}>{d.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Vòng tròn số liệu tổng quan */}
          <View style={styles.summaryRow}>
            <StatCircle value={todaySummary.totalClasses || 0} color={Colors.primary} label="Tổng lớp" />
            <StatCircle value={todaySummary.onTime || 0} color="#2e7d32" label="Đúng giờ" />
            <StatCircle value={(todaySummary.late || 0) + (todaySummary.earlyLeave || 0)} color="#e65100" label="Muộn/Sớm" />
            <StatCircle value={todaySummary.absent || 0} color="#c62828" label="Bỏ tiết" />
          </View>

          {/* Dải thông tin vi phạm / đổi giờ */}
          <View style={styles.rescheduledRow}>
            <View style={[styles.rescheduledBadge, { backgroundColor: '#ffebee' }]}>
              <Ionicons name="close-circle" size={14} color="#c62828" />
              <Text style={[styles.rescheduledBadgeText, { color: '#c62828' }]}>
                Bỏ tiết: {todaySummary.absent || 0}
              </Text>
            </View>
            <View style={[styles.rescheduledBadge, { backgroundColor: '#e1f5fe' }]}>
              <Ionicons name="swap-horizontal" size={14} color="#0277bd" />
              <Text style={[styles.rescheduledBadgeText, { color: '#0277bd' }]}>
                Đổi giờ có phép: {todaySummary.rescheduledPermitted || 0}
              </Text>
            </View>
            <View style={[styles.rescheduledBadge, { backgroundColor: '#fff3e0' }]}>
              <Ionicons name="alert-circle" size={14} color="#e65100" />
              <Text style={[styles.rescheduledBadgeText, { color: '#e65100' }]}>
                Tự ý đổi: {todaySummary.rescheduledUnpermitted || 0}
              </Text>
            </View>
            <View style={[styles.rescheduledBadge, { backgroundColor: '#ede7f6' }]}>
              <Ionicons name="people" size={14} color="#5c6bc0" />
              <Text style={[styles.rescheduledBadgeText, { color: '#5c6bc0' }]}>
                Dạy thay: {todaySummary.substitute || 0}
              </Text>
            </View>
          </View>

          {/* Banner gửi email báo cáo Ban Giám hiệu */}
          <View style={styles.emailCard}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="mail-outline" size={18} color={Colors.primary} />
                <Text style={styles.emailCardTitle}>Báo cáo Ban Giám hiệu</Text>
              </View>
              <Text style={styles.emailCardDesc}>
                Tự động gửi lúc 18:00 hàng ngày qua Gmail TUAF. Bạn có thể nhấn để gửi ngay tức thì.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.sendEmailBtn}
              onPress={handleSendTodayEmail}
              disabled={sendingEmail}
            >
              {sendingEmail ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={14} color="#fff" />
                  <Text style={styles.sendEmailBtnText}>Gửi ngay</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Chi tiết lớp học ({todayDetails.length})</Text>
          {todayDetails.length > 0 ? (
            todayDetails.map((d, idx) => {
              const info = getStatusInfo(d);
              return (
                <View key={idx} style={[styles.detailCard, { borderLeftColor: info.color }]}>
                  <View style={styles.detailTop}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.detailCourse} numberOfLines={1}>{d.courseName}</Text>
                      <Text style={styles.detailClass}>{d.classCode} • GV: {d.teacherName}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: info.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: info.color }]}>{info.label}</Text>
                    </View>
                  </View>

                  <View style={styles.detailTimes}>
                    <View style={styles.timeItem}>
                      <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.timeText}>
                        Quy định: {d.scheduledStart} - {d.scheduledEnd} | Phòng: {d.room || 'Chưa rõ'}
                      </Text>
                    </View>
                    {d.checkInTime && (
                      <View style={styles.timeItem}>
                        <Ionicons name="log-in-outline" size={13} color={Colors.primary} />
                        <Text style={[styles.timeText, { color: Colors.primary, fontWeight: '700' }]}>
                          Đến: {d.checkInTime}
                          {d.lateMinutes > 0 ? ` (+${d.lateMinutes} phút)` : ''}
                        </Text>
                      </View>
                    )}
                    {d.checkOutTime && (
                      <View style={styles.timeItem}>
                        <Ionicons name="log-out-outline" size={13} color={Colors.accentOrange} />
                        <Text style={[styles.timeText, { color: Colors.accentOrange, fontWeight: '700' }]}>
                          Về: {d.checkOutTime}
                          {d.earlyMinutes > 0 ? ` (-${d.earlyMinutes} phút)` : ''}
                        </Text>
                      </View>
                    )}
                    {d.status === 'rescheduled' && (
                      <View style={styles.extraInfoBox}>
                        <Text style={styles.extraInfoText}>
                          📅 Lịch học bù: <Text style={{ fontWeight: '700' }}>{d.rescheduledDate || 'Chưa hẹn ngày'}</Text>
                        </Text>
                        {d.rescheduledReason ? (
                          <Text style={styles.extraInfoText}>💬 Lý do: {d.rescheduledReason}</Text>
                        ) : null}
                      </View>
                    )}
                    {d.status === 'substitute' && d.substituteTeacher && (
                      <View style={styles.extraInfoBox}>
                        <Text style={styles.extraInfoText}>
                          👤 GV dạy thay: <Text style={{ fontWeight: '700' }}>{d.substituteTeacher}</Text>
                        </Text>
                      </View>
                    )}
                    {d.note ? (
                      <View style={styles.timeItem}>
                        <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
                        <Text style={[styles.timeText, { fontStyle: 'italic' }]}>Ghi chú: {d.note}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="calendar-outline" size={48} color={Colors.borderLight} />
              <Text style={styles.emptyText}>Hôm nay không có lớp học</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={styles.periodBar}>
            {['week', 'month', 'semester'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.periodBtn, selectedPeriod === p && styles.periodBtnActive]}
                onPress={() => onPeriodChange(p)}
              >
                <Text style={[styles.periodBtnText, selectedPeriod === p && styles.periodBtnTextActive]}>
                  {p === 'week' ? 'Tuần' : p === 'month' ? 'Tháng' : 'Kỳ học'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Nút gửi email báo cáo định kỳ */}
          <TouchableOpacity
            style={styles.periodEmailBtn}
            onPress={handleSendPeriodEmail}
            disabled={sendingEmail}
          >
            {sendingEmail ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="mail" size={16} color="#fff" />
                <Text style={styles.periodEmailBtnText}>
                  Gửi email báo cáo {selectedPeriod === 'week' ? 'tuần' : selectedPeriod === 'month' ? 'tháng' : 'kỳ'} tới BGH
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Thống kê tổng hợp</Text>
            <View style={styles.reportStats}>
              <View style={styles.reportStatItem}>
                <Text style={styles.reportStatValue}>{reportSummary.totalRecords || 0}</Text>
                <Text style={styles.reportStatLabel}>Tổng buổi</Text>
              </View>
              <View style={styles.reportStatItem}>
                <Text style={[styles.reportStatValue, { color: '#2e7d32' }]}>{reportSummary.onTimePercent || 0}%</Text>
                <Text style={styles.reportStatLabel}>Đúng giờ</Text>
              </View>
              <View style={styles.reportStatItem}>
                <Text style={[styles.reportStatValue, { color: '#e65100' }]}>{reportSummary.latePercent || 0}%</Text>
                <Text style={styles.reportStatLabel}>Đi muộn</Text>
              </View>
              <View style={styles.reportStatItem}>
                <Text style={[styles.reportStatValue, { color: '#f57c00' }]}>{reportSummary.earlyLeavePercent || 0}%</Text>
                <Text style={styles.reportStatLabel}>Về sớm</Text>
              </View>
              <View style={styles.reportStatItem}>
                <Text style={[styles.reportStatValue, { color: '#c62828' }]}>{reportSummary.absentPercent || 0}%</Text>
                <Text style={styles.reportStatLabel}>Bỏ tiết ({reportSummary.absent || 0})</Text>
              </View>
            </View>
            {reportSummary.avgLateMinutes > 0 && (
              <Text style={styles.avgNote}>
                Thời gian đi muộn TB: {reportSummary.avgLateMinutes} phút/buổi
              </Text>
            )}
          </View>

          <Text style={styles.sectionTitle}>Giảng viên cần lưu ý nhất</Text>
          {byLecturer.length > 0 ? (
            byLecturer.slice(0, 10).map((l, idx) => (
              <View key={idx} style={styles.lecturerCard}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lecturerName}>{l.lecturerName}</Text>
                  <Text style={styles.lecturerStats}>
                    {l.totalClasses} buổi - {l.onTime} đúng giờ, {l.late} muộn, {l.absent} vắng
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
              <Text style={styles.emptyText}>Chưa có dữ liệu báo cáo</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  syncBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  tabBtnTextActive: { color: Colors.textOnPrimary },

  chartCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  chartTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  chartRow: { flexDirection: 'row', alignItems: 'center' },

  pieContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  pieCircle: { width: '100%', height: '100%', borderRadius: 999 },
  pieSlice: { position: 'absolute', top: 0, left: 0 },
  pieArc: { position: 'absolute', top: 0, left: 0 },
  pieCenter: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieTotal: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  pieTotalLabel: { fontSize: 10, color: Colors.textMuted },

  legend: { flex: 1, marginLeft: 16, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { flex: 1, fontSize: 11, color: Colors.textSecondary },
  legendValue: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  circleStat: { alignItems: 'center' },
  circle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleValue: { fontSize: 17, fontWeight: '800' },
  circleLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 4, fontWeight: '600' },

  rescheduledRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  rescheduledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 5,
  },
  rescheduledBadgeText: { fontSize: 11, fontWeight: '700' },

  emailCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  emailCardTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  emailCardDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },
  sendEmailBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  sendEmailBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginHorizontal: 16,
    marginBottom: 10,
  },

  detailCard: {
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
  },
  detailTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  detailCourse: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  detailClass: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  detailTimes: { gap: 4 },
  timeItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 12, color: Colors.textSecondary },

  extraInfoBox: {
    backgroundColor: Colors.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
    gap: 2,
  },
  extraInfoText: { fontSize: 11, color: Colors.textSecondary },

  periodBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
  },
  periodBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  periodBtnTextActive: { color: Colors.textOnPrimary },

  periodEmailBtn: {
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 11,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  periodEmailBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  reportStats: { flexDirection: 'row', justifyContent: 'space-around' },
  reportStatItem: { alignItems: 'center' },
  reportStatValue: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  reportStatLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },
  avgNote: {
    fontSize: 12,
    color: Colors.warning,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
  },

  lecturerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  lecturerName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  lecturerStats: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  violationBadge: {
    alignItems: 'center',
    backgroundColor: Colors.danger + '10',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  violationText: { fontSize: 16, fontWeight: '800', color: Colors.danger },
  violationLabel: { fontSize: 9, color: Colors.danger, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, color: Colors.textSecondary, marginTop: 8 },
});
