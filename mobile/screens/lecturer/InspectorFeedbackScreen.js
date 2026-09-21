import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { getInspectorLogs, submitInspectorExplanation } from '../../services/api';
import { Colors } from '../../theme/colors';

export default function InspectorFeedbackScreen({ navigation, onBack }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [explanationReason, setExplanationReason] = useState('');
  const [explanationProof, setExplanationProof] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const res = await getInspectorLogs();
      if (res && res.success) {
        setLogs(res.data || []);
      }
    } catch (err) {
      console.error('Lỗi nạp nhật ký thanh tra:', err);
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

  const handleBack = () => {
    if (onBack) onBack();
    else if (navigation?.goBack) navigation.goBack();
  };

  const openExplanationModal = (item) => {
    setSelectedIncident(item);
    setExplanationReason('');
    setExplanationProof('');
  };

  const handleSendExplanation = async () => {
    if (!explanationReason.trim()) {
      Alert.alert('Thông báo', 'Vui lòng nhập lý do giải trình!');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitInspectorExplanation(selectedIncident.id, {
        reason: explanationReason.trim(),
        proofNote: explanationProof.trim(),
      });
      Alert.alert('Tiếp nhận giải trình', res.message || 'Đã ghi nhận thông tin giải trình của Thầy/Cô. Tính năng giải trình trực tuyến đang trong giai đoạn thử nghiệm vận hành.');
      setSelectedIncident(null);
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể gửi giải trình: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Khảo Thí & Thanh Tra Giảng Dạy</Text>
          <Text style={styles.headerSubtitle}>Ghi nhận nề nếp & gửi giải trình</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
      >
        {/* BANNER THÔNG BÁO */}
        <View style={styles.noticeBanner}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#0284c7" />
          <Text style={styles.noticeBannerText}>
            Hệ thống hiển thị các biên bản ghi nhận giờ dạy từ Tổ Thanh tra Đào tạo (Đi muộn, Về sớm, Bỏ giờ).
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Đang kiểm tra kết quả thanh tra...</Text>
          </View>
        ) : logs.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="checkmark-done" size={40} color="#16a34a" />
            </View>
            <Text style={styles.emptyTitle}>Nề Nếp Giảng Dạy Tốt!</Text>
            <Text style={styles.emptySubtitle}>
              Không có sự kiện ghi nhận vi phạm nào từ Tổ Thanh tra Đào tạo. Thầy/Cô đang duy trì kỷ luật giảng dạy chuẩn mực.
            </Text>
          </View>
        ) : (
          logs.map((item, idx) => {
            const isLate = item.status === 'late';
            const isEarly = item.status === 'early_leave';
            const isAbsent = item.status === 'absent';
            const badgeColor = isAbsent ? '#ef4444' : isLate ? '#f59e0b' : '#3b82f6';
            const badgeBg = isAbsent ? '#fef2f2' : isLate ? '#fffbeb' : '#eff6ff';

            return (
              <View key={idx} style={styles.incidentCard}>
                <View style={styles.incidentTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseName}>{item.courseName}</Text>
                    <Text style={styles.classInfo}>
                      {item.classCode ? `${item.classCode} • ` : ''}Phòng {item.room || 'Chưa rõ'}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                    <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{item.statusText}</Text>
                  </View>
                </View>

                {/* DETAILS ROW */}
                <View style={styles.incidentDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.detailText}>Ngày dạy: <Text style={styles.boldText}>{item.date}</Text></Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.detailText}>
                      Tiết lịch: {item.periodText || ''} ({item.scheduledStart} - {item.scheduledEnd})
                    </Text>
                  </View>

                  {(isLate && item.lateMinutes > 0) && (
                    <View style={styles.violationHighlight}>
                      <Ionicons name="alert-circle" size={14} color="#b45309" />
                      <Text style={styles.violationText}>Ghi nhận đi muộn: <Text style={styles.boldText}>{item.lateMinutes} phút</Text></Text>
                    </View>
                  )}

                  {(isEarly && item.earlyMinutes > 0) && (
                    <View style={styles.violationHighlight}>
                      <Ionicons name="alert-circle" size={14} color="#1d4ed8" />
                      <Text style={styles.violationText}>Ghi nhận về sớm: <Text style={styles.boldText}>{item.earlyMinutes} phút</Text></Text>
                    </View>
                  )}

                  {isAbsent && (
                    <View style={[styles.violationHighlight, { backgroundColor: '#fee2e2' }]}>
                      <Ionicons name="close-circle" size={14} color="#b91c1c" />
                      <Text style={[styles.violationText, { color: '#b91c1c' }]}>Vắng / Bỏ giờ không có phép báo trước</Text>
                    </View>
                  )}

                  {item.note ? (
                    <View style={styles.inspectorNote}>
                      <Text style={styles.inspectorNoteLbl}>Ghi chú thanh tra:</Text>
                      <Text style={styles.inspectorNoteTxt}>{item.note}</Text>
                    </View>
                  ) : null}
                </View>

                {/* ACTION: NÚT GIẢI TRÌNH */}
                <View style={styles.cardActionRow}>
                  <TouchableOpacity
                    style={styles.btnExplain}
                    onPress={() => openExplanationModal(item)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color="#fff" />
                    <Text style={styles.btnExplainText}>Giải Trình</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* MODAL GIẢI TRÌNH */}
      <Modal
        visible={Boolean(selectedIncident)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedIncident(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Giải Trình Sự Kiện Giảng Dạy</Text>
              <TouchableOpacity onPress={() => setSelectedIncident(null)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalIncidentInfo}>
                {selectedIncident?.courseName} • Ngày {selectedIncident?.date} ({selectedIncident?.statusText})
              </Text>

              <View style={styles.trialBadge}>
                <Ionicons name="construct-outline" size={14} color="#b45309" />
                <Text style={styles.trialBadgeText}>
                  Chức năng đang trong giai đoạn xây dựng & ghi nhận thử nghiệm.
                </Text>
              </View>

              <Text style={styles.inputLabel}>Lý do giải trình <Text style={{ color: '#ef4444' }}>*</Text></Text>
              <TextInput
                style={styles.textArea}
                placeholder="Nhập chi tiết lý do (VD: Bận công tác trường đột xuất, kẹt xe, máy chiếu giảng đường gặp sự cố...)"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
                value={explanationReason}
                onChangeText={setExplanationReason}
              />

              <Text style={styles.inputLabel}>Minh chứng / Ngày dạy bù dự kiến</Text>
              <TextInput
                style={styles.input}
                placeholder="VD: Đã dạy bù vào ngày 25/10 tại P.302, có giấy triệu tập..."
                placeholderTextColor={Colors.textMuted}
                value={explanationProof}
                onChangeText={setExplanationProof}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setSelectedIncident(null)}>
                <Text style={styles.btnCancelText}>Hủy bỏ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSubmit, submitting && { opacity: 0.6 }]}
                onPress={handleSendExplanation}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnSubmitText}>Gửi Giải Trình</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  headerTitleWrap: { marginLeft: 12, flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  content: { padding: 16, paddingBottom: 40 },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  noticeBannerText: { fontSize: 12, color: '#0369a1', flex: 1, lineHeight: 18 },
  loadingBox: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 13, color: Colors.textSecondary },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginTop: 20,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#15803d' },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  incidentCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  incidentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  courseName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  classInfo: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  incidentDetails: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 12, color: Colors.textSecondary },
  boldText: { fontWeight: '700', color: Colors.textPrimary },
  violationHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  violationText: { fontSize: 12, color: '#92400e', fontWeight: '600' },
  inspectorNote: {
    backgroundColor: Colors.surface,
    padding: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  inspectorNoteLbl: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  inspectorNoteTxt: { fontSize: 12, color: Colors.textPrimary, marginTop: 2 },
  cardActionRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  btnExplain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  btnExplainText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  modalIncidentInfo: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginBottom: 10 },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    padding: 8,
    borderRadius: 8,
    marginBottom: 14,
  },
  trialBadgeText: { fontSize: 11, color: '#92400e', flex: 1 },
  modalBody: { marginBottom: 14 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6, marginTop: 10 },
  textArea: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 10,
    fontSize: 13,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
    height: 90,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 10,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  modalFooter: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  btnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  btnCancelText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  btnSubmit: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  btnSubmitText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
