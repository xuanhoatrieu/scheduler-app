import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
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
import { getFinanceAll, syncHistory } from '../services/api';
import { Colors } from '../theme/colors';

export default function FinanceScreen({ user }) {
  const [financeData, setFinanceData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expandedSemester, setExpandedSemester] = useState(null);

  const loadData = async () => {
    try {
      const res = await getFinanceAll();
      if (res.success) {
        setFinanceData(res.data || []);
        setSummary(res.summary || null);
      }
    } catch (err) {
      console.warn('Error loading finance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSyncHistory = async () => {
    setSyncing(true);
    try {
      const res = await syncHistory();
      if (res.success) {
        await loadData();
      }
    } catch (err) {
      console.warn('Sync finance failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const formatMoney = (val) => {
    if (val === undefined || val === null) return '0';
    return val.toLocaleString('vi-VN');
  };

  const formatSemesterName = (semester, schoolYear) => {
    const semNum = semester?.replace('HocKy', '') || '?';
    return `HK${semNum} — ${schoolYear || ''}`;
  };

  const getPaidPercent = () => {
    if (!summary) return 0;
    if (summary.totalDebt === 0) return 100;
    const baseAmount = summary.totalMustPay > 0 ? summary.totalMustPay : summary.totalTuition;
    if (!baseAmount || baseAmount === 0) return 100;
    return Math.min(100, Math.round((summary.totalPaid / baseAmount) * 100));
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
          <Text style={styles.headerSubtitle}>Tài chính, miễn giảm & hoàn trả</Text>
        </View>

        <TouchableOpacity
          style={[styles.syncBtn, syncing && { opacity: 0.6 }]}
          onPress={handleSyncHistory}
          disabled={syncing}
        >
          <Ionicons
            name="sync-outline"
            size={18}
            color="#fff"
            style={syncing ? styles.spinIcon : null}
          />
          <Text style={styles.syncBtnText}>{syncing ? 'Đang đồng bộ...' : 'Cập nhật'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {/* Total Summary Card */}
        {summary ? (
          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryLabel}>TỔNG QUAN HỌC PHÍ TOÀN KHÓA</Text>
                <Text style={styles.summarySemCount}>
                  Ghi nhận {summary.totalSemesters} học kỳ
                </Text>
              </View>
              {/* Pie visual badge */}
              <View
                style={[
                  styles.percentBadge,
                  { backgroundColor: paidPercent === 100 ? Colors.successLight : Colors.warningLight },
                ]}
              >
                <Text
                  style={[
                    styles.percentText,
                    { color: paidPercent === 100 ? Colors.success : Colors.warning },
                  ]}
                >
                  {paidPercent}% Hoàn thành
                </Text>
              </View>
            </View>

            {/* Financial Grid */}
            <View style={styles.gridContainer}>
              <View style={styles.gridRow}>
                <View style={styles.gridCol}>
                  <Text style={styles.gridLabel}>Mức học phí gốc</Text>
                  <Text style={styles.gridValBold}>{formatMoney(summary.totalTuition)}đ</Text>
                </View>
                <View style={styles.gridCol}>
                  <Text style={styles.gridLabel}>Miễn giảm / Học bổng</Text>
                  <Text style={[styles.gridValBold, { color: Colors.accentBlue }]}>
                    - {formatMoney(summary.totalDiscount)}đ
                  </Text>
                </View>
              </View>

              <View style={styles.gridRow}>
                <View style={styles.gridCol}>
                  <Text style={styles.gridLabel}>Thực nộp sau miễn giảm</Text>
                  <Text style={[styles.gridValBold, { color: Colors.primary }]}>
                    {formatMoney(summary.totalMustPay)}đ
                  </Text>
                </View>
                <View style={styles.gridCol}>
                  <Text style={styles.gridLabel}>Đã thanh toán</Text>
                  <Text style={[styles.gridValBold, { color: Colors.success }]}>
                    {formatMoney(summary.totalPaid)}đ
                  </Text>
                </View>
              </View>

              {/* Overpayment Refund & Debt Row */}
              <View style={styles.gridRowLast}>
                <View style={styles.gridCol}>
                  <Text style={styles.gridLabel}>
                    {summary.totalSurplus > 0 ? 'Đang nộp thừa / Dư' : 'Nhà trường hoàn trả'}
                  </Text>
                  <Text
                    style={[
                      styles.gridValBold,
                      { color: summary.totalSurplus > 0 ? Colors.success : Colors.accentPurple },
                    ]}
                  >
                    {summary.totalSurplus > 0 ? `+ ${formatMoney(summary.totalSurplus)}đ` : `+ ${formatMoney(summary.totalRefund || 0)}đ`}
                  </Text>
                </View>
                <View style={styles.gridCol}>
                  <Text style={styles.gridLabel}>Còn nợ hiện tại</Text>
                  <Text
                    style={[
                      styles.gridValBold,
                      { color: summary.totalDebt > 0 ? Colors.danger : Colors.success },
                    ]}
                  >
                    {formatMoney(summary.totalDebt)}đ
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* Semester Timeline */}
        <View style={styles.timelineSection}>
          <Text style={styles.timelineTitle}>LỊCH SỬ THEO HỌC KỲ</Text>

          {financeData.length > 0 ? (
            financeData.map((finance, idx) => {
              const isOverallSettled = summary && summary.totalDebt === 0;
              const hasSurplus = (finance.surplusTuition && finance.surplusTuition > 0) || (finance.status === 'surplus') || finance.debtTuition < 0;
              const surplusVal = finance.surplusTuition || Math.abs(finance.rawDebtTuition || (finance.debtTuition < 0 ? finance.debtTuition : 0));
              const isOffset = finance.status === 'offset';
              const isDebt = finance.debtTuition > 0 && !isOverallSettled;

              let statusLabel = finance.badge || '✓ Đã nộp đủ';
              let statusColor = Colors.success;

              if (hasSurplus && surplusVal > 0) {
                statusLabel = finance.badge || `✓ Nộp thừa ${formatMoney(surplusVal)}đ`;
                statusColor = Colors.success;
              } else if (isOffset) {
                statusLabel = '✓ Đã cấn trừ đủ';
                statusColor = Colors.success;
              } else if (isDebt) {
                statusLabel = `🟡 Còn thiếu ${formatMoney(finance.debtTuition)}đ`;
                statusColor = Colors.warning;
              } else if (isOverallSettled && finance.paidTuition < (finance.mustPayTuition || finance.totalTuition)) {
                statusLabel = '✓ Đã cấn trừ đủ';
                statusColor = Colors.success;
              }

              const isExpanded = expandedSemester === finance.semester;
              const invoices = finance.invoiceDetails || [];

              return (
                <View key={idx} style={styles.timelineItem}>
                  <TouchableOpacity
                    style={styles.semesterCard}
                    activeOpacity={0.8}
                    onPress={() => setExpandedSemester(isExpanded ? null : finance.semester)}
                  >
                    <View style={styles.semesterHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.semesterTitle}>
                          {formatSemesterName(finance.semester, finance.schoolYear)}
                        </Text>
                        <View style={styles.statusRow}>
                          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                            {statusLabel}
                          </Text>
                        </View>
                      </View>

                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={Colors.textSecondary}
                      />
                    </View>

                    {/* Breakdown Grid for Semester Card */}
                    {(() => {
                      const totalTuition = finance.totalTuition || 0;
                      let mustPayTuition = finance.mustPayTuition !== undefined ? finance.mustPayTuition : totalTuition;
                      let discountTuition = finance.discountTuition || 0;

                      if (discountTuition === 0 && mustPayTuition === 0 && totalTuition > 0) {
                        discountTuition = totalTuition;
                      } else if (!discountTuition && totalTuition > mustPayTuition) {
                        discountTuition = totalTuition - mustPayTuition;
                      }

                      const discountPercent = finance.discountPercent || (totalTuition > 0 ? Math.min(100, Math.round((discountTuition / totalTuition) * 100)) : 0);

                      return (
                        <View style={styles.semGridWrap}>
                          <View style={styles.semGridRow}>
                            <View style={styles.semGridCol}>
                              <Text style={styles.bdLabel}>Học phí gốc</Text>
                              <Text style={styles.bdValue}>{formatMoney(totalTuition)}đ</Text>
                            </View>

                            <View style={styles.semGridCol}>
                              <Text style={styles.bdLabel}>Miễn giảm ({discountPercent}%)</Text>
                              <Text style={[styles.bdValue, { color: Colors.accentBlue }]}>
                                - {formatMoney(discountTuition)}đ
                              </Text>
                            </View>

                            <View style={styles.semGridCol}>
                              <Text style={styles.bdLabel}>Thực nộp</Text>
                              <Text style={[styles.bdValue, { color: Colors.primary }]}>
                                {formatMoney(mustPayTuition)}đ
                              </Text>
                            </View>
                          </View>

                          <View style={[styles.semGridRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight }]}>
                            <View style={styles.semGridCol}>
                              <Text style={styles.bdLabel}>Đã nộp</Text>
                              <Text style={[styles.bdValue, { color: Colors.success }]}>
                                {formatMoney(finance.paidTuition)}đ
                              </Text>
                            </View>

                            <View style={styles.semGridCol}>
                              <Text style={styles.bdLabel}>Hoàn trả</Text>
                              <Text style={[styles.bdValue, { color: Colors.accentPurple }]}>
                                + {formatMoney(finance.refundTuition || 0)}đ
                              </Text>
                            </View>

                            <View style={styles.semGridCol}>
                              <Text style={styles.bdLabel}>{hasSurplus && surplusVal > 0 ? 'Nộp thừa' : (isDebt ? 'Còn thiếu' : 'Trạng thái')}</Text>
                              <Text
                                style={[
                                   styles.bdValue,
                                   { color: isDebt ? Colors.danger : Colors.success },
                                 ]}
                              >
                                {hasSurplus && surplusVal > 0 ? `+${formatMoney(surplusVal)}đ` : (isDebt ? `${formatMoney(finance.debtTuition)}đ` : (isOffset ? '0đ (Đã cấn trừ)' : '0đ (Đã đủ)'))}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })()}

                    {/* Invoices Dropdown */}
                    {isExpanded && (
                      <View style={styles.invoicesWrap}>
                        <Text style={styles.invoicesTitle}>Chi tiết giao dịch / Phiếu thu-chi:</Text>
                        {invoices.length > 0 ? (
                          invoices.map((inv, i) => (
                            <View key={i} style={styles.invoiceItem}>
                              <View style={styles.invoiceLeft}>
                                <View style={styles.invoiceBadgeRow}>
                                  <Text style={styles.invoiceNo}>Số phiếu: {inv.invoiceNo || '---'}</Text>
                                  {inv.isRefund ? (
                                    <View style={styles.refundBadge}>
                                      <Text style={styles.refundBadgeText}>Hoàn trả nộp thừa</Text>
                                    </View>
                                  ) : (
                                    <View style={styles.paymentBadge}>
                                      <Text style={styles.paymentBadgeText}>Phiếu thu</Text>
                                    </View>
                                  )}
                                </View>
                                {inv.description ? (
                                  <Text style={styles.invoiceDesc}>{inv.description}</Text>
                                ) : null}
                                <Text style={styles.invoiceDate}>Ngày: {inv.date || '---'}</Text>
                              </View>
                              <Text
                                style={[
                                  styles.invoiceAmount,
                                  { color: inv.isRefund ? Colors.accentPurple : Colors.success },
                                ]}
                              >
                                {inv.isRefund ? '+' : ''}{formatMoney(inv.amount)}đ
                              </Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.noInvoices}>Chưa có giao dịch nào được ghi nhận</Text>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="receipt-outline" size={48} color={Colors.borderLight} />
              <Text style={styles.emptyText}>Chưa có dữ liệu học phí</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: Colors.textSecondary },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  syncBtnText: { color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 4 },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    elevation: 3,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryLabel: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, letterSpacing: 0.5 },
  summarySemCount: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  percentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  percentText: { fontSize: 12, fontWeight: '800' },

  gridContainer: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 14,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  gridRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridCol: { flex: 1 },
  gridLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  gridValBold: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },

  timelineSection: { marginTop: 8 },
  timelineTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 12,
    letterSpacing: 0.5,
  },

  timelineItem: { marginBottom: 12 },
  semesterCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  semesterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  semesterTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  statusRow: { marginTop: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },

  semGridWrap: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
  },
  semGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  semGridCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  bdLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  bdValue: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },

  invoicesWrap: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  invoicesTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 8 },
  invoiceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  invoiceLeft: { flex: 1, marginRight: 8 },
  invoiceBadgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  invoiceNo: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginRight: 8 },
  paymentBadge: { backgroundColor: Colors.successLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  paymentBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.success },
  refundBadge: { backgroundColor: Colors.accentPurple + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  refundBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.accentPurple },
  invoiceDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  invoiceDate: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  invoiceAmount: { fontSize: 13, fontWeight: '800' },

  noInvoices: { fontSize: 12, color: Colors.textMuted, italic: true },
  emptyWrap: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 10 },
});
