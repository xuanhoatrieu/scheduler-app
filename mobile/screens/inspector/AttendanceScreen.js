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
import { getInspectorClassesByDate, submitAttendance } from '../../services/api';
import { Colors } from '../../theme/colors';

const DAY_NAMES = {
  2: 'Thứ Hai', 3: 'Thứ Ba', 4: 'Thứ Tư', 5: 'Thứ Năm',
  6: 'Thứ Sáu', 7: 'Thứ Bảy', 8: 'Chủ Nhật',
};

const STATUS_CONFIG = {
  on_time: { label: 'Đúng giờ', color: '#2e7d32', bg: '#e8f5e9', icon: 'checkmark-circle' },
  late: { label: 'Đi muộn', color: '#e65100', bg: '#fff3e0', icon: 'alert-circle' },
  early_leave: { label: 'Về sớm', color: '#f57c00', bg: '#fff8e1', icon: 'time' },
  rescheduled_permitted: { label: 'Đổi giờ (Có phép)', color: '#0277bd', bg: '#e1f5fe', icon: 'swap-horizontal' },
  rescheduled_unpermitted: { label: 'Tự ý đổi giờ', color: '#c62828', bg: '#ffebee', icon: 'close-circle' },
  rescheduled: { label: 'Đổi giờ', color: '#0277bd', bg: '#e1f5fe', icon: 'swap-horizontal' },
  substitute: { label: 'Dạy thay', color: '#5c6bc0', bg: '#ede7f6', icon: 'people' },
  absent: { label: 'Vắng mặt', color: '#c62828', bg: '#ffebee', icon: 'close-circle' },
  exempt: { label: 'Được miễn', color: '#00838f', bg: '#e0f7fa', icon: 'shield-checkmark' },
  pending: { label: 'Chưa kiểm tra', color: Colors.textMuted, bg: '#f5f5f5', icon: 'help-circle' },
};

