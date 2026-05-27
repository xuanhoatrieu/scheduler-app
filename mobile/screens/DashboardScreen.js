import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ScheduleCard from '../components/ScheduleCard';
import { getExams, getFinance, getGrades, getSchedule } from '../services/api';

export default function DashboardScreen({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule', 'exams', 'grades', 'finance'
  
  const [scheduleData, setScheduleData] = useState([]);
  const [examData, setExamData] = useState([]);
  const [gradeData, setGradeData] = useState([]);
  const [financeData, setFinanceData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(user.lastSyncedAt);
  const [errorMsg, setErrorMsg] = useState('');

  // Tải dữ liệu ban đầu từ Cache cục bộ / Backend
  const loadData = async (forceSync = false) => {
    if (forceSync) {
      setSyncing(true);
    } else {
      setLoading(true);
    }
    setErrorMsg('');

    try {
      // 1. Tải Lịch học
      const scheduleRes = await getSchedule(forceSync);
      if (scheduleRes.success) {
        setScheduleData(scheduleRes.data);
        if (scheduleRes.lastSyncedAt) {
          setLastSync(scheduleRes.lastSyncedAt);
        }
      }

      // 2. Tải Lịch thi
      const examsRes = await getExams(forceSync);
      if (examsRes.success) {
        setExamData(examsRes.data);
      }

      // 3. Tải Bảng điểm
      const gradesRes = await getGrades(forceSync);
      if (gradesRes.success) {
        setGradeData(gradesRes.data);
      }

      // 4. Tải Học phí
      const financeRes = await getFinance(forceSync);
      if (financeRes.success) {
        setFinanceData(financeRes.data);
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setErrorMsg('Không thể tải một số dữ liệu. Vui lòng thử đồng bộ lại!');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Chưa đồng bộ';
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} - ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Hồ sơ cá nhân */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Text style={styles.userRoleBadge}>{user.role === 'student' ? 'Sinh viên' : 'Giảng viên'}</Text>
          <Text style={styles.userFullName} numberOfLines={1}>{user.fullName || 'Học viên TUAF'}</Text>
          <Text style={styles.userSubText}>
            {user.role === 'student' ? `Mã SV: ${user.username} • Lớp: ${user.className || 'Chưa xếp'}` : `Tài khoản: ${user.username}`}
          </Text>
          <Text style={styles.syncTime}>Đồng bộ lúc: {formatDateTime(lastSync)}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
          <Text style={styles.logoutBtnText}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      {/* Nút bấm đồng bộ nhanh */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.syncBtn, syncing && styles.syncingBtn]}
          onPress={() => loadData(true)}
          disabled={syncing}
          activeOpacity={0.9}
        >
          {syncing ? (
            <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
          ) : null}
          <Text style={styles.syncBtnText}>
            {syncing ? 'ĐANG ĐỒNG BỘ...' : '🔄 ĐỒNG BỘ MỚI NHẤT'}
          </Text>
        </TouchableOpacity>
      </View>

      {errorMsg ? <Text style={styles.errorText}>⚠️ {errorMsg}</Text> : null}

      {/* Tabs Chuyển đổi màn hình */}
      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'schedule' && styles.activeTabButton]}
            onPress={() => setActiveTab('schedule')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'schedule' && styles.activeTabButtonText]}>📅 Lịch Học</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'exams' && styles.activeTabButton]}
            onPress={() => setActiveTab('exams')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'exams' && styles.activeTabButtonText]}>📝 Lịch Thi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'grades' && styles.activeTabButton]}
            onPress={() => setActiveTab('grades')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'grades' && styles.activeTabButtonText]}>🏆 Điểm Số</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'finance' && styles.activeTabButton]}
            onPress={() => setActiveTab('finance')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'finance' && styles.activeTabButtonText]}>💰 Học Phí</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Phần thân nội dung hiển thị */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#2e7d32" size="large" />
          <Text style={styles.loadingText}>Đang lấy dữ liệu từ Database cache...</Text>
        </View>
      ) : (
        <View style={styles.contentContainer}>
          {/* TAB 1: LỊCH HỌC */}
          {activeTab === 'schedule' && (
            <FlatList
              data={scheduleData}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => <ScheduleCard item={item} />}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Chưa có dữ liệu lịch học trong học kỳ này!</Text>
                </View>
              }
            />
          )}

          {/* TAB 2: LỊCH THI */}
          {activeTab === 'exams' && (
            <FlatList
              data={examData}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <View style={styles.examCard}>
                  <Text style={styles.examCourseName}>{item.courseName}</Text>
                  <View style={styles.examDetails}>
                    <Text style={styles.examDetailText}>📅 Ngày thi: <Text style={styles.bold}>{item.examDate}</Text></Text>
                    <Text style={styles.examDetailText}>⏰ Giờ/Ca thi: <Text style={styles.bold}>{item.examTime}</Text></Text>
                    <Text style={styles.examDetailText}>📍 Phòng thi: <Text style={styles.bold}>{item.room || 'Chưa xếp'}</Text></Text>
                    {item.seatNumber ? (
                      <Text style={styles.examDetailText}>🪑 Số báo danh: <Text style={styles.bold}>{item.seatNumber}</Text></Text>
                    ) : null}
                    {item.examFormat ? (
                      <Text style={styles.examDetailText}>📄 Hình thức: <Text style={styles.bold}>{item.examFormat}</Text></Text>
                    ) : null}
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Chưa có thông tin lịch thi được công bố!</Text>
                </View>
              }
            />
          )}

          {/* TAB 3: ĐIỂM SỐ */}
          {activeTab === 'grades' && (
            <FlatList
              data={gradeData}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <View style={styles.gradeCard}>
                  <View style={styles.gradeHeader}>
                    <Text style={styles.gradeCourseName} numberOfLines={1}>{item.courseName}</Text>
                    <View style={styles.letterGradeBadge}>
                      <Text style={styles.letterGradeText}>{item.letterGrade || 'N/A'}</Text>
                    </View>
                  </View>
                  <View style={styles.gradeGrid}>
                    <View style={styles.gradeItem}><Text style={styles.gradeVal}>{item.processGrade ?? '-'}</Text><Text style={styles.gradeLbl}>Chuyên cần</Text></View>
                    <View style={styles.gradeItem}><Text style={styles.gradeVal}>{item.midtermGrade ?? '-'}</Text><Text style={styles.gradeLbl}>Giữa kỳ</Text></View>
                    <View style={styles.gradeItem}><Text style={styles.gradeVal}>{item.finalGrade ?? '-'}</Text><Text style={styles.gradeLbl}>Cuối kỳ</Text></View>
                    <View style={styles.gradeItem}><Text style={styles.gradeValBold}>{item.totalGrade10 ?? '-'}</Text><Text style={styles.gradeLblBold}>Tổng kết hệ 10</Text></View>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Chưa có điểm số được công bố trong học kỳ này!</Text>
                </View>
              }
            />
          )}

          {/* TAB 4: HỌC PHÍ */}
          {activeTab === 'finance' && (
            <ScrollView style={styles.financeScroll} contentContainerStyle={{ paddingBottom: 24 }}>
              {financeData ? (
                <View>
                  <View style={styles.tuitionSummaryCard}>
                    <Text style={styles.tuitionTitle}>TỔNG KẾT TÀI CHÍNH HỌC KỲ</Text>
                    
                    <View style={styles.tuitionRow}>
                      <Text style={styles.tuitionLbl}>Tổng học phí phải nộp:</Text>
                      <Text style={styles.tuitionVal}>{financeData.totalTuition.toLocaleString()}đ</Text>
                    </View>
                    <View style={styles.tuitionRow}>
                      <Text style={styles.tuitionLbl}>Đã nộp học phí:</Text>
                      <Text style={[styles.tuitionVal, { color: '#2e7d32' }]}>{financeData.paidTuition.toLocaleString()}đ</Text>
                    </View>
                    
                    <View style={styles.divider} />
                    
                    <View style={styles.tuitionRow}>
                      <Text style={styles.tuitionLblBold}>Học phí còn nợ:</Text>
                      <Text style={[styles.tuitionValBold, { color: financeData.debtTuition > 0 ? '#ef4444' : '#2e7d32' }]}>
                        {financeData.debtTuition.toLocaleString()}đ
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.invoiceTitle}>CHI TIẾT CÁC HÓA ĐƠN ĐÃ NỘP</Text>
                  {financeData.invoiceDetails && financeData.invoiceDetails.length > 0 ? (
                    financeData.invoiceDetails.map((inv, idx) => (
                      <View key={idx} style={styles.invoiceCard}>
                        <View style={styles.invoiceHeader}>
                          <Text style={styles.invoiceNo}>Số HĐ: {inv.invoiceNo || inv.referenceNo || 'N/A'}</Text>
                          <Text style={styles.invoiceAmount}>+{inv.amount.toLocaleString()}đ</Text>
                        </View>
                        <Text style={styles.invoiceDate}>Ngày nộp hóa đơn: {inv.date || 'Chưa ghi nhận'}</Text>
                        <Text style={styles.invoiceNote}>{inv.description || 'Nộp tiền học phí học phần'}</Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>Chưa có biên lai thanh toán học phí nào được lưu!</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Chưa có thông tin công nợ tài chính!</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  userInfo: {
    flex: 1,
  },
  userRoleBadge: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
    overflow: 'hidden',
  },
  userFullName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  userSubText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  syncTime: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoutBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  syncBtn: {
    backgroundColor: '#2e7d32',
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  syncingBtn: {
    backgroundColor: '#81c784',
  },
  syncBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  errorText: {
    color: '#ef4444',
    backgroundColor: '#fef2f2',
    padding: 8,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 12,
  },
  tabContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginTop: 12,
  },
  tabScroll: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  activeTabButton: {
    backgroundColor: '#2e7d32',
  },
  tabButtonText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  activeTabButtonText: {
    color: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },
  contentContainer: {
    flex: 1,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  // EXAM TAB
  examCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  examCourseName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  examDetails: {
    paddingLeft: 4,
  },
  examDetailText: {
    fontSize: 13,
    color: '#475569',
    marginVertical: 2,
  },
  bold: {
    fontWeight: '600',
    color: '#0f172a',
  },
  // GRADE TAB
  gradeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  gradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  gradeCourseName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1e293b',
    flex: 1,
    marginRight: 12,
  },
  letterGradeBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  letterGradeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0369a1',
  },
  gradeGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gradeItem: {
    alignItems: 'center',
    flex: 1,
  },
  gradeVal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  gradeLbl: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  gradeValBold: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  gradeLblBold: {
    fontSize: 10,
    color: '#2e7d32',
    fontWeight: 'bold',
    marginTop: 2,
  },
  // FINANCE TAB
  financeScroll: {
    flex: 1,
    padding: 16,
  },
  tuitionSummaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 20,
  },
  tuitionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  tuitionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  tuitionLbl: {
    fontSize: 13,
    color: '#64748b',
  },
  tuitionVal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  divider: {
    height: 1,
    backgroundColor: '#cbd5e1',
    marginVertical: 10,
  },
  tuitionLblBold: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  tuitionValBold: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  invoiceTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  invoiceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#2e7d32',
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceNo: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  invoiceAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  invoiceDate: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
  invoiceNote: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
