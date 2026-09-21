import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getClassStudents, getLecturerClasses } from '../../services/api';
import { Colors } from '../../theme/colors';

export default function ClassListScreen({ user, navigation, onBack }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState({});
  const [studentModalClass, setStudentModalClass] = useState(null);
  const [modalStudents, setModalStudents] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  const openStudentList = async (cls) => {
    setStudentModalClass(cls);
    setModalLoading(true);
    const targetIdLopTc = cls.idLopTc || cls.schedules?.find(s => s.idLopTc)?.idLopTc;
    if (targetIdLopTc) {
      const res = await getClassStudents(targetIdLopTc);
      if (res.success && res.data) {
        setModalStudents(res.data);
      } else {
        setModalStudents([]);
      }
    } else {
      setModalStudents([]);
    }
    setModalLoading(false);
  };

  const loadData = async () => {
    const res = await getLecturerClasses();
    if (res.success) {
      setClasses(res.data || []);
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

  const toggleExpand = (idx) => {
    setExpandedIdx(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải danh sách lớp...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          {(Boolean(onBack) || Boolean(navigation?.canGoBack?.())) && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => { if (onBack) onBack(); else if (navigation?.goBack) navigation.goBack(); }}
            >
              <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
          )}
          <View style={{ marginLeft: (Boolean(onBack) || Boolean(navigation?.canGoBack?.())) ? 12 : 0, flex: 1 }}>
            <Text style={styles.headerTitle}>Lịch Sử Giảng Dạy</Text>
            <Text style={styles.headerSubtitle}>Danh mục lớp học phần & sĩ số sinh viên</Text>
          </View>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{classes.length}</Text>
          <Text style={styles.countLabel}>lớp</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {classes.length > 0 ? (
          classes.map((cls, idx) => {
            const isExpanded = expandedIdx[idx];
            return (
              <TouchableOpacity
                key={idx}
                style={styles.card}
                onPress={() => toggleExpand(idx)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseName}>{cls.courseName}</Text>
                    <Text style={styles.classCode}>{cls.classCode}</Text>
                  </View>
                  <View style={styles.cardRight}>
                    <View style={styles.creditBadge}>
                      <Text style={styles.creditText}>{cls.credits || '?'} TC</Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={Colors.textMuted}
                    />
                  </View>
                </View>

                {isExpanded && cls.schedules && cls.schedules.length > 0 && (
                  <View style={styles.detailSection}>
                    <View style={styles.divider} />
                    <Text style={styles.detailTitle}>Lịch dạy chi tiết:</Text>
                    {cls.schedules.map((sch, sIdx) => (
                      <View key={sIdx} style={styles.detailRow}>
                        <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                        <Text style={styles.detailText}>
                          Thứ {sch.dayOfWeek} • {sch.studyTime || 'Chưa rõ'} • {sch.room || ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.viewStudentsBtn}
                    onPress={() => openStudentList(cls)}
                  >
                    <Ionicons name="people-outline" size={14} color={Colors.primary} />
                    <Text style={styles.viewStudentsBtnText}>Danh sách sinh viên</Text>
                  </TouchableOpacity>
                  <View style={styles.semesterRow}>
                    <Ionicons name="bookmark-outline" size={12} color={Colors.textMuted} />
                    <Text style={styles.semesterText}>{cls.semester} — {cls.schoolYear}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={64} color={Colors.borderLight} />
            <Text style={styles.emptyText}>Chưa có lớp nào!</Text>
            <Text style={styles.emptySubText}>Đồng bộ lịch dạy để cập nhật danh sách lớp</Text>
          </View>
        )}
      </ScrollView>

      {/* MODAL DANH SÁCH SINH VIÊN */}
      <Modal
        visible={Boolean(studentModalClass)}
        transparent
        animationType="slide"
        onRequestClose={() => setStudentModalClass(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {studentModalClass?.courseName}
                </Text>
                <Text style={styles.modalSub}>
                  {studentModalClass?.classCode} • {modalStudents.length} sinh viên đăng ký
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setStudentModalClass(null)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#555" />
              </TouchableOpacity>
            </View>

            {modalLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.modalLoadingText}>Đang tải danh sách sinh viên...</Text>
              </View>
            ) : modalStudents.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Ionicons name="people-outline" size={48} color={Colors.borderLight} />
                <Text style={styles.modalEmptyText}>Chưa có thông tin danh sách sinh viên lớp này</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {modalStudents.map((stu, sIdx) => (
                  <View key={stu.studentCode || sIdx} style={styles.studentItem}>
                    <View style={styles.sttBadge}>
                      <Text style={styles.sttBadgeText}>{sIdx + 1}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.stuNameText}>{stu.studentName}</Text>
                      <Text style={styles.stuSubText}>
                        {stu.studentCode} {stu.studentClass ? `• ${stu.studentClass}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  countBadge: {
    alignItems: 'center', backgroundColor: Colors.primary,
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center',
    elevation: 3, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  countText: { fontSize: 18, fontWeight: '800', color: Colors.textOnPrimary },
  countLabel: { fontSize: 9, color: Colors.textOnPrimary, marginTop: -2 },
  card: {
    backgroundColor: Colors.surface, marginHorizontal: 16, marginTop: 12,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.borderLight,
    elevation: 2, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  courseName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, lineHeight: 21 },
  classCode: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  cardRight: { alignItems: 'center', gap: 6 },
  creditBadge: {
    backgroundColor: Colors.primary + '12', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8,
  },
  creditText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  detailSection: { marginTop: 8 },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 8 },
  detailTitle: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  detailText: { fontSize: 12, color: Colors.textPrimary },
  semesterRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  semesterText: { fontSize: 11, color: Colors.textMuted },
  cardActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  viewStudentsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary + '12', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8,
  },
  viewStudentsBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 16 },
  emptySubText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  modalSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  modalLoading: { alignItems: 'center', paddingVertical: 40 },
  modalLoadingText: { marginTop: 10, color: Colors.textSecondary, fontSize: 13 },
  modalEmpty: { alignItems: 'center', paddingVertical: 40 },
  modalEmptyText: { marginTop: 10, color: Colors.textMuted, fontSize: 13 },
  studentItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  sttBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center' },
  sttBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  stuNameText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  stuSubText: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
});
