import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getTeachingPayment } from '../../services/api';
import { Colors } from '../../theme/colors';

export default function LecturerUtilitiesScreen({ user, onNavigate }) {
  const [summary, setSummary] = useState({
    totalSubjects: 0,
    totalCredits: 0,
    totalPeriods: 0,
    totalConvertedHours: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  const loadWorkload = async () => {
    try {
      const res = await getTeachingPayment();
      if (res && res.success && res.summary) {
        setSummary(res.summary);
      }
    } catch (e) {
      // Quiet fail
    }
  };

  useEffect(() => {
    loadWorkload();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWorkload();
    setRefreshing(false);
  };

  const handleOpenLink = async (url, title) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Không thể mở liên kết', `Không thể truy cập: ${url}`);
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể mở trình duyệt: ' + e.message);
    }
  };

  const handleComingSoon = (featureName) => {
    Alert.alert(
      'Sắp ra mắt',
      `Tính năng "${featureName}" đang được nâng cấp và hoàn thiện quy trình với Nhà trường.`
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Tiện Ích Giảng Viên</Text>
          <Text style={styles.headerSubtitle}>Trung tâm dịch vụ số & học vụ TUAF</Text>
        </View>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{(user?.fullName || user?.name || 'GV').charAt(0)}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
      >
        {/* HERO WORKLOAD CARD */}
        <TouchableOpacity
          style={styles.heroCard}
          activeOpacity={0.9}
          onPress={() => onNavigate('TeachingPayment')}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroSub}>KHỐI LƯỢNG GIẢNG DẠY KỲ NÀY</Text>
              <Text style={styles.heroHours}>
                {summary.totalConvertedHours || summary.totalPeriods || 0} <Text style={styles.heroUnit}>giờ chuẩn</Text>
              </Text>
            </View>
            <View style={styles.heroActionBtn}>
              <Text style={styles.heroActionTxt}>Xem chi tiết</Text>
              <Ionicons name="chevron-forward" size={14} color="#fff" />
            </View>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatVal}>{summary.totalSubjects || 0}</Text>
              <Text style={styles.heroStatLbl}>Lớp học phần</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatVal}>{summary.totalCredits || 0}</Text>
              <Text style={styles.heroStatLbl}>Tín chỉ</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatVal}>{summary.totalPeriods || 0}</Text>
              <Text style={styles.heroStatLbl}>Tiết xếp lịch</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* SECTION: DANH MỤC TIỆN ÍCH */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Công Cụ & Dịch Vụ Học Vụ</Text>
        </View>

        <View style={styles.grid}>
          {/* 1. LỊCH SỬ GIẢNG DẠY */}
          <TouchableOpacity
            style={styles.gridCard}
            activeOpacity={0.8}
            onPress={() => onNavigate('TeachingHistory')}
          >
            <View style={[styles.gridIconWrap, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="book" size={24} color="#2563eb" />
            </View>
            <Text style={styles.gridTitle}>Lịch Sử Giảng Dạy</Text>
            <Text style={styles.gridDesc}>Danh mục lớp & sinh viên</Text>
          </TouchableOpacity>

          {/* 2. THANH TOÁN GIỜ GIẢNG */}
          <TouchableOpacity
            style={styles.gridCard}
            activeOpacity={0.8}
            onPress={() => onNavigate('TeachingPayment')}
          >
            <View style={[styles.gridIconWrap, { backgroundColor: '#f0fdf4' }]}>
              <Ionicons name="cash" size={24} color="#16a34a" />
            </View>
            <Text style={styles.gridTitle}>Thanh Toán Giờ Giảng</Text>
            <Text style={styles.gridDesc}>Thù lao & tiến trình duyệt</Text>
          </TouchableOpacity>

          {/* 3. KHẢO THÍ & THANH TRA */}
          <TouchableOpacity
            style={styles.gridCard}
            activeOpacity={0.8}
            onPress={() => onNavigate('InspectorFeedback')}
          >
            <View style={[styles.gridIconWrap, { backgroundColor: '#f0f9ff' }]}>
              <Ionicons name="shield-checkmark" size={24} color="#0284c7" />
            </View>
            <Text style={styles.gridTitle}>Khảo Thí & Thanh Tra</Text>
            <Text style={styles.gridDesc}>Ghi nhận nề nếp & giải trình</Text>
          </TouchableOpacity>

          {/* 4. BIỂU MẪU & QUY CHẾ */}
          <TouchableOpacity
            style={styles.gridCard}
            activeOpacity={0.8}
            onPress={() => onNavigate('AcademicDocuments')}
          >
            <View style={[styles.gridIconWrap, { backgroundColor: '#faf5ff' }]}>
              <Ionicons name="document-text" size={24} color="#7c3aed" />
            </View>
            <Text style={styles.gridTitle}>Biểu Mẫu & Quy Chế</Text>
            <Text style={styles.gridDesc}>Văn bản & biểu mẫu chuẩn</Text>
          </TouchableOpacity>

          {/* 5. ĐĂNG KÝ BÁO NGHỈ / DẠY BÙ (MỜ) */}
          <TouchableOpacity
            style={[styles.gridCard, styles.gridCardDisabled]}
            activeOpacity={0.7}
            onPress={() => handleComingSoon('Đăng ký báo nghỉ / dạy bù')}
          >
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Sắp ra mắt</Text>
            </View>
            <View style={[styles.gridIconWrap, { backgroundColor: '#f1f5f9' }]}>
              <Ionicons name="swap-horizontal" size={24} color="#64748b" />
            </View>
            <Text style={[styles.gridTitle, { color: '#64748b' }]}>Báo Nghỉ / Dạy Bù</Text>
            <Text style={styles.gridDesc}>Đổi giờ, thông báo tự động</Text>
          </TouchableOpacity>

          {/* 6. LỊCH TUẦN TUAF (MỜ) */}
          <TouchableOpacity
            style={[styles.gridCard, styles.gridCardDisabled]}
            activeOpacity={0.7}
            onPress={() => handleComingSoon('Lịch tuần công tác TUAF')}
          >
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Sắp ra mắt</Text>
            </View>
            <View style={[styles.gridIconWrap, { backgroundColor: '#f1f5f9' }]}>
              <Ionicons name="calendar-outline" size={24} color="#64748b" />
            </View>
            <Text style={[styles.gridTitle, { color: '#64748b' }]}>Lịch Tuần Trường</Text>
            <Text style={styles.gridDesc}>Lịch công tác BGH & Khoa</Text>
          </TouchableOpacity>
        </View>

        {/* SECTION: CỔNG LIÊN KẾT NHANH */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>Cổng Liên Kết Nhanh</Text>
          <Text style={styles.sectionSubtitle}>Truy cập nhanh hệ thống trực tuyến</Text>
        </View>

        <View style={styles.portalGrid}>
          {/* TRANG CHỦ TUAF */}
          <TouchableOpacity
            style={styles.portalCard}
            activeOpacity={0.8}
            onPress={() => handleOpenLink('https://tuaf.edu.vn', 'Trang chủ TUAF')}
          >
            <View style={[styles.portalIcon, { backgroundColor: '#e0f2fe' }]}>
              <Ionicons name="globe-outline" size={20} color="#0284c7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.portalName}>Trang Chủ TUAF</Text>
              <Text style={styles.portalUrl}>tuaf.edu.vn</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* LMS TUAF */}
          <TouchableOpacity
            style={styles.portalCard}
            activeOpacity={0.8}
            onPress={() => handleOpenLink('https://lms.tuaf.edu.vn', 'LMS E-learning')}
          >
            <View style={[styles.portalIcon, { backgroundColor: '#dcfce7' }]}>
              <Ionicons name="school-outline" size={20} color="#15803d" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.portalName}>LMS E-Learning</Text>
              <Text style={styles.portalUrl}>lms.tuaf.edu.vn</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* CỔNG GIẢNG VIÊN */}
          <TouchableOpacity
            style={styles.portalCard}
            activeOpacity={0.8}
            onPress={() => handleOpenLink('https://giangvien.tuaf.edu.vn', 'Cổng Giảng Viên')}
          >
            <View style={[styles.portalIcon, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="person-outline" size={20} color="#b45309" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.portalName}>Cổng Giảng Viên</Text>
              <Text style={styles.portalUrl}>giangvien.tuaf.edu.vn</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* CỔNG SINH VIÊN */}
          <TouchableOpacity
            style={styles.portalCard}
            activeOpacity={0.8}
            onPress={() => handleOpenLink('https://sinhvien.tuaf.edu.vn', 'Cổng Sinh Viên')}
          >
            <View style={[styles.portalIcon, { backgroundColor: '#fae8ff' }]}>
              <Ionicons name="people-outline" size={20} color="#a21caf" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.portalName}>Cổng Sinh Viên</Text>
              <Text style={styles.portalUrl}>sinhvien.tuaf.edu.vn</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 18,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 20,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroSub: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5 },
  heroHours: { fontSize: 26, fontWeight: '900', color: '#fff', marginTop: 2 },
  heroUnit: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  heroActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  heroActionTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 14,
    paddingVertical: 10,
    marginTop: 14,
  },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 16, fontWeight: '800', color: '#fff' },
  heroStatLbl: { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  heroStatDivider: { width: 1, height: 22, backgroundColor: 'rgba(255,255,255,0.2)' },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  sectionSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
    position: 'relative',
  },
  gridCardDisabled: { opacity: 0.65 },
  comingSoonBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  comingSoonText: { fontSize: 9, fontWeight: '700', color: '#64748b' },
  gridIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  gridTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  gridDesc: { fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  portalGrid: { gap: 8 },
  portalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 12,
  },
  portalIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  portalUrl: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
});
