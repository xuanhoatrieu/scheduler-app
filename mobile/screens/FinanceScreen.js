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
import { getFinanceAll } from '../services/api';
import { Colors } from '../theme/colors';

export default function FinanceScreen({ user }) {
  const [financeData, setFinanceData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const res = await getFinanceAll();
    if (res.success) {
      setFinanceData(res.data || []);
      setSummary(res.summary || null);
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

  const formatMoney = (amount) => {
    if (!amount && amount !== 0) return '0';
    return amount.toLocaleString('vi-VN');
  };

  // Tên kỳ dễ đọc
  const formatSemesterName = (semester, schoolYear) => {
    const semNum = semester?.replace('HocKy', '') || '?';
    return `HK${semNum} — ${schoolYear || ''}`;
  };

  // Tỷ lệ đã nộp cho pie chart visual
  const getPaidPercent = () => {
    if (!summary || !summary.totalTuition || summary.totalTuition === 0) return 0;
    return Math.round((summary.totalPaid / summary.totalTuition) * 100);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải thông tin học phí...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const paidPercent = getPaidPercent();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Học Phí</Text>
          <Text style={styles.headerSubtitle}>Lịch sử tài chính toàn khóa</Text>
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
        {/* Summary Card */}
        {summary && summary.totalTuition > 0 ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>TỔNG QUAN TÀI CHÍNH TOÀN KHÓA</Text>

            {/* Pie Chart Visual */}
            <View style={styles.pieWrap}>
              <View style={styles.pieOuter}>
                <View style={[styles.pieInner, {
                  borderTopColor: paidPercent > 25 ? Colors.success : Colors.danger,
                  borderRightColor: paidPercent > 50 ? Colors.success : Colors.danger + '30',
                  borderBottomColor: paidPercent > 75 ? Colors.success : Colors.danger + '20',
                  borderLeftColor: paidPercent > 99 ? Colors.success : Colors.danger + '15',
                }]}>
                  <Text style={[styles.piePercent, { color: paidPercent >= 90 ? Colors.success : Colors.warning }]}>
                    {paidPercent}%
                  </Text>
                  <Text style={styles.pieLbl}>Đã nộp</Text>
                </View>
              </View>
            </View>

            {/* Financial Breakdown */}
            <View style={styles.financeRows}>
              <View style={styles.financeRow}>
                <View style={styles.financeRowLeft}>
                  <View style={[styles.financeDot, { backgroundColor: Colors.textPrimary }]} />
                  <Text style={styles.financeLbl}>Tổng phải nộp</Text>
                </View>
                <Text style={styles.financeVal}>{formatMoney(summary.totalTuition)}đ</Text>
              </View>
              <View style={styles.financeRow}>
                <View style={styles.financeRowLeft}>
                  <View style={[styles.financeDot, { backgroundColor: Colors.success }]} />
                  <Text style={styles.financeLbl}>Đã nộp</Text>
                </View>
                <Text style={[styles.financeVal, { color: Colors.success }]}>
                  {formatMoney(summary.totalPaid)}đ
                </Text>
              </View>
              <View style={styles.financeDivider} />
              <View style={styles.financeRow}>
                <View style={styles.financeRowLeft}>
                  <View style={[styles.financeDot, { backgroundColor: summary.totalDebt > 0 ? Colors.danger : Colors.success }]} />
                  <Text style={[styles.financeLbl, { fontWeight: '700' }]}>Còn nợ</Text>
                </View>
                <Text style={[styles.financeValBold, { color: summary.totalDebt > 0 ? Colors.danger : Colors.success }]}>
                  {formatMoney(summary.totalDebt)}đ
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Semester Timeline */}
        <View style={styles.timelineSection}>
          <Text style={styles.timelineTitle}>LỊCH SỬ THEO HỌC KỲ</Text>

          {financeData.length > 0 ? (
            financeData.map((finance, idx) => {
              const isPaid = (finance.debtTuition || 0) === 0;
              return (
                <View key={idx} style={styles.timelineItem}>
                  {/* Timeline indicator */}
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, { backgroundColor: isPaid ? Colors.success : Colors.danger }]} />
                    {idx < financeData.length - 1 && <View style={styles.timelineLine} />}
                  </View>

                  {/* Content */}
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeader}>
                      <Text style={styles.timelineSemName}>
                        {formatSemesterName(finance.semester, finance.schoolYear)}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: isPaid ? Colors.success + '15' : Colors.danger + '15' }]}>
                        <Text style={[styles.statusText, { color: isPaid ? Colors.success : Colors.danger }]}>
                          {isPaid ? '✓ Đã nộp đủ' : '⏳ Còn nợ'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.timelineBody}>
                      <View style={styles.timelineRow}>
                        <Text style={styles.timelineRowLbl}>Phải nộp:</Text>
                        <Text style={styles.timelineRowVal}>{formatMoney(finance.totalTuition)}đ</Text>
                      </View>
                      <View style={styles.timelineRow}>
                        <Text style={styles.timelineRowLbl}>Đã nộp:</Text>
                        <Text style={[styles.timelineRowVal, { color: Colors.success }]}>
                          {formatMoney(finance.paidTuition)}đ
                        </Text>
                      </View>
                      {finance.debtTuition > 0 && (
                        <View style={styles.timelineRow}>
                          <Text style={styles.timelineRowLbl}>Còn nợ:</Text>
                          <Text style={[styles.timelineRowVal, { color: Colors.danger, fontWeight: '700' }]}>
                            {formatMoney(finance.debtTuition)}đ
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Invoice list */}
                    {finance.invoiceDetails && finance.invoiceDetails.length > 0 && (
                      <View style={styles.invoiceList}>
                        {finance.invoiceDetails.map((inv, iIdx) => (
                          <View key={iIdx} style={styles.invoiceItem}>
                            <Ionicons name="receipt-outline" size={14} color={Colors.success} />
                            <Text style={styles.invoiceText} numberOfLines={1}>
                              {inv.description || 'Thanh toán HP'} — {formatMoney(inv.amount)}đ
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="wallet-outline" size={64} color={Colors.borderLight} />
              <Text style={styles.emptyText}>Chưa có dữ liệu tài chính!</Text>
              <Text style={styles.emptySubText}>Hãy bấm đồng bộ lịch sử trong Hồ sơ</Text>
            </View>
          )}
        </View>
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
  // Summary Card
  summaryCard: {
    backgroundColor: Colors.surface, margin: 16, borderRadius: 20, padding: 20,
    elevation: 4, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 12,
  },
  summaryTitle: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: 16 },
  pieWrap: { alignItems: 'center', marginBottom: 20 },
  pieOuter: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center',
  },
  pieInner: {
    width: 90, height: 90, borderRadius: 45, borderWidth: 8,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  piePercent: { fontSize: 22, fontWeight: '900' },
  pieLbl: { fontSize: 10, color: Colors.textMuted },
  financeRows: { gap: 8 },
  financeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  financeRowLeft: { flexDirection: 'row', alignItems: 'center' },
  financeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  financeLbl: { fontSize: 13, color: Colors.textSecondary },
  financeVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  financeDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 6 },
  financeValBold: { fontSize: 16, fontWeight: '800' },
  // Timeline
  timelineSection: { paddingHorizontal: 16 },
  timelineTitle: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: 16, marginTop: 8 },
  timelineItem: { flexDirection: 'row', marginBottom: 0 },
  timelineLeft: { width: 24, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  timelineLine: { width: 2, flex: 1, backgroundColor: Colors.borderLight, marginTop: 4 },
  timelineContent: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    marginLeft: 12, marginBottom: 12,
    elevation: 2, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4,
  },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  timelineSemName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '700' },
  timelineBody: { gap: 4 },
  timelineRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineRowLbl: { fontSize: 12, color: Colors.textSecondary },
  timelineRowVal: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  invoiceList: { marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 8, gap: 4 },
  invoiceItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  invoiceText: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 16 },
  emptySubText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
});
