import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getHomeroomStudentTuition } from '../services/api';
import { Colors } from '../theme/colors';
import FinanceBreakdown from './FinanceBreakdown';

/**
 * Màn hình (toàn màn) chi tiết học phí từng kỳ của 1 sinh viên lớp chủ nhiệm — cho GVCN.
 * Dữ liệu tải trực tiếp từ máy chủ mỗi lần mở, KHÔNG lưu trên máy; đóng lại là xóa khỏi bộ nhớ.
 * @param {number|null} idLop     lớp chủ nhiệm đang chọn
 * @param {object|null} student   thẻ SV trong danh sách (studentCode, studentName, statusId, ...)
 * @param {function}    onClose
 */
export default function StudentTuitionDetailModal({ idLop, student, onClose }) {
  const visible = Boolean(idLop && student?.studentCode);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    if (!visible) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError('');
    const res = await getHomeroomStudentTuition(idLop, student.studentCode);
    if (seq !== requestSeq.current) return; // đã đóng hoặc chuyển sang SV khác
    if (res?.success && res.data) {
      setDetail(res.data);
    } else {
      setDetail(null);
      setError(res?.message || 'Không thể tải chi tiết học phí sinh viên!');
    }
    setLoading(false);
  }, [visible, idLop, student?.studentCode]);

  useEffect(() => {
    if (visible) {
      load();
    } else {
      requestSeq.current++;
      setDetail(null);
      setError('');
      setLoading(false);
    }
  }, [visible, load]);

  const info = { ...(student || {}), ...(detail?.student || {}) };
  const phone = (info.phone || '').trim();
  const email = (info.email || '').trim();

  const openLink = (url) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose} accessibilityLabel="Đóng chi tiết học phí">
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{info.studentName || 'Sinh viên'}</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              MSSV: {info.studentCode}{info.studentClass ? ` • ${info.studentClass}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.infoBar}>
          {info.statusName ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{info.statusName}</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {phone ? (
            <TouchableOpacity style={styles.contactBtn} onPress={() => openLink(`tel:${phone}`)}>
              <Ionicons name="call-outline" size={16} color={Colors.primary} />
              <Text style={styles.contactBtnText}>Gọi</Text>
            </TouchableOpacity>
          ) : null}
          {email ? (
            <TouchableOpacity style={styles.contactBtn} onPress={() => openLink(`mailto:${email}`)}>
              <Ionicons name="mail-outline" size={16} color={Colors.primary} />
              <Text style={styles.contactBtnText}>Email</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.centerText}>Đang tải lịch sử học phí...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerWrap}>
            <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.centerText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.retryText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : detail ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            <FinanceBreakdown financeData={detail.data || []} summary={detail.summary || null} newestFirst />
            {detail.updatedAt ? (
              <Text style={styles.updatedAt}>
                Số liệu lấy trực tiếp từ hệ thống đào tạo lúc{' '}
                {new Date(detail.updatedAt).toLocaleString('vi-VN')}
              </Text>
            ) : null}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: { padding: 8, marginRight: 6, borderRadius: 20 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  statusPill: {
    backgroundColor: Colors.primary + '14',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  contactBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  centerText: { marginTop: 12, fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  updatedAt: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 8 },
});
