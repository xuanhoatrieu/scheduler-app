import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
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
import {
  confirmOneStopPayment,
  getStaffOneStopRequests,
  handoverOneStopRequest,
  processOneStopRequest,
  rejectOneStopPayment,
} from '../../services/api';
import { Colors } from '../../theme/colors';

const STATUS_OPTIONS = [
  { key: 'processing', label: '⏳ Đang xử lý' },
  { key: 'need_more_info', label: '📝 Yêu cầu bổ sung HS' },
  { key: 'ready_for_pickup', label: '🎉 Đã có kết quả (Tạo QR nhận giấy)' },
  { key: 'completed', label: '✅ Hoàn thành (Cấp PDF có QR xác thực)' },
  { key: 'rejected', label: '❌ Từ chối hồ sơ' },
];

const OVERDUE_REASONS = [
  { key: 'waiting_signature', label: 'Chờ trình ký Lãnh đạo' },
  { key: 'system_error', label: 'Lỗi hệ thống / phần mềm' },
  { key: 'student_late_supplement', label: 'SV bổ sung hồ sơ muộn' },
  { key: 'overload', label: 'Quá tải đợt cao điểm' },
  { key: 'other', label: 'Nguyên nhân khác' },
];

export default function StaffOneStopScreen({ onBack }) {
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({});
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'payment_review' | 'processing' | 'overdue'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quickQrInput, setQuickQrInput] = useState('');

  // Modal xử lý hồ sơ
  const [selectedReq, setSelectedReq] = useState(null);
  const [targetStatus, setTargetStatus] = useState('processing');
  const [staffNote, setStaffNote] = useState('');
  const [trayLocation, setTrayLocation] = useState('');
  const [postalTracking, setPostalTracking] = useState('');
  const [overdueCategory, setOverdueCategory] = useState('waiting_signature');
  const [overdueReason, setOverdueReason] = useState('');
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const params = {};
      if (filterMode === 'payment_review') params.status = 'payment_review';
      if (filterMode === 'processing') params.status = 'processing';
      if (filterMode === 'overdue') params.overdue = 'true';

      const res = await getStaffOneStopRequests(params);
      if (res.success) {
        setRequests(res.data || []);
        setStats(res.stats || {});
      }
    } finally {
      setLoading(false);
    }
  }, [filterMode]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadList();
    setRefreshing(false);
  };

  const openProcessModal = (item) => {
    setSelectedReq(item);
    setTargetStatus(
      ['pending_payment', 'payment_review', 'submitted'].includes(item.status)
        ? 'processing'
        : item.status
    );
    setStaffNote(item.staffNote || '');
    setTrayLocation(item.trayLocation || item.pickupLocation || item.service?.pickupLocation || '');
    setPostalTracking(item.postalTrackingNumber || '');
    setOverdueCategory(item.overdueReasonCategory || 'waiting_signature');
    setOverdueReason(item.overdueReason || '');
  };

  const handleConfirmPayment = async () => {
    if (!selectedReq) return;
    setSaving(true);
    try {
      const res = await confirmOneStopPayment(
        selectedReq.id,
        'Đã đối soát biên lai hợp lệ trên ứng dụng Cán bộ.'
      );
      if (!res.success) {
        Alert.alert('Lỗi', res.message);
        return;
      }
      setSelectedReq(null);
      await loadList();
      Alert.alert('Thành công', res.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRejectPayment = async () => {
    if (!selectedReq) return;
    if (!staffNote.trim()) {
      Alert.alert(
        'Nhập lý do từ chối',
        'Vui lòng nhập lý do từ chối biên lai vào ô Ghi chú cán bộ để sinh viên biết và tải lại!'
      );
      return;
    }
    setSaving(true);
    try {
      const res = await rejectOneStopPayment(selectedReq.id, staffNote.trim());
      if (!res.success) {
        Alert.alert('Lỗi', res.message);
        return;
      }
      setSelectedReq(null);
      await loadList();
      Alert.alert('Đã từ chối biên lai', res.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProcess = async () => {
    if (!selectedReq) return;
    const isOverdue = Boolean(selectedReq.isOverdue || selectedReq.slaStatus?.isOverdue);
    if (
      isOverdue &&
      ['ready_for_pickup', 'completed'].includes(targetStatus) &&
      !overdueReason.trim()
    ) {
      Alert.alert(
        'Bắt buộc giải trình quá hạn SLA',
        'Hồ sơ này đã quá hạn cam kết SLA! Vui lòng nhập lý do giải trình quá hạn trước khi duyệt hoàn tất hoặc trả kết quả.'
      );
      return;
    }

    setSaving(true);
    try {
      const res = await processOneStopRequest(selectedReq.id, {
        status: targetStatus,
        staffNote: staffNote.trim(),
        trayLocation: trayLocation.trim(),
        postalTrackingNumber: postalTracking.trim(),
        overdueReasonCategory: overdueCategory,
        overdueReason: overdueReason.trim(),
      });
      if (!res.success) {
        Alert.alert('Chưa thể lưu', res.message);
        return;
      }
      setSelectedReq(null);
      await loadList();
      Alert.alert('Đã cập nhật', res.message);
    } finally {
      setSaving(false);
    }
  };

  const handleQuickHandover = async () => {
    if (!quickQrInput.trim()) {
      Alert.alert('Nhập mã bàn giao', 'Vui lòng nhập mã QR nhận bản giấy hoặc Mã hồ sơ!');
      return;
    }
    const res = await handoverOneStopRequest('scan', {
      pickupQrCode: quickQrInput.trim(),
    });
    if (!res.success) {
      Alert.alert('Lỗi bàn giao', res.message);
      return;
    }
    setQuickQrInput('');
    await loadList();
    Alert.alert('Bàn giao thành công', res.message);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Xử Lý Hồ Sơ Một Cửa</Text>
          <Text style={styles.headerSub}>
            Duyệt lệ phí VietQR, trả kết quả PDF/QR & giám sát SLA
          </Text>
        </View>
      </View>

      {/* KPI STRIP */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiVal}>{stats.total || 0}</Text>
          <Text style={styles.kpiLbl}>Tổng HS</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={[styles.kpiVal, { color: '#2563eb' }]}>{stats.paymentReview || 0}</Text>
          <Text style={styles.kpiLbl}>Chờ duyệt phí</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={[styles.kpiVal, { color: '#16a34a' }]}>
            {(stats.submitted || 0) + (stats.processing || 0)}
          </Text>
          <Text style={styles.kpiLbl}>Đang xử lý</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={[styles.kpiVal, { color: '#dc2626' }]}>{stats.overdue || 0}</Text>
          <Text style={styles.kpiLbl}>Quá hạn SLA</Text>
        </View>
      </View>

      {/* QUICK QR HANDOVER BAR */}
      <View style={styles.quickHandoverRow}>
        <TextInput
          style={styles.quickInput}
          value={quickQrInput}
          onChangeText={setQuickQrInput}
          placeholder="Nhập mã QR nhận giấy / Mã HS (VD: MC-2026-0001)..."
        />
        <TouchableOpacity style={styles.quickBtn} onPress={handleQuickHandover}>
          <Ionicons name="qr-code-outline" size={16} color="#fff" />
          <Text style={styles.quickBtnTxt}>Bàn giao</Text>
        </TouchableOpacity>
      </View>

      {/* FILTER CHIPS */}
      <View style={styles.filterRow}>
        {[
          { key: 'all', label: 'Tất cả' },
          { key: 'payment_review', label: 'Chờ duyệt phí' },
          { key: 'processing', label: 'Đang xử lý' },
          { key: 'overdue', label: '🚨 Quá hạn SLA' },
        ].map((chip) => (
          <TouchableOpacity
            key={chip.key}
            style={[styles.filterChip, filterMode === chip.key && styles.filterChipActive]}
            onPress={() => setFilterMode(chip.key)}
          >
            <Text
              style={[
                styles.filterChipTxt,
                filterMode === chip.key && styles.filterChipTxtActive,
              ]}
            >
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
            />
          }
        >
          {requests.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-done-circle-outline" size={44} color="#94a3b8" />
              <Text style={styles.emptyTxt}>Không có hồ sơ cần xử lý trong mục này</Text>
            </View>
          ) : (
            requests.map((item) => {
              const isOverdue = Boolean(item.isOverdue || item.slaStatus?.isOverdue);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.card, isOverdue && styles.cardOverdue]}
                  onPress={() => openProcessModal(item)}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.codeTxt}>#{item.requestCode}</Text>
                    <Text style={styles.statusTxt}>{item.status}</Text>
                  </View>
                  <Text style={styles.srvName}>{item.serviceName}</Text>
                  <Text style={styles.studentLine}>
                    👤 {item.studentFullName} ({item.studentUsername || item.nationalId || 'Cựu SV'}) • Lớp: {item.studentClass || '—'}
                  </Text>
                  <Text
                    style={[
                      styles.slaLine,
                      { color: isOverdue ? '#dc2626' : '#15803d' },
                    ]}
                  >
                    ⏱️ {item.slaStatus?.remainingText || '—'}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* MODAL XỬ LÝ HỒ SƠ */}
      <Modal
        visible={Boolean(selectedReq)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedReq(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Xử lý #{selectedReq?.requestCode}
              </Text>
              <TouchableOpacity onPress={() => setSelectedReq(null)}>
                <Ionicons name="close-circle" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selectedReq && (
              <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.srvName}>{selectedReq.serviceName}</Text>
                <Text style={styles.studentLine}>
                  SV: {selectedReq.studentFullName} ({selectedReq.studentUsername || selectedReq.nationalId})
                </Text>

                {/* Đối soát lệ phí nếu có */}
                {Number(selectedReq.feeAmount) > 0 && (
                  <View style={styles.paymentVerifyBox}>
                    <Text style={styles.paymentVerifyTitle}>
                      💳 Lệ phí: {Number(selectedReq.feeAmount).toLocaleString('vi-VN')} VNĐ ({selectedReq.paymentStatus})
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity
                        style={styles.confirmPayBtn}
                        disabled={saving}
                        onPress={handleConfirmPayment}
                      >
                        <Text style={styles.confirmPayBtnTxt}>✅ Duyệt Biên Lai</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rejectPayBtn}
                        disabled={saving}
                        onPress={handleRejectPayment}
                      >
                        <Text style={styles.rejectPayBtnTxt}>❌ Từ Chối Biên Lai</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Giải trình quá hạn bắt buộc nếu hồ sơ đã quá hạn SLA */}
                {(selectedReq.isOverdue || selectedReq.slaStatus?.isOverdue) && (
                  <View style={styles.overdueWarnBox}>
                    <Text style={styles.overdueWarnTitle}>
                      🚨 HỒ SƠ QUÁ HẠN SLA — BẮT BUỘC GIẢI TRÌNH TRƯỚC KHI DUYỆT HOÀN TẤT
                    </Text>
                    <View style={styles.chipsWrap}>
                      {OVERDUE_REASONS.map((r) => (
                        <TouchableOpacity
                          key={r.key}
                          style={[
                            styles.smallChip,
                            overdueCategory === r.key && styles.smallChipActive,
                          ]}
                          onPress={() => setOverdueCategory(r.key)}
                        >
                          <Text
                            style={[
                              styles.smallChipTxt,
                              overdueCategory === r.key && { color: '#fff' },
                            ]}
                          >
                            {r.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      style={[styles.input, { marginTop: 8, backgroundColor: '#fff' }]}
                      value={overdueReason}
                      onChangeText={setOverdueReason}
                      placeholder="Nhập lý do giải trình quá hạn báo cáo Trưởng đơn vị..."
                    />
                  </View>
                )}

                <Text style={styles.lbl}>Chuyển trạng thái xử lý *</Text>
                {STATUS_OPTIONS.map((st) => (
                  <TouchableOpacity
                    key={st.key}
                    style={[
                      styles.statusSelectRow,
                      targetStatus === st.key && styles.statusSelectRowActive,
                    ]}
                    onPress={() => setTargetStatus(st.key)}
                  >
                    <Ionicons
                      name={targetStatus === st.key ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={targetStatus === st.key ? '#166534' : '#64748b'}
                    />
                    <Text style={styles.statusSelectTxt}>{st.label}</Text>
                  </TouchableOpacity>
                ))}

                <Text style={styles.lbl}>Nơi nhận kết quả trực tiếp</Text>
                <TextInput
                  style={styles.input}
                  value={trayLocation}
                  onChangeText={setTrayLocation}
                  placeholder="Nhập nơi nhận kết quả..."
                />

                <Text style={styles.lbl}>Mã vận đơn Bưu điện (nếu gửi chuyển phát)</Text>
                <TextInput
                  style={styles.input}
                  value={postalTracking}
                  onChangeText={setPostalTracking}
                  placeholder="VD: EB123456789VN"
                />

                <Text style={styles.lbl}>Ghi chú / Phản hồi gửi cho Sinh viên</Text>
                <TextInput
                  style={styles.input}
                  value={staffNote}
                  onChangeText={setStaffNote}
                  placeholder="Nhập ghi chú hướng dẫn..."
                />
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              disabled={saving}
              onPress={handleSaveProcess}
            >
              <Text style={styles.saveBtnTxt}>
                {saving ? 'Đang lưu...' : '💾 Lưu & Cập Nhật Tiến Độ'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#166534',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#dcfce7', fontSize: 12, marginTop: 2 },
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  kpiVal: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  kpiLbl: { fontSize: 11, color: '#64748b', marginTop: 2 },
  quickHandoverRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginTop: 10,
    gap: 8,
  },
  quickInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
  },
  quickBtn: {
    backgroundColor: '#166534',
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  filterChipActive: { backgroundColor: '#166534' },
  filterChipTxt: { fontSize: 12, fontWeight: '700', color: '#475569' },
  filterChipTxtActive: { color: '#fff' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 12, paddingBottom: 28 },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyTxt: { color: '#64748b', fontSize: 13, marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardOverdue: { borderColor: '#fca5a5', backgroundColor: '#fff5f5' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  codeTxt: { fontSize: 13, fontWeight: '800', color: '#166534' },
  statusTxt: { fontSize: 11, fontWeight: '700', color: '#2563eb' },
  srvName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  studentLine: { fontSize: 12, color: '#475569', marginTop: 4 },
  slaLine: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  paymentVerifyBox: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  paymentVerifyTitle: { fontSize: 13, fontWeight: '700', color: '#1e40af' },
  confirmPayBtn: {
    flex: 1,
    backgroundColor: '#16a34a',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmPayBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rejectPayBtn: {
    flex: 1,
    backgroundColor: '#fee2e2',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectPayBtnTxt: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  overdueWarnBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  overdueWarnTitle: { fontSize: 12, fontWeight: '800', color: '#dc2626', marginBottom: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  smallChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },
  smallChipActive: { backgroundColor: '#dc2626' },
  smallChipTxt: { fontSize: 11, fontWeight: '700', color: '#991b1b' },
  lbl: { fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 10, marginBottom: 6 },
  statusSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 6,
  },
  statusSelectRowActive: { backgroundColor: '#f0fdf4', borderColor: '#166534' },
  statusSelectTxt: { fontSize: 12, color: '#0f172a', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    backgroundColor: '#f8fafc',
  },
  saveBtn: {
    backgroundColor: '#166534',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  saveBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
