import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getClassStudents, getSessionAttendance, submitSessionAttendance } from '../../services/api';
import { Colors } from '../../theme/colors';

const STATUS_CONFIG = {
  present: { label: 'Có mặt', color: '#2e7d32', bg: '#e8f5e9', border: '#a5d6a7' },
  absent: { label: 'Vắng', color: '#c62828', bg: '#ffebee', border: '#ef9a9a' },
  excused: { label: 'Phép', color: '#f57f17', bg: '#fffde7', border: '#fff59d' },
  late: { label: 'Muộn', color: '#e65100', bg: '#fff3e0', border: '#ffcc80' },
};

// Cờ điều khiển hiển thị nút Lưu điểm danh (tạm ẩn khi chưa chính thức vận hành tính năng này)
const SHOW_SAVE_BUTTON = false;

export default function StudentAttendanceScreen({ route, navigation, schedule, targetDate, onClose }) {
  const insets = useSafeAreaInsets();
  // Can be opened as a modal or navigation screen
  const currentSchedule = schedule || route?.params?.schedule;
  const sessionDate = targetDate || route?.params?.date || new Date().toISOString().split('T')[0];

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNoteIdx, setActiveNoteIdx] = useState(null);

  useEffect(() => {
    loadAttendanceData();
  }, [currentSchedule]);

  const loadAttendanceData = async () => {
    if (!currentSchedule) return;
    setLoading(true);

    try {
      // 1. Lấy danh sách SV của lớp
      let studentList = [];
      if (currentSchedule.idLopTc) {
        const res = await getClassStudents(currentSchedule.idLopTc);
        if (res.success && res.data) {
          studentList = res.data;
        }
      }

      // 2. Lấy dữ liệu điểm danh đã lưu (nếu có)
      const attRes = await getSessionAttendance(currentSchedule.id || currentSchedule.scheduleId, sessionDate);
      const existingMap = {};
      if (attRes.success && attRes.data) {
        for (const record of attRes.data) {
          existingMap[record.studentCode] = record;
        }
      }

      // 3. Ghép trạng thái (mặc định là 'present' nếu chưa điểm danh)
      const merged = studentList.map(s => {
        const exist = existingMap[s.studentCode];
        return {
          studentCode: s.studentCode,
          studentName: s.studentName,
          studentClass: s.studentClass,
          status: exist ? exist.status : 'present',
          note: exist ? (exist.note || '') : ''
        };
      });

      setStudents(merged);
    } catch (e) {
      console.error('Lỗi tải điểm danh:', e);
    } finally {
      setLoading(false);
    }
  };

  const setStudentStatus = (studentCode, newStatus) => {
    setStudents(prev => prev.map(s => {
      if (s.studentCode === studentCode) {
        return { ...s, status: newStatus };
      }
      return s;
    }));
  };

  const setStudentNote = (studentCode, newNote) => {
    setStudents(prev => prev.map(s => {
      if (s.studentCode === studentCode) {
        return { ...s, note: newNote };
      }
      return s;
    }));
  };

  const markAllPresent = () => {
    setStudents(prev => prev.map(s => ({ ...s, status: 'present' })));
  };

  const handleSave = async () => {
    if (!currentSchedule) return;
    setSubmitting(true);

    const payload = {
      scheduleId: currentSchedule.id || currentSchedule.scheduleId,
      date: sessionDate,
      classCode: currentSchedule.classCode || '',
      courseName: currentSchedule.courseName || '',
      records: students.map(s => ({
        studentCode: s.studentCode,
        studentName: s.studentName,
        studentClass: s.studentClass,
        status: s.status,
        note: s.note
      }))
    };

    const res = await submitSessionAttendance(payload);
    setSubmitting(false);

    if (res.success) {
      const msg = res.abnormalCount > 0
        ? `Đã lưu điểm danh! Đã gửi thông báo ${res.abnormalCount} sinh viên vắng/muộn tới Giáo viên chủ nhiệm.`
        : 'Đã lưu điểm danh thành công! Tất cả sinh viên có mặt.';
      Alert.alert('Thành công', msg, [
        { text: 'OK', onPress: () => { if (onClose) onClose(); else if (navigation?.goBack) navigation.goBack(); } }
      ]);
    } else {
      Alert.alert('Lỗi', res.message || 'Không thể lưu bảng điểm danh!');
    }
  };

  const filteredStudents = students.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (s.studentName && s.studentName.toLowerCase().includes(q)) ||
           (s.studentCode && s.studentCode.toLowerCase().includes(q)) ||
           (s.studentClass && s.studentClass.toLowerCase().includes(q));
  });

  const counts = {
    present: students.filter(s => s.status === 'present').length,
    absent: students.filter(s => s.status === 'absent').length,
    excused: students.filter(s => s.status === 'excused').length,
    late: students.filter(s => s.status === 'late').length,
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => { if (onClose) onClose(); else if (navigation?.goBack) navigation.goBack(); }}
          >
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {currentSchedule?.courseName || 'Điểm danh buổi học'}
            </Text>
            <Text style={styles.headerSub}>
              {currentSchedule?.classCode || ''} • Phòng {currentSchedule?.room || 'Chưa rõ'} • Ngày {sessionDate}
            </Text>
          </View>
        </View>

        {/* SUMMARY STATS BAR */}
        <View style={styles.statsBar}>
          <View style={[styles.statChip, { backgroundColor: '#e8f5e9' }]}>
            <Text style={[styles.statVal, { color: '#2e7d32' }]}>{counts.present}</Text>
            <Text style={[styles.statLbl, { color: '#2e7d32' }]}>Có mặt</Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: '#ffebee' }]}>
            <Text style={[styles.statVal, { color: '#c62828' }]}>{counts.absent}</Text>
            <Text style={[styles.statLbl, { color: '#c62828' }]}>Vắng</Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: '#fffde7' }]}>
            <Text style={[styles.statVal, { color: '#f57f17' }]}>{counts.excused}</Text>
            <Text style={[styles.statLbl, { color: '#f57f17' }]}>Có phép</Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: '#fff3e0' }]}>
            <Text style={[styles.statVal, { color: '#e65100' }]}>{counts.late}</Text>
            <Text style={[styles.statLbl, { color: '#e65100' }]}>Muộn</Text>
          </View>
        </View>

        {/* QUICK ACTIONS & SEARCH */}
        <View style={styles.controlRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm theo tên hoặc mã SV..."
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

          <TouchableOpacity style={styles.markAllBtn} onPress={markAllPresent}>
            <Ionicons name="checkmark-done-circle" size={16} color="#fff" />
            <Text style={styles.markAllText}>Tất cả có mặt</Text>
          </TouchableOpacity>
        </View>

        {/* STUDENT LIST */}
        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Đang tải danh sách sinh viên...</Text>
          </View>
        ) : filteredStudents.length === 0 ? (
          <View style={styles.centerLoading}>
            <Ionicons name="people-outline" size={56} color={Colors.borderLight} />
            <Text style={styles.emptyText}>Không tìm thấy sinh viên nào!</Text>
          </View>
        ) : (
          <FlatList
            data={filteredStudents}
            keyExtractor={item => item.studentCode}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: (SHOW_SAVE_BUTTON ? 110 : 24) + insets.bottom,
            }}
            renderItem={({ item, index }) => {
              const hasNote = Boolean(item.note);
              const isNoteOpen = activeNoteIdx === item.studentCode;

              return (
                <View style={styles.studentCard}>
                  <View style={styles.cardMain}>
                    <View style={styles.sttCircle}>
                      <Text style={styles.sttText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.studentName}>{item.studentName}</Text>
                      <Text style={styles.studentSub}>
                        {item.studentCode} {item.studentClass ? `• ${item.studentClass}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.noteIconBtn, hasNote && styles.noteIconActive]}
                      onPress={() => setActiveNoteIdx(isNoteOpen ? null : item.studentCode)}
                    >
                      <Ionicons
                        name={hasNote ? 'chatbubble' : 'chatbubble-outline'}
                        size={16}
                        color={hasNote ? Colors.primary : Colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* ATTENDANCE STATUS CHIPS */}
                  <View style={styles.statusChipsRow}>
                    {Object.entries(STATUS_CONFIG).map(([stKey, conf]) => {
                      const isSelected = item.status === stKey;
                      return (
                        <TouchableOpacity
                          key={stKey}
                          style={[
                            styles.statusChipBtn,
                            { borderColor: conf.border },
                            isSelected
                              ? { backgroundColor: conf.bg, borderColor: conf.color }
                              : { backgroundColor: '#fafafa' }
                          ]}
                          onPress={() => setStudentStatus(item.studentCode, stKey)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.statusChipText,
                              { color: isSelected ? conf.color : Colors.textMuted }
                            ]}
                          >
                            {conf.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* NOTE INPUT */}
                  {(isNoteOpen || hasNote) && (
                    <View style={styles.noteWrap}>
                      <Ionicons name="pencil-outline" size={14} color={Colors.textMuted} />
                      <TextInput
                        style={styles.noteInput}
                        placeholder="Ghi chú (VD: Muộn 15p, có giấy xin phép)..."
                        placeholderTextColor={Colors.textMuted}
                        value={item.note}
                        onChangeText={txt => setStudentNote(item.studentCode, txt)}
                      />
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        {/* BOTTOM SAVE BAR (Tạm ẩn khi chưa chính thức vận hành tính năng lưu điểm danh) */}
        {SHOW_SAVE_BUTTON && (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <TouchableOpacity
              style={[styles.saveBtn, submitting && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>Lưu Điểm Danh ({students.length} SV)</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center'
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statsBar: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10,
    gap: 8, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  statChip: {
    flex: 1, borderRadius: 10, paddingVertical: 6,
    alignItems: 'center', justifyContent: 'center'
  },
  statVal: { fontSize: 16, fontWeight: '800' },
  statLbl: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  controlRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 10,
    paddingHorizontal: 10, height: 38, borderWidth: 1, borderColor: Colors.borderLight,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#2e7d32', paddingHorizontal: 12, height: 38,
    borderRadius: 10, justifyContent: 'center'
  },
  markAllText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  centerLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  loadingText: { marginTop: 10, color: Colors.textSecondary, fontSize: 13 },
  emptyText: { marginTop: 10, color: Colors.textMuted, fontSize: 14 },
  studentCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    padding: 12, marginTop: 8, borderWidth: 1, borderColor: Colors.borderLight,
    elevation: 1, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4,
  },
  cardMain: { flexDirection: 'row', alignItems: 'center' },
  sttCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center',
  },
  sttText: { fontSize: 12, fontWeight: '700', color: '#2e7d32' },
  studentName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  studentSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  noteIconBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  noteIconActive: { backgroundColor: '#e8f5e9' },
  statusChipsRow: {
    flexDirection: 'row', gap: 6, marginTop: 10,
  },
  statusChipBtn: {
    flex: 1, paddingVertical: 6, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  statusChipText: { fontSize: 12, fontWeight: '700' },
  noteWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f9f9f9', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, marginTop: 8,
    borderWidth: 1, borderColor: '#eee',
  },
  noteInput: { flex: 1, fontSize: 12, color: Colors.textPrimary, padding: 2 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06, shadowRadius: 8,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, height: 48, borderRadius: 12,
  },
  saveBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
