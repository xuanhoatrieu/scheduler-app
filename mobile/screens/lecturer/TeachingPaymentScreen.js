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
import { getTeachingPayment } from '../../services/api';
import { Colors } from '../../theme/colors';

const DEFAULT_YEARS = ['2025-2026', '2024-2025', '2023-2024', '2022-2023'];

export default function TeachingPaymentScreen({ navigation, onBack }) {
  const [availableYears, setAvailableYears] = useState(DEFAULT_YEARS);
  const [selectedYear, setSelectedYear] = useState('2025-2026');
  const [activeTab, setActiveTab] = useState('settlement'); // 'settlement' | 'teaching' | 'otherTasks'
  const [paymentData, setPaymentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (year) => {
    if (!year) return;
    setLoading(true);
    try {
      const res = await getTeachingPayment({ schoolYear: year });
      if (res && res.success) {
        setPaymentData(res);
        if (res.availableYears && res.availableYears.length > 0) {
          setAvailableYears(res.availableYears);
        }
      } else {
        setPaymentData(null);
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu thanh toán:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(selectedYear);
  }, [selectedYear, loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(selectedYear);
    setRefreshing(false);
  };

  const handleBack = () => {
    if (onBack) onBack();
    else if (navigation?.goBack) navigation.goBack();
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '0 đ';
    return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' đ';
  };

  const formatHours = (num) => {
    const val = Number(num) || 0;
    return val % 1 === 0 ? val.toString() : val.toFixed(2);
  };

  const summary = paymentData?.summary;
  const settlement = paymentData?.settlement || summary?.settlement;
  const lecturer = summary?.lecturer || {};
  const teaching = paymentData?.teaching;
  const hk1 = teaching?.semester1;
  const hk2 = teaching?.semester2;
  const otherSem = teaching?.otherSemesters || [];
  const otherTasks = paymentData?.otherTasks;
  const isOfficial = paymentData?.isOfficial;

  // Tính tổng số lớp
  const totalClassesCount = (hk1?.classes?.length || 0) + (hk2?.classes?.length || 0) + otherSem.length;

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Thanh Toán Giờ Giảng</Text>
          <Text style={styles.headerSubtitle}>Tổng hợp giảng dạy & Quyết toán năm học</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="sync-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* ACADEMIC YEAR SELECTOR CHIPS */}
      <View style={styles.yearBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.yearScrollContainer}
        >
          {availableYears.map((year, idx) => {
            const isSelected = selectedYear === year;
            const isCurrent = year === '2025-2026';
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.yearChip, isSelected && styles.yearChipActive]}
                onPress={() => setSelectedYear(year)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isSelected ? "calendar" : "calendar-outline"}
                  size={14}
                  color={isSelected ? '#fff' : Colors.textSecondary}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.yearChipText, isSelected && styles.yearChipTextActive]}>
                  Năm học {year}
                </Text>
                {isCurrent && (
                  <View style={[styles.yearBadgeCurrent, isSelected && styles.yearBadgeCurrentActive]}>
                    <Text style={[styles.yearBadgeCurrentText, isSelected && styles.yearBadgeCurrentTextActive]}>
                      Hiện tại
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 3 SEGMENTED TABS */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'settlement' && styles.tabItemActive]}
          onPress={() => setActiveTab('settlement')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'settlement' ? "calculator" : "calculator-outline"}
            size={17}
            color={activeTab === 'settlement' ? Colors.primary : Colors.textSecondary}
          />
          <Text style={[styles.tabItemText, activeTab === 'settlement' && styles.tabItemTextActive]}>
            Quyết Toán
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'teaching' && styles.tabItemActive]}
          onPress={() => setActiveTab('teaching')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'teaching' ? "book" : "book-outline"}
            size={17}
            color={activeTab === 'teaching' ? Colors.primary : Colors.textSecondary}
          />
          <Text style={[styles.tabItemText, activeTab === 'teaching' && styles.tabItemTextActive]}>
            Giảng Dạy ({totalClassesCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'otherTasks' && styles.tabItemActive]}
          onPress={() => setActiveTab('otherTasks')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'otherTasks' ? "briefcase" : "briefcase-outline"}
            size={17}
            color={activeTab === 'otherTasks' ? Colors.primary : Colors.textSecondary}
          />
          <Text style={[styles.tabItemText, activeTab === 'otherTasks' && styles.tabItemTextActive]}>
            CV Khác ({otherTasks?.totalTasks || 0})
          </Text>
        </TouchableOpacity>
      </View>

      {/* MAIN SCROLL CONTENT */}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Đang tải quyết toán năm học {selectedYear}...</Text>
          </View>
        ) : !paymentData ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={52} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Chưa có dữ liệu quyết toán</Text>
            <Text style={styles.emptySubtitle}>
              Năm học {selectedYear} chưa có thông tin khối lượng giảng dạy hoặc quyết toán từ CSDL Nhà trường.
            </Text>
          </View>
        ) : (
          <>
            {/* ========================================================================= */}
            {/* TAB 1: BẢNG QUYẾT TOÁN NĂM HỌC (CỘNG TRỪ CUỐI CÙNG) */}
            {/* ========================================================================= */}
            {activeTab === 'settlement' && (
              <View>
                {/* HERO SUMMARY CARD */}
                <View style={styles.heroCard}>
                  <View style={styles.heroTopRow}>
                    <View>
                      <Text style={styles.heroLabel}>GIỜ VƯỢT ĐỊNH MỨC NĂM HỌC</Text>
                      <View style={styles.heroHoursRow}>
                        <Text style={[styles.heroHoursVal, (settlement?.excessHours || 0) < 0 && { color: '#dc2626' }]}>
                          {(settlement?.excessHours || 0) > 0 ? `+${formatHours(settlement?.excessHours)}` : formatHours(settlement?.excessHours)}
                        </Text>
                        <Text style={styles.heroUnit}>giờ chuẩn</Text>
                      </View>
                    </View>

                    <View style={[styles.statusBadge, isOfficial ? styles.statusBadgeGreen : styles.statusBadgeOrange]}>
                      <Ionicons
                        name={isOfficial ? "checkmark-done-circle" : "time"}
                        size={14}
                        color={isOfficial ? '#15803d' : '#b45309'}
                      />
                      <Text style={[styles.statusBadgeText, { color: isOfficial ? '#15803d' : '#b45309' }]}>
                        {isOfficial ? 'Đã duyệt' : 'Ước tính TKB'}
                      </Text>
                    </View>
                  </View>

                  {/* THÀNH TIỀN DỰ KIẾN */}
                  <View style={styles.heroAmountBox}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroAmountLabel}>THÙ LAO DỰ KIẾN THANH TOÁN</Text>
                      <Text style={styles.heroAmountVal}>{formatCurrency(settlement?.estimatedAmount || 0)}</Text>
                    </View>
                    <View style={styles.heroUnitPriceBox}>
                      <Text style={styles.heroUnitPriceLbl}>Đơn giá / giờ</Text>
                      <Text style={styles.heroUnitPriceVal}>{formatCurrency(settlement?.unitPrice || 45000)}</Text>
                    </View>
                  </View>

                  {/* THÔNG TIN GIẢNG VIÊN */}
                  {lecturer.name ? (
                    <View style={styles.lecturerMetaBox}>
                      <Ionicons name="person-circle-outline" size={16} color="#64748b" />
                      <Text style={styles.lecturerMetaText}>
                        <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>{lecturer.name}</Text>
                        {lecturer.title ? ` • ${lecturer.title}` : ''}
                        {lecturer.department ? ` • ${lecturer.department}` : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* BẢNG KÊ CỘNG TRỪ QUYẾT TOÁN CHI TIẾT */}
                <View style={styles.cardContainer}>
                  <View style={styles.cardTitleRow}>
                    <Ionicons name="git-merge-outline" size={18} color={Colors.primary} />
                    <Text style={styles.cardTitleText}>Bảng Tổng Hợp Quyết Toán Năm Học</Text>
                  </View>
                  <Text style={styles.cardDescText}>
                    Quy trình cộng trừ tất cả khối lượng công việc và định mức giờ chuẩn theo quy chế TUAF
                  </Text>

                  <View style={styles.calcList}>
                    {/* (1) GIỜ GIẢNG DẠY */}
                    <View style={styles.calcRow}>
                      <View style={[styles.calcSignBox, styles.calcSignPlus]}>
                        <Text style={styles.calcSignText}>+</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.calcRowLabel}>Giờ giảng dạy thực hiện (HK1 + HK2)</Text>
                        <Text style={styles.calcRowSub}>
                          Học kỳ 1: {formatHours(hk1?.summary?.totalConvertedHours || 0)}h | Học kỳ 2: {formatHours(hk2?.summary?.totalConvertedHours || 0)}h
                        </Text>
                      </View>
                      <Text style={styles.calcRowValue}>
                        {formatHours(settlement?.totalTeachingHours || 0)} <Text style={styles.calcUnit}>giờ</Text>
                      </Text>
                    </View>

                    {/* (2) CÔNG VIỆC KHÁC */}
                    <View style={styles.calcRow}>
                      <View style={[styles.calcSignBox, styles.calcSignPlus]}>
                        <Text style={styles.calcSignText}>+</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.calcRowLabel}>Khối lượng công việc khác</Text>
                        <Text style={styles.calcRowSub}>
                          Hướng dẫn khóa luận, đồ án, chấm thi, coi thi...
                        </Text>
                      </View>
                      <Text style={styles.calcRowValue}>
                        {formatHours(settlement?.totalOtherTaskHours || 0)} <Text style={styles.calcUnit}>giờ</Text>
                      </Text>
                    </View>

                    <View style={styles.calcDivider} />

                    {/* (3) TỔNG THỰC HIỆN */}
                    <View style={styles.calcRow}>
                      <View style={[styles.calcSignBox, styles.calcSignEqual]}>
                        <Text style={styles.calcSignText}>=</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.calcRowLabel, { fontWeight: '700' }]}>Tổng giờ thực hiện cả năm</Text>
                        <Text style={styles.calcRowSub}>Tổng khối lượng công việc đã hoàn thành</Text>
                      </View>
                      <Text style={[styles.calcRowValue, { fontWeight: '800', color: Colors.primary }]}>
                        {formatHours(settlement?.totalPerformedHours || 0)} <Text style={styles.calcUnit}>giờ</Text>
                      </Text>
                    </View>

                    <View style={styles.calcDivider} />

                    {/* (4) ĐỊNH MỨC CHUẨN */}
                    <View style={styles.calcRow}>
                      <View style={[styles.calcSignBox, styles.calcSignMinus]}>
                        <Text style={styles.calcSignText}>-</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.calcRowLabel}>Định mức giờ giảng chuẩn</Text>
                        <Text style={styles.calcRowSub}>Quy định theo chức danh ngạch viên chức</Text>
                      </View>
                      <Text style={[styles.calcRowValue, { color: '#dc2626' }]}>
                        {formatHours(settlement?.standardHours || 300)} <Text style={styles.calcUnit}>giờ</Text>
                      </Text>
                    </View>

                    {/* (5) MIỄN GIẢM */}
                    <View style={styles.calcRow}>
                      <View style={[styles.calcSignBox, styles.calcSignPlus]}>
                        <Text style={styles.calcSignText}>+</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.calcRowLabel}>Tổng số giờ được miễn giảm</Text>
                        <Text style={styles.calcRowSub}>
                          Chức vụ: {formatHours(settlement?.exemptBreakdown?.position || 0)}h | Thai sản/con nhỏ: {formatHours(settlement?.exemptBreakdown?.maternity || 0)}h | GVCN: {formatHours(settlement?.exemptBreakdown?.homeroom || 0)}h
                        </Text>
                      </View>
                      <Text style={[styles.calcRowValue, { color: '#16a34a' }]}>
                        {formatHours(settlement?.exemptHours || 0)} <Text style={styles.calcUnit}>giờ</Text>
                      </Text>
                    </View>

                    <View style={styles.calcDividerThick} />

                    {/* (6) KẾT QUẢ CUỐI CÙNG: SỐ GIỜ VƯỢT ĐỊNH MỨC */}
                    <View style={styles.finalCalcRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.finalCalcTitle}>SỐ GIỜ VƯỢT ĐỀ NGHỊ THANH TOÁN</Text>
                        <Text style={styles.finalCalcSub}>
                          {(settlement?.excessHours || 0) > 0
                            ? 'Đủ điều kiện thanh toán thù lao vượt giờ'
                            : 'Đã hoàn thành định mức giờ chuẩn trong năm'}
                        </Text>
                      </View>
                      <View style={styles.finalHoursBadge}>
                        <Text style={styles.finalHoursVal}>
                          {(settlement?.excessHours || 0) > 0 ? `+${formatHours(settlement?.excessHours)}` : formatHours(settlement?.excessHours)}
                        </Text>
                        <Text style={styles.finalHoursUnit}>giờ</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* THỐNG KÊ NHANH 2 KỲ */}
                <View style={styles.semOverviewCard}>
                  <Text style={styles.overviewHeaderTitle}>Thống kê giờ giảng theo kỳ</Text>
                  <View style={styles.overviewRow}>
                    <View style={styles.overviewBox}>
                      <View style={styles.overviewBoxHeader}>
                        <Text style={styles.overviewBoxTitle}>Học kỳ 1</Text>
                        <View style={styles.overviewBadge}>
                          <Text style={styles.overviewBadgeTxt}>{hk1?.classes?.length || 0} lớp</Text>
                        </View>
                      </View>
                      <Text style={styles.overviewHours}>{formatHours(hk1?.summary?.totalConvertedHours || 0)} <Text style={styles.overviewHoursUnit}>giờ</Text></Text>
                      <Text style={styles.overviewMeta}>{hk1?.summary?.totalCredits || 0} TC • {hk1?.summary?.totalPeriods || 0} tiết TKB</Text>
                    </View>

                    <View style={styles.overviewColDivider} />

                    <View style={styles.overviewBox}>
                      <View style={styles.overviewBoxHeader}>
                        <Text style={styles.overviewBoxTitle}>Học kỳ 2</Text>
                        <View style={styles.overviewBadge}>
                          <Text style={styles.overviewBadgeTxt}>{hk2?.classes?.length || 0} lớp</Text>
                        </View>
                      </View>
                      <Text style={styles.overviewHours}>{formatHours(hk2?.summary?.totalConvertedHours || 0)} <Text style={styles.overviewHoursUnit}>giờ</Text></Text>
                      <Text style={styles.overviewMeta}>{hk2?.summary?.totalCredits || 0} TC • {hk2?.summary?.totalPeriods || 0} tiết TKB</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: CHI TIẾT GIẢNG DẠY (XẾP THEO THỨ TỰ KỲ HỌC TRONG NĂM: HK1 & HK2) */}
            {/* ========================================================================= */}
            {activeTab === 'teaching' && (
              <View>
                {/* SECTION: HỌC KỲ 1 */}
                <View style={styles.termSection}>
                  <View style={styles.termSectionHeader}>
                    <View style={styles.termSectionBadge}>
                      <Ionicons name="bookmark" size={14} color="#fff" />
                      <Text style={styles.termSectionBadgeText}>HỌC KỲ 1</Text>
                    </View>
                    <View style={styles.termSectionStats}>
                      <Text style={styles.termSectionStatsText}>
                        <Text style={{ fontWeight: '700', color: Colors.primary }}>{hk1?.classes?.length || 0}</Text> lớp •{' '}
                        <Text style={{ fontWeight: '700', color: Colors.primary }}>{hk1?.summary?.totalCredits || 0}</Text> TC •{' '}
                        <Text style={{ fontWeight: '700', color: Colors.primary }}>{formatHours(hk1?.summary?.totalConvertedHours || 0)}</Text> giờ QĐ
                      </Text>
                    </View>
                  </View>

                  {!hk1?.classes || hk1.classes.length === 0 ? (
                    <View style={styles.emptyTermBox}>
                      <Text style={styles.emptyTermText}>Không có lớp học phần trong Học kỳ 1</Text>
                    </View>
                  ) : (
                    hk1.classes.map((item, idx) => (
                      <ClassItemCard key={`hk1-${idx}`} item={item} formatHours={formatHours} />
                    ))
                  )}
                </View>

                {/* SECTION: HỌC KỲ 2 */}
                <View style={[styles.termSection, { marginTop: 16 }]}>
                  <View style={styles.termSectionHeader}>
                    <View style={[styles.termSectionBadge, { backgroundColor: '#2563eb' }]}>
                      <Ionicons name="bookmark" size={14} color="#fff" />
                      <Text style={styles.termSectionBadgeText}>HỌC KỲ 2</Text>
                    </View>
                    <View style={styles.termSectionStats}>
                      <Text style={styles.termSectionStatsText}>
                        <Text style={{ fontWeight: '700', color: '#2563eb' }}>{hk2?.classes?.length || 0}</Text> lớp •{' '}
                        <Text style={{ fontWeight: '700', color: '#2563eb' }}>{hk2?.summary?.totalCredits || 0}</Text> TC •{' '}
                        <Text style={{ fontWeight: '700', color: '#2563eb' }}>{formatHours(hk2?.summary?.totalConvertedHours || 0)}</Text> giờ QĐ
                      </Text>
                    </View>
                  </View>

                  {!hk2?.classes || hk2.classes.length === 0 ? (
                    <View style={styles.emptyTermBox}>
                      <Text style={styles.emptyTermText}>Không có lớp học phần trong Học kỳ 2</Text>
                    </View>
                  ) : (
                    hk2.classes.map((item, idx) => (
                      <ClassItemCard key={`hk2-${idx}`} item={item} formatHours={formatHours} />
                    ))
                  )}
                </View>

                {/* NẾU CÓ CÁC KỲ KHÁC */}
                {otherSem.length > 0 && (
                  <View style={[styles.termSection, { marginTop: 16 }]}>
                    <View style={styles.termSectionHeader}>
                      <View style={[styles.termSectionBadge, { backgroundColor: '#7c3aed' }]}>
                        <Text style={styles.termSectionBadgeText}>CÁC ĐỢT KHÁC</Text>
                      </View>
                      <Text style={styles.termSectionStatsText}>{otherSem.length} lớp</Text>
                    </View>
                    {otherSem.map((item, idx) => (
                      <ClassItemCard key={`other-${idx}`} item={item} formatHours={formatHours} />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: CÔNG VIỆC KHÁC & MIỄN GIẢM */}
            {/* ========================================================================= */}
            {activeTab === 'otherTasks' && (
              <View>
                {/* THẺ MIỄN GIẢM ĐỊNH MỨC */}
                <View style={styles.exemptCard}>
                  <View style={styles.exemptCardHeader}>
                    <Ionicons name="shield-checkmark" size={18} color="#059669" />
                    <Text style={styles.exemptCardTitle}>Miễn Giảm Định Mức Chuẩn</Text>
                    <View style={styles.exemptBadge}>
                      <Text style={styles.exemptBadgeText}>
                        Tổng giảm: {formatHours(settlement?.exemptHours || 0)}h
                      </Text>
                    </View>
                  </View>
                  <View style={styles.exemptGrid}>
                    <View style={styles.exemptGridItem}>
                      <Text style={styles.exemptGridVal}>{formatHours(settlement?.exemptBreakdown?.position || 0)}h</Text>
                      <Text style={styles.exemptGridLbl}>Chức vụ</Text>
                    </View>
                    <View style={styles.exemptGridItem}>
                      <Text style={styles.exemptGridVal}>{formatHours(settlement?.exemptBreakdown?.maternity || 0)}h</Text>
                      <Text style={styles.exemptGridLbl}>Con nhỏ/Thai sản</Text>
                    </View>
                    <View style={styles.exemptGridItem}>
                      <Text style={styles.exemptGridVal}>{formatHours(settlement?.exemptBreakdown?.homeroom || 0)}h</Text>
                      <Text style={styles.exemptGridLbl}>Cố vấn / GVCN</Text>
                    </View>
                  </View>
                </View>

                {/* DANH SÁCH CÔNG VIỆC KHÁC */}
                <View style={styles.sectionHeaderWrap}>
                  <Text style={styles.sectionHeaderTitle}>Danh Mục Nhiệm Vụ & Công Việc Khác</Text>
                  <Text style={styles.sectionHeaderCount}>
                    Tổng: {formatHours(otherTasks?.totalConvertedHours || 0)} giờ quy đổi
                  </Text>
                </View>

                {!otherTasks?.tasks || otherTasks.tasks.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Ionicons name="folder-open-outline" size={44} color={Colors.textMuted} />
                    <Text style={styles.emptyTitle}>Chưa có công việc khác</Text>
                    <Text style={styles.emptySubtitle}>
                      Năm học này Thầy/Cô chưa có phân công hướng dẫn khóa luận, chấm thi hoặc công việc ngoài giờ.
                    </Text>
                  </View>
                ) : (
                  otherTasks.tasks.map((task, idx) => (
                    <View key={`task-${idx}`} style={styles.taskCard}>
                      <View style={styles.taskCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.taskName}>{task.taskName}</Text>
                          <View style={styles.taskTypeBadgeRow}>
                            <View style={styles.taskTypeBadge}>
                              <Text style={styles.taskTypeBadgeText}>{task.taskType}</Text>
                            </View>
                            <Text style={styles.taskSemesterTag}>HK{task.semester} • {task.schoolYear}</Text>
                          </View>
                        </View>
                        <View style={styles.taskHoursBox}>
                          <Text style={styles.taskHoursVal}>{formatHours(task.convertedHours)}</Text>
                          <Text style={styles.taskHoursLbl}>giờ quy đổi</Text>
                        </View>
                      </View>

                      <View style={styles.taskMetaRow}>
                        {task.studentCount > 0 && (
                          <View style={styles.taskMetaItem}>
                            <Ionicons name="people-outline" size={13} color="#64748b" />
                            <Text style={styles.taskMetaTxt}>{task.studentCount} SV</Text>
                          </View>
                        )}
                        <View style={styles.taskMetaItem}>
                          <Ionicons name="time-outline" size={13} color="#64748b" />
                          <Text style={styles.taskMetaTxt}>Gốc: {formatHours(task.baseHours)} {task.unit || 'h'}</Text>
                        </View>
                        <View style={styles.taskMetaItem}>
                          <Ionicons name="options-outline" size={13} color="#64748b" />
                          <Text style={styles.taskMetaTxt}>Hệ số: {task.coefficient}</Text>
                        </View>
                        <View style={[styles.approvalPill, task.approvalLevel >= 2 ? styles.approvalPillDone : styles.approvalPillPending]}>
                          <Ionicons
                            name={task.approvalLevel >= 2 ? "checkmark-circle" : "hourglass-outline"}
                            size={11}
                            color={task.approvalLevel >= 2 ? '#16a34a' : '#d97706'}
                          />
                          <Text style={[styles.approvalPillText, { color: task.approvalLevel >= 2 ? '#16a34a' : '#d97706' }]}>
                            {task.approvalStatusText}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Thẻ hiển thị 1 Lớp học phần chi tiết
 */
function ClassItemCard({ item, formatHours }) {
  const isApproved = item.approvalLevel >= 3;

  return (
    <View style={styles.classCard}>
      <View style={styles.classCardTop}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.classCourseName} numberOfLines={2}>{item.courseName}</Text>
          <Text style={styles.classCode}>{item.classCode} • {item.educationType || 'Chính quy'}</Text>
        </View>
        <View style={styles.classHoursBadge}>
          <Text style={styles.classHoursVal}>{formatHours(item.convertedHours)}</Text>
          <Text style={styles.classHoursLbl}>giờ quy đổi</Text>
        </View>
      </View>

      {/* 4 SPECS */}
      <View style={styles.classSpecsRow}>
        <View style={styles.classSpecBox}>
          <Text style={styles.classSpecNum}>{item.credits}</Text>
          <Text style={styles.classSpecLbl}>Tín chỉ</Text>
        </View>
        <View style={styles.classSpecBox}>
          <Text style={styles.classSpecNum}>{item.studentCount}</Text>
          <Text style={styles.classSpecLbl}>Sĩ số SV</Text>
        </View>
        <View style={styles.classSpecBox}>
          <Text style={styles.classSpecNum}>{item.scheduledPeriods}</Text>
          <Text style={styles.classSpecLbl}>Tiết TKB</Text>
        </View>
        <View style={styles.classSpecBox}>
          <Text style={styles.classSpecNum}>{item.classCoefficient || 1}</Text>
          <Text style={styles.classSpecLbl}>HS Lớp đông</Text>
        </View>
      </View>

      {/* APPROVAL FOOTER */}
      <View style={styles.classCardFooter}>
        <View style={styles.classTypePill}>
          <Text style={styles.classTypePillText}>{item.classType}</Text>
        </View>
        <View style={[styles.classApprovalBadge, isApproved ? styles.classApprovalDone : styles.classApprovalPending]}>
          <Ionicons
            name={isApproved ? "shield-checkmark" : "hourglass-outline"}
            size={12}
            color={isApproved ? '#15803d' : '#b45309'}
          />
          <Text style={[styles.classApprovalText, { color: isApproved ? '#15803d' : '#b45309' }]}>
            {item.approvalStatusText}
          </Text>
        </View>
      </View>

      {item.feedback ? (
        <View style={styles.classFeedbackBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={13} color="#64748b" />
          <Text style={styles.classFeedbackText}>Phản hồi GV: {item.feedback}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // HEADER
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // YEAR SELECTOR BAR
  yearBarWrapper: {
    backgroundColor: Colors.surface,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  yearScrollContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  yearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  yearChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  yearChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  yearChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  yearBadgeCurrent: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: '#dcfce7',
  },
  yearBadgeCurrentActive: {
    backgroundColor: '#ffffff',
  },
  yearBadgeCurrentText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16a34a',
  },
  yearBadgeCurrentTextActive: {
    color: Colors.primary,
  },

  // 3 SEGMENTED TABS
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
  },
  tabItemActive: {
    backgroundColor: '#e8f5e9',
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabItemTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // CONTENT
  content: { padding: 16, paddingBottom: 40 },
  loadingBox: { paddingVertical: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: Colors.textSecondary },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  // HERO CARD
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 14,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5 },
  heroHoursRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  heroHoursVal: { fontSize: 32, fontWeight: '900', color: '#16a34a' },
  heroUnit: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginLeft: 6 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeGreen: { backgroundColor: '#dcfce7' },
  statusBadgeOrange: { backgroundColor: '#fef3c7' },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  heroAmountBox: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  heroAmountLabel: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.3 },
  heroAmountVal: { fontSize: 20, fontWeight: '800', color: Colors.primary, marginTop: 2 },
  heroUnitPriceBox: { alignItems: 'flex-end' },
  heroUnitPriceLbl: { fontSize: 10, color: Colors.textMuted },
  heroUnitPriceVal: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginTop: 2 },
  lecturerMetaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 6,
  },
  lecturerMetaText: { fontSize: 12, color: Colors.textSecondary, flex: 1 },

  // BẢNG KÊ QUYẾT TOÁN CỘNG TRỪ
  cardContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitleText: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  cardDescText: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, marginBottom: 14 },
  calcList: { gap: 10 },
  calcRow: { flexDirection: 'row', alignItems: 'center' },
  calcSignBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  calcSignPlus: { backgroundColor: '#e0f2fe' },
  calcSignMinus: { backgroundColor: '#fee2e2' },
  calcSignEqual: { backgroundColor: '#fef3c7' },
  calcSignText: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  calcRowLabel: { fontSize: 13, color: Colors.textPrimary },
  calcRowSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  calcRowValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  calcUnit: { fontSize: 11, fontWeight: '400', color: Colors.textMuted },
  calcDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 2 },
  calcDividerThick: { height: 2, backgroundColor: '#e2e8f0', marginVertical: 4 },
  finalCalcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#86efac',
    marginTop: 4,
  },
  finalCalcTitle: { fontSize: 12, fontWeight: '800', color: '#15803d', letterSpacing: 0.3 },
  finalCalcSub: { fontSize: 11, color: '#166534', marginTop: 2 },
  finalHoursBadge: { alignItems: 'flex-end', marginLeft: 8 },
  finalHoursVal: { fontSize: 22, fontWeight: '900', color: '#15803d' },
  finalHoursUnit: { fontSize: 11, fontWeight: '600', color: '#166534' },

  // OVERVIEW CARD 2 KỲ
  semOverviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  overviewHeaderTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  overviewRow: { flexDirection: 'row' },
  overviewBox: { flex: 1 },
  overviewColDivider: { width: 1, backgroundColor: '#e2e8f0', marginHorizontal: 12 },
  overviewBoxHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overviewBoxTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  overviewBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  overviewBadgeTxt: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary },
  overviewHours: { fontSize: 18, fontWeight: '800', color: Colors.primary, marginTop: 4 },
  overviewHoursUnit: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary },
  overviewMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  // TAB 2: GIẢNG DẠY
  termSection: {},
  termSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  termSectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  termSectionBadgeText: { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  termSectionStats: {},
  termSectionStatsText: { fontSize: 12, color: Colors.textSecondary },
  emptyTermBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  emptyTermText: { fontSize: 12, color: Colors.textMuted },

  // CLASS CARD
  classCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  classCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  classCourseName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, lineHeight: 19 },
  classCode: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  classHoursBadge: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'flex-end',
  },
  classHoursVal: { fontSize: 15, fontWeight: '800', color: '#16a34a' },
  classHoursLbl: { fontSize: 9, color: '#15803d' },
  classSpecsRow: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  classSpecBox: { flex: 1, alignItems: 'center' },
  classSpecNum: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  classSpecLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  classCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  classTypePill: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  classTypePillText: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary },
  classApprovalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  classApprovalDone: { backgroundColor: '#dcfce7' },
  classApprovalPending: { backgroundColor: '#fef3c7' },
  classApprovalText: { fontSize: 10, fontWeight: '700' },
  classFeedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 6,
    borderRadius: 6,
    marginTop: 8,
    gap: 6,
  },
  classFeedbackText: { fontSize: 11, color: '#1d4ed8', flex: 1 },

  // TAB 3: CÔNG VIỆC KHÁC & MIỄN GIẢM
  exemptCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    marginBottom: 14,
  },
  exemptCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exemptCardTitle: { fontSize: 14, fontWeight: '700', color: '#065f46', flex: 1 },
  exemptBadge: { backgroundColor: '#059669', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  exemptBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  exemptGrid: { flexDirection: 'row', marginTop: 12, gap: 8 },
  exemptGridItem: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  exemptGridVal: { fontSize: 14, fontWeight: '800', color: '#047857' },
  exemptGridLbl: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },

  sectionHeaderWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeaderTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  sectionHeaderCount: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  taskCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  taskCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  taskName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, lineHeight: 19 },
  taskTypeBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  taskTypeBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  taskTypeBadgeText: { fontSize: 10, fontWeight: '600', color: Colors.textSecondary },
  taskSemesterTag: { fontSize: 11, color: Colors.textMuted },
  taskHoursBox: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  taskHoursVal: { fontSize: 15, fontWeight: '800', color: '#2563eb' },
  taskHoursLbl: { fontSize: 9, color: '#1d4ed8' },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 12,
  },
  taskMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  taskMetaTxt: { fontSize: 11, color: Colors.textSecondary },
  approvalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  approvalPillDone: { backgroundColor: '#dcfce7' },
  approvalPillPending: { backgroundColor: '#fef3c7' },
  approvalPillText: { fontSize: 10, fontWeight: '700' },
});
