import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getInspectorToday, submitAttendance } from '../../services/api';
import { Colors } from '../../theme/colors';

const DAY_NAMES = {
  2: 'Thu Hai', 3: 'Thu Ba', 4: 'Thu Tu', 5: 'Thu Nam',
  6: 'Thu Sau', 7: 'Thu Bay', 8: 'Chu Nhat',
};

const STATUS_CONFIG = {
  on_time: { label: 'Dung gio', color: Colors.success, icon: 'checkmark-circle' },
  late: { label: 'Di muon', color: Colors.danger, icon: 'alert-circle' },
  early_leave: { label: 'Ve som', color: Colors.warning, icon: 'time' },
  absent: { label: 'Vang mat', color: Colors.danger, icon: 'close-circle' },
  exempt: { label: 'Duoc mien', color: Colors.info, icon: 'shield-checkmark' },
  pending: { label: 'Chua ghi', color: Colors.textMuted, icon: 'help-circle' },
};

const formatTime = (dateStr) => {
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

export default function AttendanceScreen({ user }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayStr, setTodayStr] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const loadData = async () => {
    const res = await getInspectorToday();
    if (res.success) {
      setClasses(res.data || []);
      setTodayStr(res.date);
      setDayOfWeek(res.dayOfWeek);
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

  const isValidTime = (str) => {
    if (!str) return false;
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(str);
  };

  const openModal = (cls) => {
    setSelectedClass(cls);
    setSubmitError('');
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    if (cls.attendance) {
      setCheckInTime(cls.attendance.checkInTime ? formatTime(cls.attendance.checkInTime) : currentTime);
      setCheckOutTime(cls.attendance.checkOutTime ? formatTime(cls.attendance.checkOutTime) : currentTime);
      setNote(cls.attendance.note || '');
    } else {
      setCheckInTime(currentTime);
      setCheckOutTime('');
      setNote('');
    }
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!selectedClass) return;

    // Validate check-in time format
    if (!isValidTime(checkInTime)) {
      setSubmitError('Gio den khong hop le! Dinh dung: HH:MM (VD: 07:30)');
      return;
    }
    if (checkOutTime && !isValidTime(checkOutTime)) {
      setSubmitError('Gio ve khong hop le! Dinh dung: HH:MM (VD: 10:45)');
      return;
    }

    setSubmitError('');
    setSubmitting(true);

    const now = new Date();
    const [inH, inM] = checkInTime.split(':').map(Number);
    const checkInDate = new Date(now);
    checkInDate.setHours(inH, inM, 0, 0);

    let checkOutDate = null;
    if (checkOutTime) {
      const [outH, outM] = checkOutTime.split(':').map(Number);
      checkOutDate = new Date(now);
      checkOutDate.setHours(outH, outM, 0, 0);
    }

    const res = await submitAttendance({
      scheduleId: selectedClass.scheduleId,
      date: selectedClass.date,
      checkInTime: checkInDate.toISOString(),
      checkOutTime: checkOutDate ? checkOutDate.toISOString() : null,
      note
    });

    setSubmitting(false);
    if (res.success) {
      setModalVisible(false);
      setSubmitError('');
      await loadData();
    } else {
      setSubmitError(res.message || 'Loi ghi nhan diem danh! Vui long thu lai.');
    }
  };

  const stats = {
    total: classes.length,
    onTime: classes.filter(c => c.attendance?.status === 'on_time').length,
    late: classes.filter(c => c.attendance?.status === 'late').length,
    pending: classes.filter(c => !c.attendance || c.attendance.status === 'pending').length,
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Dang tai danh sach lop...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Diem Danh</Text>
          <Text style={styles.headerSubtitle}>
            {DAY_NAMES[dayOfWeek] || ''}, {todayStr}
          </Text>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color={Colors.textOnPrimary} />
          ) : (
            <Ionicons name="sync-outline" size={18} color={Colors.textOnPrimary} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.primary }]}>{stats.total}</Text>
          <Text style={styles.statLabel}>Tong lop</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.success }]}>{stats.onTime}</Text>
          <Text style={styles.statLabel}>Dung gio</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.danger }]}>{stats.late}</Text>
          <Text style={styles.statLabel}>Di muon</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.textMuted }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Chua ghi</Text>
        </View>
      </View>

      <FlatList
        data={classes}
        keyExtractor={(item) => item.scheduleId}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
        renderItem={({ item }) => {
          const statusConf = STATUS_CONFIG[item.attendance?.status || 'pending'];
          return (
            <TouchableOpacity style={styles.card} onPress={() => openModal(item)} activeOpacity={0.7}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courseName} numberOfLines={1}>{item.courseName}</Text>
                  <Text style={styles.classCode}>{item.classCode}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusConf.color + '15' }]}>
                  <Ionicons name={statusConf.icon} size={14} color={statusConf.color} />
                  <Text style={[styles.statusText, { color: statusConf.color }]}>{statusConf.label}</Text>
                </View>
              </View>

              <View style={styles.cardDetails}>
                <View style={styles.detailItem}>
                  <Ionicons name="person-outline" size={14} color={Colors.accentPurple} />
                  <Text style={styles.detailText}>{item.teacherName || 'Chua ro'}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Ionicons name="location-outline" size={14} color={Colors.accentPink} />
                  <Text style={styles.detailText}>{item.room || 'Chua xep'}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Ionicons name="time-outline" size={14} color={Colors.primary} />
                  <Text style={styles.detailText}>
                    {item.scheduledStart} - {item.scheduledEnd} (Tiet {item.periodText})
                  </Text>
                </View>
              </View>

              {item.attendance && item.attendance.checkInTime && (
                <View style={styles.attendanceResult}>
                  <View style={styles.resultItem}>
                    <Text style={styles.resultLabel}>Den:</Text>
                    <Text style={[styles.resultValue, item.attendance.lateMinutes > 0 && { color: Colors.danger }]}>
                      {formatTime(item.attendance.checkInTime)}
                      {item.attendance.lateMinutes > 0 ? ` (+${item.attendance.lateMinutes}p)` : ''}
                    </Text>
                  </View>
                  {item.attendance.checkOutTime && (
                    <View style={styles.resultItem}>
                      <Text style={styles.resultLabel}>Ve:</Text>
                      <Text style={[styles.resultValue, item.attendance.earlyMinutes > 0 && { color: Colors.warning }]}>
                        {formatTime(item.attendance.checkOutTime)}
                        {item.attendance.earlyMinutes > 0 ? ` (-${item.attendance.earlyMinutes}p)` : ''}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.cardFooter}>
                <Text style={styles.footerHint}>
                  {item.attendance ? 'Cham de cap nhat' : 'Cham de ghi nhan'}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="clipboard-outline" size={64} color={Colors.borderLight} />
            <Text style={styles.emptyText}>Khong co lop hoc nao hom nay!</Text>
            <Text style={styles.emptySubText}>Hoac chua den lich day trong hoc ky nay</Text>
          </View>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ghi Nhan Diem Danh</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedClass && (
              <View style={styles.modalClassInfo}>
                <Text style={styles.modalCourseName}>{selectedClass.courseName}</Text>
                <Text style={styles.modalClassCode}>{selectedClass.classCode} - {selectedClass.teacherName}</Text>
                <Text style={styles.modalPeriod}>
                  Gio quy dinh: {selectedClass.scheduledStart} - {selectedClass.scheduledEnd}
                </Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Gio den (HH:MM)</Text>
              <TextInput
                style={styles.timeInput}
                value={checkInTime}
                onChangeText={setCheckInTime}
                placeholder="07:00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Gio ve (HH:MM)</Text>
              <TextInput
                style={styles.timeInput}
                value={checkOutTime}
                onChangeText={setCheckOutTime}
                placeholder="10:45"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Ghi chu (tu chon)</Text>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Ly do neu co..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />
            </View>

            {submitError ? (
              <View style={styles.errorWrap}>
                <Ionicons name="alert-circle" size={16} color={Colors.danger} />
                <Text style={styles.errorText}>{submitError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.textOnPrimary} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>LUU DIEM DANH</Text>
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

  statsBar: {
    flexDirection: 'row', backgroundColor: Colors.surface, marginHorizontal: 16,
    borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: Colors.borderLight, marginVertical: 2 },

  card: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.primary,
    elevation: 2, shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  courseName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  classCode: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    paddingVertical: 5, borderRadius: 20, gap: 4,
  },
  statusText: { fontSize: 12, fontWeight: '700' },

  cardDetails: { gap: 6, marginBottom: 10 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13, color: Colors.textSecondary },

  attendanceResult: {
    flexDirection: 'row', gap: 20, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  resultItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  resultValue: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },

  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  footerHint: { fontSize: 11, color: Colors.textMuted },

  emptyWrap: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary, marginTop: 16 },
  emptySubText: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },

  modalClassInfo: {
    backgroundColor: Colors.primaryBg, borderRadius: 12, padding: 14, marginBottom: 20,
  },
  modalCourseName: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  modalClassCode: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  modalPeriod: { fontSize: 12, color: Colors.primaryLight, marginTop: 4, fontWeight: '600' },

  inputGroup: { marginBottom: 16 },
  inputLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  timeInput: {
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 18, fontWeight: '700', color: Colors.textPrimary,
    textAlign: 'center', letterSpacing: 2,
  },
  noteInput: {
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.textPrimary, minHeight: 60, textAlignVertical: 'top',
  },

  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 8,
    elevation: 4, shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
  },
  submitBtnDisabled: { backgroundColor: Colors.primaryMuted },
  submitBtnText: { color: Colors.textOnPrimary, fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },

  errorWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF0F0', padding: 12, borderRadius: 10,
    marginBottom: 12, gap: 8,
  },
  errorText: { color: Colors.danger, fontSize: 13, fontWeight: '600', flex: 1 },
});