const formatTime = (dateStr) => {
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

export default function AttendanceScreen({ user }) {
  const VN_TZ = 'Asia/Ho_Chi_Minh';
  const getTodayStr = () => {
    const now = new Date();
    const today = new Date(now.toLocaleString('en-US', { timeZone: VN_TZ }));
    return today.toISOString().split('T')[0];
  };

  const [currentDate, setCurrentDate] = useState(getTodayStr());
  const [classes, setClasses] = useState([]);
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState('on_time');
  const [hasPermission, setHasPermission] = useState(true);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [lateMinutes, setLateMinutes] = useState('0');
  const [earlyMinutes, setEarlyMinutes] = useState('0');
  const [rescheduledDate, setRescheduledDate] = useState('');
  const [rescheduledReason, setRescheduledReason] = useState('');
  const [substituteTeacher, setSubstituteTeacher] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const loadData = async (dateStr = currentDate) => {
    try {
      const res = await getInspectorClassesByDate(dateStr);
      if (res.success) {
        setClasses(res.data || []);
        setDayOfWeek(res.dayOfWeek);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData(currentDate).finally(() => setLoading(false));
  }, [currentDate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(currentDate);
    setRefreshing(false);
  }, [currentDate]);

  const changeDate = (days) => {
    const d = new Date(currentDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setCurrentDate(d.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setCurrentDate(getTodayStr());
  };

  const openModal = (cls) => {
    setSelectedClass(cls);
    setSubmitError('');

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    if (cls.attendance) {
      const att = cls.attendance;
      setSelectedStatus(att.status === 'pending' ? 'on_time' : att.status);
      setHasPermission(att.hasPermission !== false);
      setCheckInTime(att.checkInTime ? formatTime(att.checkInTime) : currentTime);
      setCheckOutTime(att.checkOutTime ? formatTime(att.checkOutTime) : '');
      setLateMinutes(String(att.lateMinutes || '0'));
      setEarlyMinutes(String(att.earlyMinutes || '0'));
      setRescheduledDate(att.rescheduledDate || '');
      setRescheduledReason(att.rescheduledReason || '');
      setSubstituteTeacher(att.substituteTeacher || '');
      setNote(att.note || '');
    } else {
      setSelectedStatus('on_time');
      setHasPermission(true);
      setCheckInTime(currentTime);
      setCheckOutTime('');
      setLateMinutes('0');
      setEarlyMinutes('0');
      setRescheduledDate('');
      setRescheduledReason('');
      setSubstituteTeacher('');
      setNote('');
    }
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!selectedClass) return;
    setSubmitting(true);
    setSubmitError('');

    const now = new Date();
    let checkInDate = null;
    let checkOutDate = null;

    if (checkInTime && /^([01]\d|2[0-3]):([0-5]\d)$/.test(checkInTime)) {
      const [h, m] = checkInTime.split(':').map(Number);
      checkInDate = new Date(now);
      checkInDate.setHours(h, m, 0, 0);
    }

    if (checkOutTime && /^([01]\d|2[0-3]):([0-5]\d)$/.test(checkOutTime)) {
      const [h, m] = checkOutTime.split(':').map(Number);
      checkOutDate = new Date(now);
      checkOutDate.setHours(h, m, 0, 0);
    }

    const payload = {
      scheduleId: selectedClass.scheduleId,
      date: currentDate,
      status: selectedStatus,
      checkInTime: checkInDate ? checkInDate.toISOString() : null,
      checkOutTime: checkOutDate ? checkOutDate.toISOString() : null,
      lateMinutes: selectedStatus === 'late' ? (parseInt(lateMinutes) || 0) : 0,
      earlyMinutes: selectedStatus === 'early_leave' ? (parseInt(earlyMinutes) || 0) : 0,
      hasPermission: selectedStatus === 'rescheduled' || selectedStatus === 'substitute' ? hasPermission : null,
      rescheduledDate: selectedStatus === 'rescheduled' ? rescheduledDate : null,
      rescheduledReason: selectedStatus === 'rescheduled' ? rescheduledReason : '',
      substituteTeacher: selectedStatus === 'substitute' ? substituteTeacher : '',
      note
    };

    const res = await submitAttendance(payload);
    setSubmitting(false);

    if (res.success) {
      setModalVisible(false);
      await loadData(currentDate);
    } else {
      setSubmitError(res.message || 'Lỗi ghi nhận kết quả thanh tra!');
    }
  };

  const isToday = currentDate === getTodayStr();

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Thanh Tra Giảng Dạy</Text>
          <Text style={styles.headerSubtitle}>{user?.fullName || 'Thanh tra viên'}</Text>
        </View>
        <View style={styles.headerCountBadge}>
          <Text style={styles.headerCountVal}>{classes.length}</Text>
          <Text style={styles.headerCountLbl}>lớp</Text>
        </View>
      </View>

      {/* DATE NAVIGATOR BAR */}
      <View style={styles.dateNavWrap}>
        <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeDate(-1)}>
          <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.dateCenter}>
          <Ionicons name="calendar" size={16} color={Colors.primary} />
          <Text style={styles.dateText}>
            {DAY_NAMES[dayOfWeek] || ''}, {currentDate.split('-').reverse().join('/')}
          </Text>
        </View>

        <TouchableOpacity style={styles.dateNavBtn} onPress={() => changeDate(1)}>
          <Ionicons name="chevron-forward" size={18} color={Colors.textPrimary} />
        </TouchableOpacity>

        {!isToday && (
          <TouchableOpacity style={styles.todayBtn} onPress={goToToday}>
            <Text style={styles.todayBtnText}>Hôm nay</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* CLASS LIST */}
      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải danh sách lớp học phần...</Text>
        </View>
      ) : (
        <FlatList
          data={classes}
          keyExtractor={item => item.scheduleId}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          renderItem={({ item }) => {
            let statusKey = item.attendance?.status || 'pending';
            if (statusKey === 'rescheduled') {
              statusKey = item.attendance?.hasPermission === false ? 'rescheduled_unpermitted' : 'rescheduled_permitted';
            }
            const statusConf = STATUS_CONFIG[statusKey] || STATUS_CONFIG.pending;

            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => openModal(item)}
                activeOpacity={0.7}
              >
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseName} numberOfLines={1}>{item.courseName}</Text>
                    <Text style={styles.classCode}>{item.classCode}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusConf.bg, borderColor: statusConf.color }]}>
                    <Ionicons name={statusConf.icon} size={13} color={statusConf.color} />
                    <Text style={[styles.statusText, { color: statusConf.color }]}>{statusConf.label}</Text>
                  </View>
                </View>

                <View style={styles.cardDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="person-outline" size={14} color="#5c6bc0" />
                    <Text style={styles.detailText}>{item.teacherName || 'Chưa rõ'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={14} color="#e91e63" />
                    <Text style={styles.detailText}>{item.room || 'Chưa xếp phòng'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={14} color={Colors.primary} />
                    <Text style={styles.detailText}>
                      {item.scheduledStart} - {item.scheduledEnd} (Tiết {item.periodText})
                    </Text>
                  </View>
                </View>

                {/* RESULT DETAILS */}
                {item.attendance && (
                  <View style={styles.resultBox}>
                    {item.attendance.status === 'rescheduled' ? (
                      <View style={{ gap: 2 }}>
                        <Text style={[styles.resultNote, { color: item.attendance.hasPermission ? '#0277bd' : '#c62828', fontWeight: '700' }]}>
                          {item.attendance.hasPermission ? '✔ Đổi giờ: Có đề nghị/phê duyệt trước' : '✘ Đổi giờ: Tự ý đổi (Không phép)'}
                        </Text>
                        {item.attendance.rescheduledDate ? (
                          <Text style={styles.resultNote}>Lịch học bù: {item.attendance.rescheduledDate}</Text>
                        ) : null}
                        {item.attendance.rescheduledReason ? (
                          <Text style={styles.resultNote}>Lý do: {item.attendance.rescheduledReason}</Text>
                        ) : null}
                      </View>
                    ) : item.attendance.status === 'substitute' ? (
                      <Text style={[styles.resultNote, { color: '#5c6bc0', fontWeight: '700' }]}>
                        Dạy thay bởi: {item.attendance.substituteTeacher || 'GV khác'}
                      </Text>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 14 }}>
                        <Text style={styles.resultTime}>
                          Vào: {item.attendance.checkInTime ? formatTime(item.attendance.checkInTime) : '--:--'}
                          {item.attendance.lateMinutes > 0 ? ` (+${item.attendance.lateMinutes}p)` : ''}
                        </Text>
                        <Text style={styles.resultTime}>
                          Ra: {item.attendance.checkOutTime ? formatTime(item.attendance.checkOutTime) : '--:--'}
                          {item.attendance.earlyMinutes > 0 ? ` (-${item.attendance.earlyMinutes}p)` : ''}
                        </Text>
                      </View>
                    )}
                    {item.attendance.note ? (
                      <Text style={styles.resultNote}>Ghi chú: {item.attendance.note}</Text>
                    ) : null}
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <Text style={styles.footerHint}>
                    {item.attendance ? 'Chạm để cập nhật biên bản' : 'Chạm để ghi nhận sự vụ'}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="clipboard-outline" size={64} color={Colors.borderLight} />
              <Text style={styles.emptyText}>Không có lớp học nào trong ngày này!</Text>
              <Text style={styles.emptySub}>Vui lòng chọn ngày khác để kiểm tra</Text>
            </View>
          }
        />
      )}

      {/* MODAL GHI NHẬN SỰ VỤ THANH TRA */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Biên Bản Kiểm Tra</Text>
                <Text style={styles.modalSub}>{selectedClass?.courseName} • Phòng {selectedClass?.room}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#555" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }}>
              {/* STATUS SELECTION CHIPS */}
              <Text style={styles.inputLabel}>Tình trạng giảng dạy:</Text>
              <View style={styles.statusSelectGrid}>
                {[
                  { id: 'on_time', label: 'Đúng giờ', icon: 'checkmark-circle', color: '#2e7d32' },
                  { id: 'late', label: 'Đến muộn', icon: 'alert-circle', color: '#e65100' },
                  { id: 'early_leave', label: 'Về sớm', icon: 'time', color: '#f57c00' },
                  { id: 'rescheduled', label: 'Đổi giờ', icon: 'swap-horizontal', color: '#0277bd' },
                  { id: 'substitute', label: 'Dạy thay', icon: 'people', color: '#5c6bc0' },
                  { id: 'absent', label: 'Vắng/Bỏ tiết', icon: 'close-circle', color: '#c62828' },
                ].map(st => {
                  const isSelected = selectedStatus === st.id;
                  return (
                    <TouchableOpacity
                      key={st.id}
                      style={[
                        styles.statusSelectBtn,
                        isSelected && { backgroundColor: st.color, borderColor: st.color }
                      ]}
                      onPress={() => setSelectedStatus(st.id)}
                    >
                      <Ionicons name={st.icon} size={15} color={isSelected ? '#fff' : st.color} />
                      <Text style={[styles.statusSelectText, isSelected && { color: '#fff' }]}>{st.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* CONDITIONAL: RESCHEDULED PERMISSION SWITCH */}
              {selectedStatus === 'rescheduled' && (
                <View style={styles.rescheduledBox}>
                  <Text style={styles.inputLabel}>Xác nhận đề nghị đổi giờ:</Text>
                  <View style={styles.permRow}>
                    <TouchableOpacity
                      style={[styles.permBtn, hasPermission && styles.permBtnActiveGreen]}
                      onPress={() => setHasPermission(true)}
                    >
                      <Ionicons name="checkmark-circle" size={16} color={hasPermission ? '#fff' : '#2e7d32'} />
                      <Text style={[styles.permBtnText, hasPermission && { color: '#fff' }]}>Có phép (Đã có đề nghị)</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.permBtn, !hasPermission && styles.permBtnActiveRed]}
                      onPress={() => setHasPermission(false)}
                    >
                      <Ionicons name="close-circle" size={16} color={!hasPermission ? '#fff' : '#c62828'} />
                      <Text style={[styles.permBtnText, !hasPermission && { color: '#fff' }]}>Không phép (Tự ý đổi)</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: 10 }]}>Ngày học bù dự kiến:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="VD: 2026-09-22"
                    placeholderTextColor={Colors.textMuted}
                    value={rescheduledDate}
                    onChangeText={setRescheduledDate}
                  />

                  <Text style={[styles.inputLabel, { marginTop: 10 }]}>Lý do đổi giờ / học bù:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="VD: Bận công tác Hội đồng trường..."
                    placeholderTextColor={Colors.textMuted}
                    value={rescheduledReason}
                    onChangeText={setRescheduledReason}
                  />
                </View>
              )}

              {/* CONDITIONAL: SUBSTITUTE TEACHER */}
              {selectedStatus === 'substitute' && (
                <View style={styles.substituteBox}>
                  <Text style={styles.inputLabel}>Họ tên giảng viên dạy thay:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Nhập họ tên giảng viên dạy thay..."
                    placeholderTextColor={Colors.textMuted}
                    value={substituteTeacher}
                    onChangeText={setSubstituteTeacher}
                  />
                </View>
              )}

              {/* CONDITIONAL: LATE / EARLY MINUTES */}
              {(selectedStatus === 'late' || selectedStatus === 'early_leave' || selectedStatus === 'on_time') && (
                <View style={styles.timeInputsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Giờ đến thực tế (HH:MM):</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="07:05"
                      placeholderTextColor={Colors.textMuted}
                      value={checkInTime}
                      onChangeText={setCheckInTime}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Giờ về thực tế (HH:MM):</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="10:45"
                      placeholderTextColor={Colors.textMuted}
                      value={checkOutTime}
                      onChangeText={setCheckOutTime}
                    />
                  </View>
                </View>
              )}

              {selectedStatus === 'late' && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.inputLabel}>Số phút đến muộn:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="VD: 15"
                    keyboardType="numeric"
                    placeholderTextColor={Colors.textMuted}
                    value={lateMinutes}
                    onChangeText={setLateMinutes}
                  />
                </View>
              )}

              {/* GENERAL NOTE */}
              <View style={{ marginTop: 10 }}>
                <Text style={styles.inputLabel}>Ghi chú thêm của thanh tra viên:</Text>
                <TextInput
                  style={[styles.textInput, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="Nhập ghi chú hoặc biên bản tóm tắt..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  value={note}
                  onChangeText={setNote}
                />
              </View>

              {submitError ? (
                <Text style={styles.submitErrorText}>{submitError}</Text>
              ) : null}
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Lưu Biên Bản Thanh Tra</Text>
              )}
            </TouchableOpacity>
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
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  headerCountBadge: {
    alignItems: 'center', justifyContent: 'center',
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary,
  },
  headerCountVal: { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerCountLbl: { fontSize: 9, color: '#fff', marginTop: -2 },
  dateNavWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  dateNavBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center',
  },
  dateCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  todayBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: Colors.primary + '15',
  },
  todayBtnText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  loadingText: { marginTop: 10, fontSize: 13, color: Colors.textSecondary },
  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, fontWeight: '700', color: Colors.textMuted, marginTop: 12 },
  emptySub: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  card: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginTop: 10,
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.borderLight,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  courseName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  classCode: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDetails: { marginTop: 8, gap: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 12, color: Colors.textSecondary },
  resultBox: {
    backgroundColor: '#fafafa', borderRadius: 8, padding: 8,
    marginTop: 8, borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  resultTime: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary },
  resultNote: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  footerHint: { fontSize: 11, color: Colors.textMuted },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  modalSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
  statusSelectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statusSelectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0',
  },
  statusSelectText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  rescheduledBox: {
    backgroundColor: '#e1f5fe15', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#b3e5fc', marginBottom: 12,
  },
  permRow: { flexDirection: 'row', gap: 8 },
  permBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: 8, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ddd',
  },
  permBtnActiveGreen: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  permBtnActiveRed: { backgroundColor: '#c62828', borderColor: '#c62828' },
  permBtnText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  substituteBox: {
    backgroundColor: '#ede7f615', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#d1c4e9', marginBottom: 12,
  },
  timeInputsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  textInput: {
    backgroundColor: '#f9f9f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 13, color: Colors.textPrimary, borderWidth: 1, borderColor: '#e0e0e0',
  },
  submitErrorText: { color: '#c62828', fontSize: 12, marginTop: 8 },
  submitBtn: {
    backgroundColor: Colors.primary, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginTop: 14,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
