import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { syncHistory } from '../services/api';
import { Colors } from '../theme/colors';

export default function ProfileScreen({ user, onLogout }) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const handleSyncHistory = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncHistory();
      if (res.success) {
        setSyncResult({
          type: 'success',
          message: `Đồng bộ thành công! ${res.gradesCount || 0} môn điểm, ${res.financeCount || 0} kỳ học phí.`
        });
      } else {
        setSyncResult({ type: 'error', message: res.message || 'Đồng bộ thất bại!' });
      }
    } catch (err) {
      setSyncResult({ type: 'error', message: 'Lỗi kết nối máy chủ!' });
    }
    setSyncing(false);
  };

  const confirmLogout = () => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc chắn muốn đăng xuất? Dữ liệu cache sẽ bị xóa.',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: onLogout },
      ]
    );
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Chưa đồng bộ';
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} — ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Hồ Sơ</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user.fullName || user.username || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={[styles.roleBadge, { backgroundColor: user.role === 'student' ? Colors.primaryBg : Colors.accentBlue + '15' }]}>
              <Text style={[styles.roleText, { color: user.role === 'student' ? Colors.primary : Colors.accentBlue }]}>
                {user.role === 'student' ? '🎓 Sinh viên' : '👨‍🏫 Giảng viên'}
              </Text>
            </View>
          </View>

          <Text style={styles.fullName}>{user.fullName || 'Sinh viên TUAF'}</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Ionicons name="id-card-outline" size={18} color={Colors.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>{user.role === 'student' ? 'MSSV' : 'Tài khoản'}</Text>
                <Text style={styles.infoValue}>{user.username}</Text>
              </View>
            </View>

            {user.className ? (
              <View style={styles.infoItem}>
                <Ionicons name="people-outline" size={18} color={Colors.accentPurple} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Lớp</Text>
                  <Text style={styles.infoValue}>{user.className}</Text>
                </View>
              </View>
            ) : null}

            {user.department ? (
              <View style={styles.infoItem}>
                <Ionicons name="business-outline" size={18} color={Colors.accentOrange} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Khoa</Text>
                  <Text style={styles.infoValue}>{user.department}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={18} color={Colors.info} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Đồng bộ lần cuối</Text>
                <Text style={styles.infoValue}>{formatDateTime(user.lastSyncedAt)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Sync History Button */}
        <View style={styles.actionSection}>
          <Text style={styles.sectionTitle}>DỮ LIỆU LỊCH SỬ</Text>

          <TouchableOpacity
            style={[styles.syncHistoryBtn, syncing && styles.syncingBtn]}
            onPress={handleSyncHistory}
            disabled={syncing}
            activeOpacity={0.8}
          >
            <View style={styles.syncHistoryLeft}>
              {syncing ? (
                <ActivityIndicator size="small" color={Colors.textOnPrimary} />
              ) : (
                <Ionicons name="cloud-download-outline" size={22} color={Colors.textOnPrimary} />
              )}
              <View style={styles.syncHistoryText}>
                <Text style={styles.syncHistoryTitle}>
                  {syncing ? 'Đang đồng bộ lịch sử...' : 'Đồng Bộ Lịch Sử Toàn Khóa'}
                </Text>
                <Text style={styles.syncHistorySubtitle}>
                  Cào điểm số và học phí tất cả các kỳ cũ
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textOnPrimary} />
          </TouchableOpacity>

          {syncing && (
            <View style={styles.syncProgress}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.syncProgressText}>
                Quá trình cào dữ liệu có thể mất 20-40 giây...
              </Text>
            </View>
          )}

          {syncResult && (
            <View style={[styles.syncResultCard, {
              backgroundColor: syncResult.type === 'success' ? Colors.success + '10' : Colors.danger + '10',
              borderColor: syncResult.type === 'success' ? Colors.success + '30' : Colors.danger + '30',
            }]}>
              <Ionicons
                name={syncResult.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
                size={20}
                color={syncResult.type === 'success' ? Colors.success : Colors.danger}
              />
              <Text style={[styles.syncResultText, {
                color: syncResult.type === 'success' ? Colors.success : Colors.danger,
              }]}>
                {syncResult.message}
              </Text>
            </View>
          )}
        </View>

        {/* App Info */}
        <View style={styles.actionSection}>
          <Text style={styles.sectionTitle}>ỨNG DỤNG</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoCardRow}>
              <Text style={styles.infoCardLabel}>Phiên bản</Text>
              <Text style={styles.infoCardValue}>2.0.0</Text>
            </View>
            <View style={styles.infoCardDivider} />
            <View style={styles.infoCardRow}>
              <Text style={styles.infoCardLabel}>Nguồn dữ liệu</Text>
              <Text style={styles.infoCardValue}>sinhvien.tuaf.edu.vn</Text>
            </View>
            <View style={styles.infoCardDivider} />
            <View style={styles.infoCardRow}>
              <Text style={styles.infoCardLabel}>Bảo mật</Text>
              <Text style={styles.infoCardValue}>AES-256 End-to-End</Text>
            </View>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text style={styles.logoutText}>Đăng Xuất</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  // Profile Card
  profileCard: {
    backgroundColor: Colors.surface, margin: 16, borderRadius: 20, padding: 24,
    elevation: 4, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 12, alignItems: 'center',
  },
  avatarWrap: { alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6,
  },
  avatarText: { fontSize: 32, fontWeight: '900', color: Colors.textOnPrimary },
  roleBadge: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 8,
  },
  roleText: { fontSize: 12, fontWeight: '700' },
  fullName: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  infoGrid: { width: '100%', marginTop: 20, gap: 12 },
  infoItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background,
    borderRadius: 12, padding: 14,
  },
  infoContent: { marginLeft: 12, flex: 1 },
  infoLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginTop: 2 },
  // Action Section
  actionSection: { paddingHorizontal: 16, marginTop: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1, marginBottom: 10 },
  syncHistoryBtn: {
    backgroundColor: Colors.primary, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    elevation: 3, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 6,
  },
  syncingBtn: { backgroundColor: Colors.primaryMuted },
  syncHistoryLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  syncHistoryText: { marginLeft: 12, flex: 1 },
  syncHistoryTitle: { fontSize: 15, fontWeight: '700', color: Colors.textOnPrimary },
  syncHistorySubtitle: { fontSize: 11, color: Colors.textOnPrimary + 'CC', marginTop: 2 },
  syncProgress: {
    flexDirection: 'row', alignItems: 'center', marginTop: 10,
    backgroundColor: Colors.primaryBg, borderRadius: 10, padding: 10, gap: 8,
  },
  syncProgressText: { fontSize: 12, color: Colors.primary, flex: 1 },
  syncResultCard: {
    flexDirection: 'row', alignItems: 'center', marginTop: 10,
    borderRadius: 10, padding: 12, borderWidth: 1, gap: 8,
  },
  syncResultText: { fontSize: 13, fontWeight: '600', flex: 1 },
  // Info Card
  infoCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 4,
    elevation: 2, shadowColor: Colors.shadowColor, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4,
  },
  infoCardRow: {
    flexDirection: 'row', justifyContent: 'space-between', padding: 14,
  },
  infoCardLabel: { fontSize: 13, color: Colors.textSecondary },
  infoCardValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  infoCardDivider: { height: 1, backgroundColor: Colors.borderLight, marginHorizontal: 14 },
  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 16, marginTop: 24, paddingVertical: 14,
    backgroundColor: Colors.danger + '10', borderRadius: 14, borderWidth: 1, borderColor: Colors.danger + '20',
    gap: 8,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: Colors.danger },
});
