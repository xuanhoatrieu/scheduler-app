import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getHomeroomAlerts,
  getHomeroomClasses,
  getHomeroomRegistration,
  getHomeroomTuition,
  markHomeroomAlertRead,
} from '../../services/api';
import { Colors } from '../../theme/colors';

const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '0 đ';
  return Number(amount).toLocaleString('vi-VN') + ' đ';
};

export default function HomeroomScreen({ user }) {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('registration'); // 'registration' | 'tuition' | 'alerts'

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tab 1: Registration data
  const [regData, setRegData] = useState(null);
  const [regLoading, setRegLoading] = useState(false);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);

  // Tab 2: Tuition data
  const [tuitionData, setTuitionData] = useState(null);
  const [tuitionLoading, setTuitionLoading] = useState(false);
  const [tuitionFilter, setTuitionFilter] = useState('all'); // 'all' | 'debt' | 'settled' | 'surplus'

  // Tab 3: Alerts data
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  // 1. Load classes first
  const loadClasses = async () => {
    try {
      const res = await getHomeroomClasses();
      if (res.success && res.data && res.data.length > 0) {
        setClasses(res.data);
        if (!selectedClassId) {
          setSelectedClassId(res.data[0].idLop);
        }
      } else {
        setClasses([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 2. Load tab specific data
  const loadTabData = async () => {
    if (activeSubTab === 'registration') {
      if (!selectedClassId) return;
      setRegLoading(true);
      const res = await getHomeroomRegistration(selectedClassId);
      if (res.success) setRegData(res.data);
      setRegLoading(false);
    } else if (activeSubTab === 'tuition') {
      if (!selectedClassId) return;
      setTuitionLoading(true);
      const res = await getHomeroomTuition(selectedClassId);
      if (res.success) setTuitionData(res.data);
      setTuitionLoading(false);
    } else if (activeSubTab === 'alerts') {
      setAlertsLoading(true);
      const res = await getHomeroomAlerts();
      if (res.success) setAlerts(res.data || []);
      setAlertsLoading(false);
    }
  };

  useEffect(() => {
    loadClasses().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedClassId || activeSubTab === 'alerts') {
      loadTabData();
    }
  }, [selectedClassId, activeSubTab]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadClasses();
    await loadTabData();
    setRefreshing(false);
  }, [selectedClassId, activeSubTab]);

  const handleMarkRead = async (alertId) => {
    await markHomeroomAlertRead(alertId);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, isRead: true } : a));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải thông tin chủ nhiệm...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Chủ Nhiệm</Text>
          <Text style={styles.headerSub}>{user?.fullName || 'Giáo viên chủ nhiệm'}</Text>
        </View>
        <View style={styles.badgeWrap}>
          <Ionicons name="school" size={16} color="#fff" />
          <Text style={styles.badgeText}>{classes.length} lớp phụ trách</Text>
        </View>
      </View>

      {/* CLASS SELECTOR STRIP */}
      {classes.length > 0 && activeSubTab !== 'alerts' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.classStrip}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {classes.map(c => {
            const isSelected = selectedClassId === c.idLop;
            return (
              <TouchableOpacity
                key={c.idLop}
                style={[styles.classChip, isSelected && styles.classChipSelected]}
                onPress={() => setSelectedClassId(c.idLop)}
              >
                <Text style={[styles.classChipText, isSelected && styles.classChipTextSelected]}>
                  {c.className || c.classCode}
                </Text>
                <Text style={[styles.classChipSub, isSelected && { color: '#e8f5e9' }]}>
                  {c.studentCount ? `${c.studentCount} SV` : 'Khóa ' + c.cohort}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* 3 SUB-TABS SELECTOR */}
      <View style={styles.tabBarWrap}>
        <TouchableOpacity
          style={[styles.subTabBtn, activeSubTab === 'registration' && styles.subTabActive]}
          onPress={() => setActiveSubTab('registration')}
        >
          <Ionicons
            name={activeSubTab === 'registration' ? 'book' : 'book-outline'}
            size={16}
            color={activeSubTab === 'registration' ? Colors.primary : Colors.textMuted}
          />
          <Text style={[styles.subTabText, activeSubTab === 'registration' && styles.subTabTextActive]}>
            Đăng ký học
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.subTabBtn, activeSubTab === 'tuition' && styles.subTabActive]}
          onPress={() => setActiveSubTab('tuition')}
        >
          <Ionicons
            name={activeSubTab === 'tuition' ? 'wallet' : 'wallet-outline'}
            size={16}
            color={activeSubTab === 'tuition' ? Colors.primary : Colors.textMuted}
          />
          <Text style={[styles.subTabText, activeSubTab === 'tuition' && styles.subTabTextActive]}>
            Học phí
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.subTabBtn, activeSubTab === 'alerts' && styles.subTabActive]}
          onPress={() => setActiveSubTab('alerts')}
        >
          <Ionicons
            name={activeSubTab === 'alerts' ? 'notifications' : 'notifications-outline'}
            size={16}
            color={activeSubTab === 'alerts' ? Colors.primary : Colors.textMuted}
          />
          <Text style={[styles.subTabText, activeSubTab === 'alerts' && styles.subTabTextActive]}>
            Nhật ký điểm danh
          </Text>
          {alerts.filter(a => !a.isRead).length > 0 && (
            <View style={styles.unreadDot} />
          )}
        </TouchableOpacity>
      </View>

      {/* SEARCH BAR (if applicable) */}
      {activeSubTab !== 'alerts' && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo tên hoặc mã sinh viên..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 1: COURSE REGISTRATION */}
      {/* ========================================================= */}
      {activeSubTab === 'registration' && (
        regLoading ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Đang tổng hợp thông tin đăng ký học...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          >
            {/* SUMMARY STATS */}
            {regData?.summary && (
              <View style={styles.kpiContainer}>
                <View style={styles.kpiBox}>
                  <Text style={styles.kpiVal}>{regData.summary.totalStudents}</Text>
                  <Text style={styles.kpiLbl}>Sĩ số lớp</Text>
                </View>
                <View style={styles.kpiBox}>
                  <Text style={[styles.kpiVal, { color: '#2e7d32' }]}>{regData.summary.normalCount}</Text>
                  <Text style={styles.kpiLbl}>Đủ môn KH</Text>
                </View>
                <View style={styles.kpiBox}>
                  <Text style={[styles.kpiVal, { color: '#c62828' }]}>{regData.summary.warningCount}</Text>
                  <Text style={styles.kpiLbl}>Thiếu môn ⚠️</Text>
                </View>
                <View style={styles.kpiBox}>
                  <Text style={[styles.kpiVal, { color: Colors.primary }]}>{regData.summary.avgCredits}</Text>
                  <Text style={styles.kpiLbl}>TB Tín chỉ</Text>
                </View>
              </View>
            )}

            {/* PLANNED COURSES INFO BANNER */}
            {regData?.plannedCourses && regData.plannedCourses.length > 0 && (
              <View style={styles.plannedBanner}>
                <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                <Text style={styles.plannedBannerText}>
                  Kế hoạch mở kỳ này: <Text style={{ fontWeight: '700' }}>{regData.plannedCourses.length} môn học phần</Text>
                </Text>
              </View>
            )}

            {/* STUDENTS REGISTRATION LIST */}
            {regData?.students && regData.students.length > 0 ? (
              regData.students
                .filter(s => !searchQuery || (s.studentName && s.studentName.toLowerCase().includes(searchQuery.toLowerCase())) || (s.studentCode && s.studentCode.toLowerCase().includes(searchQuery.toLowerCase())))
                .map((stu, idx) => (
                  <TouchableOpacity
                    key={stu.studentCode}
                    style={[styles.regCard, stu.hasWarning && styles.regCardWarning]}
                    onPress={() => setSelectedStudentDetail(stu)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.regCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stuName}>{stu.studentName}</Text>
                        <Text style={styles.stuCode}>{stu.studentCode}</Text>
                      </View>
                      <View style={styles.creditsBadge}>
                        <Text style={styles.creditsText}>{stu.totalCredits} TC</Text>
                        <Text style={styles.creditsSub}>{stu.registeredCount} môn</Text>
                      </View>
                    </View>

                    {stu.hasWarning ? (
                      <View style={styles.warningRow}>
                        <Ionicons name="warning" size={14} color="#c62828" />
                        <Text style={styles.warningText}>
                          Chưa đăng ký {stu.missingPlannedCourses.length} môn kế hoạch
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color="#c62828" style={{ marginLeft: 'auto' }} />
                      </View>
                    ) : (
                      <View style={styles.okRow}>
                        <Ionicons name="checkmark-circle" size={14} color="#2e7d32" />
                        <Text style={styles.okText}>Đã đăng ký đầy đủ theo kế hoạch</Text>
                        <Ionicons name="chevron-forward" size={14} color="#2e7d32" style={{ marginLeft: 'auto' }} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="book-outline" size={56} color={Colors.borderLight} />
                <Text style={styles.emptyText}>Chưa có dữ liệu đăng ký học kỳ này</Text>
              </View>
            )}
          </ScrollView>
        )
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 2: TUITION */}
      {/* ========================================================= */}
      {activeSubTab === 'tuition' && (
        tuitionLoading ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Đang tải tình hình công nợ học phí...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          >
            {/* TUITION OVERVIEW CARD */}
            {tuitionData?.summary && (
              <View style={styles.tuitionOverviewCard}>
                <Text style={styles.tuitionOverviewTitle}>Tổng Hợp Học Phí Lớp</Text>
                <View style={styles.tuitionSummaryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.debtTotalVal}>{formatCurrency(tuitionData.summary.totalDebtAmount)}</Text>
                    <Text style={styles.debtTotalLbl}>Tổng tiền nợ ({tuitionData.summary.debtCount} SV)</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.paidTotalVal}>{formatCurrency(tuitionData.summary.totalPaidAmount)}</Text>
                    <Text style={styles.paidTotalLbl}>Đã nộp</Text>
                  </View>
                </View>

                {/* FILTER SEGMENTS */}
                <View style={styles.filterRow}>
                  {[
                    { id: 'all', label: `Tất cả (${tuitionData.summary.totalStudents})` },
                    { id: 'debt', label: `Còn nợ (${tuitionData.summary.debtCount})` },
                    { id: 'settled', label: `Đã nộp (${tuitionData.summary.settledCount})` },
                    { id: 'surplus', label: `Dư (${tuitionData.summary.surplusCount})` },
                  ].map(f => (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.filterChip, tuitionFilter === f.id && styles.filterChipActive]}
                      onPress={() => setTuitionFilter(f.id)}
                    >
                      <Text style={[styles.filterChipText, tuitionFilter === f.id && styles.filterChipTextActive]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* STUDENTS TUITION LIST */}
            {tuitionData?.students && tuitionData.students.length > 0 ? (
              tuitionData.students
                .filter(s => {
                  if (tuitionFilter === 'debt') return s.status === 'debt';
                  if (tuitionFilter === 'settled') return s.status === 'settled';
                  if (tuitionFilter === 'surplus') return s.status === 'surplus';
                  return true;
                })
                .filter(s => !searchQuery || (s.studentName && s.studentName.toLowerCase().includes(searchQuery.toLowerCase())) || (s.studentCode && s.studentCode.toLowerCase().includes(searchQuery.toLowerCase())))
                .map((stu, idx) => (
                  <View key={stu.studentCode} style={styles.tuitionCard}>
                    <View style={styles.tuitionCardMain}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stuName}>{stu.studentName}</Text>
                        <Text style={styles.stuCode}>{stu.studentCode}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        {stu.status === 'debt' && (
                          <View style={styles.debtTag}>
                            <Text style={styles.debtTagText}>Nợ: {formatCurrency(stu.debtAmount)}</Text>
                          </View>
                        )}
                        {stu.status === 'settled' && (
                          <View style={styles.settledTag}>
                            <Text style={styles.settledTagText}>Đã hoàn thành</Text>
                          </View>
                        )}
                        {stu.status === 'surplus' && (
                          <View style={styles.surplusTag}>
                            <Text style={styles.surplusTagText}>Dư: {formatCurrency(stu.surplusAmount)}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.tuitionDetailRow}>
                      <Text style={styles.tuitionDetailText}>Phải nộp: {formatCurrency(stu.mustPay)}</Text>
                      <Text style={styles.tuitionDetailText}>Đã nộp: {formatCurrency(stu.paid)}</Text>
                    </View>
                  </View>
                ))
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="wallet-outline" size={56} color={Colors.borderLight} />
                <Text style={styles.emptyText}>Không tìm thấy sinh viên nào!</Text>
              </View>
            )}
          </ScrollView>
        )
      )}

      {/* ========================================================= */}
      {/* SUB-TAB 3: ATTENDANCE ALERTS FROM COURSE LECTURERS */}
      {/* ========================================================= */}
      {activeSubTab === 'alerts' && (
        alertsLoading ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Đang tải nhật ký điểm danh...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          >
            {alerts.length > 0 ? (
              alerts.map(alert => {
                let abnormalList = [];
                try {
                  abnormalList = JSON.parse(alert.studentDetails || '[]');
                } catch (e) {}

                return (
                  <View key={alert.id} style={[styles.alertCard, !alert.isRead && styles.alertCardUnread]}>
                    <View style={styles.alertHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.alertCourseName}>{alert.courseName}</Text>
                          {!alert.isRead && <View style={styles.newBadge}><Text style={styles.newBadgeText}>MỚI</Text></View>}
                        </View>
                        <Text style={styles.alertMeta}>
                          {alert.homeroomClass} • Ngày {alert.sessionDate} • Phòng {alert.room || 'Chưa rõ'}
                        </Text>
                      </View>
                      <View style={styles.alertCounts}>
                        {alert.absentCount > 0 && (
                          <View style={[styles.countPill, { backgroundColor: '#ffebee' }]}>
                            <Text style={[styles.countPillText, { color: '#c62828' }]}>{alert.absentCount} Vắng</Text>
                          </View>
                        )}
                        {alert.lateCount > 0 && (
                          <View style={[styles.countPill, { backgroundColor: '#fff3e0' }]}>
                            <Text style={[styles.countPillText, { color: '#e65100' }]}>{alert.lateCount} Muộn</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <Text style={styles.alertTeacher}>
                      Giảng viên học phần: <Text style={{ fontWeight: '700' }}>{alert.courseTeacherName}</Text>
                    </Text>

                    {/* LIST OF ABNORMAL STUDENTS */}
                    <View style={styles.alertStudentList}>
                      {abnormalList.map((st, sIdx) => (
                        <View key={sIdx} style={styles.abnormalRow}>
                          <Ionicons
                            name={st.status === 'absent' ? 'close-circle' : 'time'}
                            size={14}
                            color={st.status === 'absent' ? '#c62828' : '#e65100'}
                          />
                          <Text style={styles.abnormalName}>{st.studentName} ({st.studentCode})</Text>
                          <Text style={styles.abnormalStatus}>
                            {st.status === 'absent' ? 'Vắng' : (st.status === 'late' ? 'Muộn' : 'Có phép')}
                          </Text>
                          {st.note ? <Text style={styles.abnormalNote}>— {st.note}</Text> : null}
                        </View>
                      ))}
                    </View>

                    {!alert.isRead && (
                      <TouchableOpacity style={styles.markReadBtn} onPress={() => handleMarkRead(alert.id)}>
                        <Ionicons name="checkmark-circle-outline" size={14} color={Colors.primary} />
                        <Text style={styles.markReadText}>Đánh dấu đã xem</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="notifications-outline" size={56} color={Colors.borderLight} />
                <Text style={styles.emptyText}>Chưa có thông báo điểm danh nào!</Text>
                <Text style={styles.emptySub}>Khi GV học phần điểm danh có sinh viên vắng/muộn, thông báo sẽ hiển thị tại đây.</Text>
              </View>
            )}
          </ScrollView>
        )
      )}

      {/* MODAL STUDENT REGISTRATION DETAIL */}
      <Modal
        visible={Boolean(selectedStudentDetail)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedStudentDetail(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{selectedStudentDetail?.studentName}</Text>
                <Text style={styles.modalSub}>{selectedStudentDetail?.studentCode} • Tổng: {selectedStudentDetail?.totalCredits} TC</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedStudentDetail(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#555" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {/* WARNING MISSING COURSES */}
              {selectedStudentDetail?.missingPlannedCourses && selectedStudentDetail.missingPlannedCourses.length > 0 && (
                <View style={styles.modalSection}>
                  <Text style={[styles.modalSectionTitle, { color: '#c62828' }]}>
                    ⚠️ Môn học theo kế hoạch chưa đăng ký ({selectedStudentDetail.missingPlannedCourses.length}):
                  </Text>
                  {selectedStudentDetail.missingPlannedCourses.map((mc, mIdx) => (
                    <View key={mIdx} style={styles.missingCourseItem}>
                      <Ionicons name="alert-circle" size={16} color="#c62828" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.missingCourseName}>{mc.courseName}</Text>
                        <Text style={styles.missingCourseCode}>{mc.courseCode} • {mc.credits} TC</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* REGISTERED COURSES */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>
                  📚 Danh sách môn đã đăng ký ({selectedStudentDetail?.registeredCourses?.length || 0}):
                </Text>
                {selectedStudentDetail?.registeredCourses?.map((rc, rIdx) => (
                  <View key={rIdx} style={styles.regCourseItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.regCourseName}>{rc.courseName}</Text>
                      <Text style={styles.regCourseCode}>{rc.courseCode} • {rc.credits} TC • {rc.classSection || ''}</Text>
                    </View>
                    <View style={[styles.retakeTag, rc.isRetake ? { backgroundColor: '#fff3e0' } : { backgroundColor: '#e8f5e9' }]}>
                      <Text style={[styles.retakeTagText, rc.isRetake ? { color: '#e65100' } : { color: '#2e7d32' }]}>
                        {rc.tag}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  badgeWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  classStrip: {
    backgroundColor: Colors.surface, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  classChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    backgroundColor: '#f0f2f5', borderWidth: 1, borderColor: '#e4e6ea',
  },
  classChipSelected: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
  },
  classChipText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  classChipTextSelected: { color: '#ffffff' },
  classChipSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  tabBarWrap: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    gap: 8,
  },
  subTabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: 10, backgroundColor: '#f5f5f5',
  },
  subTabActive: { backgroundColor: Colors.primary + '15' },
  subTabText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  subTabTextActive: { color: Colors.primary },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#c62828', position: 'absolute', top: 6, right: 8 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, height: 38,
    backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  loadingText: { marginTop: 10, fontSize: 13, color: Colors.textSecondary },
  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyText: { fontSize: 15, fontWeight: '700', color: Colors.textMuted, marginTop: 12 },
  emptySub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
  kpiContainer: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 12,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: Colors.borderLight, gap: 8,
  },
  kpiBox: { flex: 1, alignItems: 'center' },
  kpiVal: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  kpiLbl: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  plannedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 10, padding: 10, borderRadius: 10,
    backgroundColor: '#e8f5e9', borderWidth: 1, borderColor: '#c8e6c9',
  },
  plannedBannerText: { fontSize: 12, color: '#1b5e20' },
  regCard: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginTop: 10,
    padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderLight,
  },
  regCardWarning: { borderColor: '#ffcdd2', backgroundColor: '#fffbfa' },
  regCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  stuName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  stuCode: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  creditsBadge: { alignItems: 'flex-end' },
  creditsText: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  creditsSub: { fontSize: 11, color: Colors.textMuted },
  warningRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#ffebee',
  },
  warningText: { fontSize: 12, color: '#c62828', fontWeight: '700' },
  okRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e8f5e9',
  },
  okText: { fontSize: 12, color: '#2e7d32' },
  tuitionOverviewCard: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginTop: 12,
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.borderLight,
  },
  tuitionOverviewTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, textTransform: 'uppercase' },
  tuitionSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  debtTotalVal: { fontSize: 20, fontWeight: '800', color: '#c62828' },
  debtTotalLbl: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  paidTotalVal: { fontSize: 16, fontWeight: '700', color: '#2e7d32' },
  paidTotalLbl: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#f0f2f5',
  },
  filterChipActive: { backgroundColor: Colors.primary },
  filterChipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  filterChipTextActive: { color: '#ffffff' },
  tuitionCard: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginTop: 8,
    padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderLight,
  },
  tuitionCardMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  debtTag: { backgroundColor: '#ffebee', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  debtTagText: { color: '#c62828', fontWeight: '700', fontSize: 12 },
  settledTag: { backgroundColor: '#e8f5e9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  settledTagText: { color: '#2e7d32', fontWeight: '700', fontSize: 12 },
  surplusTag: { backgroundColor: '#e1f5fe', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  surplusTagText: { color: '#0288d1', fontWeight: '700', fontSize: 12 },
  tuitionDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  tuitionDetailText: { fontSize: 11, color: Colors.textMuted },
  alertCard: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginTop: 10,
    padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderLight,
  },
  alertCardUnread: { borderColor: Colors.primary, borderWidth: 1.5 },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  alertCourseName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  alertMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  alertCounts: { flexDirection: 'row', gap: 6 },
  countPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  countPillText: { fontSize: 11, fontWeight: '800' },
  alertTeacher: { fontSize: 12, color: Colors.textSecondary, marginTop: 8 },
  alertStudentList: {
    backgroundColor: '#fafafa', borderRadius: 10, padding: 8,
    marginTop: 8, gap: 4,
  },
  abnormalRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  abnormalName: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  abnormalStatus: { fontSize: 11, color: '#c62828', fontWeight: '700' },
  abnormalNote: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  newBadge: { backgroundColor: '#c62828', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  newBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  markReadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-end', marginTop: 8,
  },
  markReadText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  modalSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  modalSection: { marginTop: 12 },
  modalSectionTitle: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  missingCourseItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ffebee', padding: 10, borderRadius: 8, marginBottom: 6,
  },
  missingCourseName: { fontSize: 13, fontWeight: '700', color: '#c62828' },
  missingCourseCode: { fontSize: 11, color: '#b71c1c', marginTop: 1 },
  regCourseItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  regCourseName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  regCourseCode: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  retakeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  retakeTagText: { fontSize: 10, fontWeight: '700' },
});
