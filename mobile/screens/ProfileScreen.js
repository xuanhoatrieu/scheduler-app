import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { syncHistory } from '../services/api';
import { Colors } from '../theme/colors';

export default function ProfileScreen({ user, onLogout, onSwitchRole }) {
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
        setSyncResult({
          type: 'error',
          message: res.message || 'Đồng bộ thất bại. Vui lòng thử lại!'
        });
      }
    } catch (e) {
      setSyncResult({
        type: 'error',
        message: 'Lỗi kết nối máy chủ khi đồng bộ lịch sử.'
      });
    } finally {
      setSyncing(false);
    }
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

  const handleAccountDeletion = () => {
    Alert.alert(
      'Quản Lý Tài Khoản & Dữ Liệu',
      '• Xóa dữ liệu ứng dụng: Xóa toàn bộ phiên đăng nhập, mật khẩu đã mã hóa, lịch học và điểm thi lưu trên thiết bị này.\n\n• Xóa tài khoản vĩnh viễn: Tài khoản của bạn liên kết trực tiếp với Cổng thông tin đào tạo TUAF. Để yêu cầu xóa bản ghi hồ sơ sinh viên/giảng viên khỏi hệ thống, vui lòng liên hệ Phòng Đào tạo (phongdaotao@tuaf.edu.vn).',
      [
        { text: 'Đóng', style: 'cancel' },
        {
          text: 'Gửi Email Hỗ Trợ Xóa',
          onPress: () => {
            Linking.openURL(
              `mailto:phongdaotao@tuaf.edu.vn?subject=Yeu cau xoa tai khoan TUAF&body=Kính gửi Phòng Đào tạo, tôi muốn yêu cầu hỗ trợ đóng tài khoản và xóa thông tin đào tạo liên kết với mã: ${user?.username || ''}`
            );
          },
        },
        {
          text: 'Xóa Dữ Liệu & Đăng Xuất',
          style: 'destructive',
          onPress: onLogout,
        },
      ]
    );
  };

  const openPrivacyPolicy = () => {
    Linking.openURL('https://scheduler.tuaf.edu.vn/privacy').catch(() => {
      Alert.alert('Chính sách quyền riêng tư', 'Vui lòng truy cập: https://scheduler.tuaf.edu.vn/privacy');
    });
  };

  const openTerms = () => {
    Linking.openURL('https://scheduler.tuaf.edu.vn/terms').catch(() => {
      Alert.alert('Điều khoản dịch vụ', 'Vui lòng truy cập: https://scheduler.tuaf.edu.vn/terms');
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Chưa đồng bộ';
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} — ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Hồ Sơ</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {((user?.fullName || user?.username || '?')).charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={[styles.roleBadge, { 
              backgroundColor: user?.role === 'student' 
                ? Colors.primaryBg 
                : user?.role === 'inspector' 
                  ? '#ede7f6' 
                  : Colors.accentBlue + '15' 
            }]}>
              <Text style={[styles.roleText, { 
                color: user?.role === 'student' 
                  ? Colors.primary 
                  : user?.role === 'inspector' 
                    ? '#5c6bc0' 
                    : Colors.accentBlue 
              }]}>
                {user?.role === 'student' ? '🎓 Sinh viên' : user?.role === 'inspector' ? '📋 Thanh tra' : '👨‍🏫 Giảng viên'}
              </Text>
            </View>
          </View>

          <Text style={styles.fullName}>
            {user?.fullName || (user?.role === 'inspector' ? 'Thanh tra đào tạo' : user?.role === 'lecturer' ? 'Giảng viên TUAF' : 'Sinh viên TUAF')}
          </Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Ionicons name="id-card-outline" size={18} color={Colors.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>{user?.role === 'student' ? 'MSSV' : 'Tài khoản'}</Text>
                <Text style={styles.infoValue}>{user?.username || ''}</Text>
              </View>
            </View>

            {user?.className ? (
              <View style={styles.infoItem}>
                <Ionicons name="people-outline" size={18} color={Colors.accentPurple} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Lớp</Text>
                  <Text style={styles.infoValue}>{user.className}</Text>
                </View>
              </View>
            ) : null}

            {user?.department ? (
              <View style={styles.infoItem}>
                <Ionicons name="business-outline" size={18} color={Colors.accentOrange} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Khoa / Đơn vị</Text>
                  <Text style={styles.infoValue}>{user.department}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={18} color={Colors.info} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Đồng bộ lần cuối</Text>
                <Text style={styles.infoValue}>{formatDateTime(user?.lastSyncedAt)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Sync History Button - Chỉ hiển thị cho Sinh viên */}
        {user?.role === 'student' && (
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
        )}

        {/* Role Switch Section - Cho tài khoản Giảng viên / Thanh tra */}
        {onSwitchRole && (
          (user?.role === 'lecturer' && user?.availableRoles?.includes('inspector')) ||
          (user?.role === 'inspector' && user?.availableRoles?.includes('lecturer'))
        ) && (
          <View style={styles.actionSection}>
            <Text style={styles.sectionTitle}>CHUYỂN ĐỔI VAI TRÒ</Text>
            {user?.role === 'lecturer' ? (
              <TouchableOpacity
                style={[styles.switchRoleCard, { borderColor: '#c7d2fe', backgroundColor: '#eef2ff' }]}
                onPress={() => onSwitchRole('inspector')}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                  <View style={[styles.roleSwitchIconWrap, { backgroundColor: '#e0e7ff' }]}>
                    <Ionicons name="shield-checkmark" size={24} color="#4338ca" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleSwitchTitle, { color: '#312e81' }]}>
                      Chuyển sang Thanh tra đào tạo
                    </Text>
                    <Text style={styles.roleSwitchSubtitle}>
                      Kiểm tra, điểm danh lớp học toàn trường
                    </Text>
                  </View>
                </View>
                <Ionicons name="swap-horizontal" size={20} color="#4338ca" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.switchRoleCard, { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}
                onPress={() => onSwitchRole('lecturer')}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                  <View style={[styles.roleSwitchIconWrap, { backgroundColor: '#dcfce7' }]}>
                    <Ionicons name="school" size={24} color="#15803d" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleSwitchTitle, { color: '#14532d' }]}>
                      Chuyển sang Giảng viên
                    </Text>
                    <Text style={styles.roleSwitchSubtitle}>
                      Xem lịch giảng dạy & quản lý lớp chủ nhiệm
                    </Text>
                  </View>
                </View>
                <Ionicons name="swap-horizontal" size={20} color="#15803d" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* App Info & Legal */}
        <View style={styles.actionSection}>
          <Text style={styles.sectionTitle}>ỨNG DỤNG & PHÁP LÝ</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoCardRow}>
              <Text style={styles.infoCardLabel}>Phiên bản</Text>
              <Text style={styles.infoCardValue}>2.0.0 (Build 1)</Text>
            </View>
            <View style={styles.infoCardDivider} />
            <View style={styles.infoCardRow}>
              <Text style={styles.infoCardLabel}>Nguồn dữ liệu</Text>
              <Text style={styles.infoCardValue}>sinhvien.tuaf.edu.vn</Text>
            </View>
            <View style={styles.infoCardDivider} />
            <View style={styles.infoCardRow}>
              <Text style={styles.infoCardLabel}>Bảo mật</Text>
              <Text style={styles.infoCardValue}>AES-256 / HTTPS</Text>
            </View>
            <View style={styles.infoCardDivider} />
            
            {/* Privacy Policy Link */}
            <TouchableOpacity style={styles.infoCardActionRow} onPress={openPrivacyPolicy} activeOpacity={0.7}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
                <Text style={styles.infoCardActionText}>Chính sách quyền riêng tư</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.infoCardDivider} />

            {/* Terms of Service Link */}
            <TouchableOpacity style={styles.infoCardActionRow} onPress={openTerms} activeOpacity={0.7}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
                <Text style={styles.infoCardActionText}>Điều khoản dịch vụ</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Account Deletion (Apple Guideline 5.1.1(v) Compliance) */}
        <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleAccountDeletion} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={18} color="#dc2626" />
          <Text style={styles.deleteAccountText}>Xóa Tài Khoản & Dữ Liệu</Text>
        </TouchableOpacity>

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
  infoCardActionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14,
  },
  infoCardActionText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  // Delete Account (Apple Guideline 5.1.1(v))
  deleteAccountBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 16, marginTop: 18, paddingVertical: 12,
    backgroundColor: '#fee2e240', borderRadius: 14, borderWidth: 1, borderColor: '#fca5a5',
    gap: 6,
  },
  deleteAccountText: { fontSize: 13, fontWeight: '700', color: '#b91c1c' },
  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 16, marginTop: 12, paddingVertical: 14,
    backgroundColor: Colors.danger + '10', borderRadius: 14, borderWidth: 1, borderColor: Colors.danger + '20',
    gap: 8,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: Colors.danger },
  // Role Switch Card
  switchRoleCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 16, borderWidth: 1.5,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 4,
  },
  roleSwitchIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  roleSwitchTitle: { fontSize: 15, fontWeight: '800' },
  roleSwitchSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
