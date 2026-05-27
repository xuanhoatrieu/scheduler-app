import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Animated, Modal, FlatList, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../services/api';

const THEME = {
  primary:     '#0D7377',
  primaryDark: '#095E61',
  primaryBg:   '#E8F5F5',
  bg:          '#F0F4F8',
  card:        '#FFFFFF',
  text:        '#1E293B',
  textSec:     '#64748B',
  textMuted:   '#94A3B8',
  border:      '#E2E8F0',
  danger:      '#EF4444',
  warn:        '#F59E0B',
};

const STATIC_PORTALS = [
  { id: 'tuaf', name: 'ĐH Nông Lâm Thái Nguyên', shortName: 'TUAF' },
];

// Thời gian hiển thị thông báo "server đang thức dậy"
const WAKE_UP_THRESHOLD_MS = 5000;

export default function LoginScreen() {
  const { login, loading, error } = useAuth();

  const [maSV,       setMaSV]       = useState('');
  const [pass,       setPass]       = useState('');
  const [showPwd,    setShowPwd]    = useState(false);
  const [portals,    setPortals]    = useState(STATIC_PORTALS);
  const [portal,     setPortal]     = useState(STATIC_PORTALS[0]);
  const [picker,     setPicker]     = useState(false);
  const [wakingUp,   setWakingUp]   = useState(false); // server đang wake up
  const [loginTimer, setLoginTimer] = useState(null);

  const shake = useRef(new Animated.Value(0)).current;

  // Fetch danh sách cổng (không block UI nếu lỗi)
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/portals`, { signal: AbortSignal.timeout?.(5000) })
      .then(r => r.json())
      .then(d => { if (d.portals?.length) { setPortals(d.portals); setPortal(d.portals[0]); } })
      .catch(() => {}); // fallback về STATIC_PORTALS
  }, []);

  // Hiện thông báo "server đang thức dậy" nếu loading > 5 giây
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => setWakingUp(true), WAKE_UP_THRESHOLD_MS);
      setLoginTimer(t);
    } else {
      if (loginTimer) clearTimeout(loginTimer);
      setWakingUp(false);
    }
    return () => { if (loginTimer) clearTimeout(loginTimer); };
  }, [loading]);

  const doShake = () =>
    Animated.sequence([
      Animated.timing(shake, { toValue: 12,  duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -12, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6,   duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,   duration: 55, useNativeDriver: true }),
    ]).start();

  const handleLogin = async (demo = false) => {
    if (!demo && (!maSV.trim() || !pass)) {
      doShake();
      return;
    }
    // Luôn có portalId - fallback về 'tuaf' nếu portal chưa load
    const portalId = portal?.id || 'tuaf';
    const ok = await login(portalId, maSV.trim(), pass, demo);
    if (!ok) doShake();
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Ionicons name="school" size={40} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>Lịch Học Sinh Viên</Text>
            <Text style={styles.heroSub}>Đăng nhập bằng tài khoản cổng trường</Text>
          </View>

          {/* Card */}
          <Animated.View style={[styles.card, { transform: [{ translateX: shake }] }]}>

            {/* Chọn trường */}
            <Text style={styles.label}>Cổng thông tin trường</Text>
            <TouchableOpacity style={styles.inputRow} onPress={() => setPicker(true)} activeOpacity={0.7}>
              <Ionicons name="school-outline" size={19} color={THEME.primary} style={styles.icoL} />
              <Text style={[styles.inputText, { color: portal ? THEME.text : THEME.textMuted }]} numberOfLines={1}>
                {portal?.name || 'Chọn trường...'}
              </Text>
              <Ionicons name="chevron-down" size={17} color={THEME.textMuted} />
            </TouchableOpacity>

            {/* Mã SV */}
            <Text style={[styles.label, { marginTop: 14 }]}>Mã sinh viên</Text>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={19} color={THEME.primary} style={styles.icoL} />
              <TextInput
                style={styles.inputText}
                placeholder="VD: K225520121001"
                placeholderTextColor={THEME.textMuted}
                value={maSV}
                onChangeText={setMaSV}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="next"
                editable={!loading}
              />
            </View>

            {/* Mật khẩu */}
            <Text style={[styles.label, { marginTop: 14 }]}>Mật khẩu</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={19} color={THEME.primary} style={styles.icoL} />
              <TextInput
                style={[styles.inputText, { flex: 1 }]}
                placeholder="Mật khẩu cổng thông tin"
                placeholderTextColor={THEME.textMuted}
                value={pass}
                onChangeText={setPass}
                secureTextEntry={!showPwd}
                returnKeyType="done"
                onSubmitEditing={() => handleLogin(false)}
                editable={!loading}
              />
              <TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}>
                <Ionicons name={showPwd ? 'eye-outline' : 'eye-off-outline'} size={19} color={THEME.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Trạng thái loading / wake-up */}
            {loading && wakingUp && (
              <View style={styles.wakeBox}>
                <ActivityIndicator size="small" color={THEME.warn} />
                <Text style={styles.wakeText}>
                  Server đang thức dậy (Render free tier)...{'\n'}
                  Có thể mất 20–30 giây lần đầu, vui lòng chờ 🙏
                </Text>
              </View>
            )}

            {/* Lỗi */}
            {!!error && !loading && (
              <View style={styles.errBox}>
                <Ionicons name="alert-circle-outline" size={15} color={THEME.danger} />
                <Text style={styles.errText}>{error}</Text>
              </View>
            )}

            {/* Nút đăng nhập */}
            <TouchableOpacity
              style={[styles.btnPrimary, loading && styles.btnDisabled]}
              onPress={() => handleLogin(false)}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <><ActivityIndicator color="#fff" /><Text style={styles.btnPrimaryText}>Đang đăng nhập...</Text></>
                : <><Ionicons name="log-in-outline" size={19} color="#fff" /><Text style={styles.btnPrimaryText}>Đăng nhập</Text></>
              }
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.divLine} />
              <Text style={styles.divTxt}>hoặc</Text>
              <View style={styles.divLine} />
            </View>

            {/* Dùng thử */}
            <TouchableOpacity
              style={[styles.btnOutline, loading && styles.btnDisabled]}
              onPress={() => handleLogin(true)}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Ionicons name="flask-outline" size={17} color={THEME.primary} />
              <Text style={styles.btnOutlineText}>Xem thử với dữ liệu mẫu</Text>
            </TouchableOpacity>
          </Animated.View>

          <Text style={styles.note}>
            🔒 Mật khẩu chỉ dùng để đăng nhập cổng trường, không được lưu trữ.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal chọn trường */}
      <Modal visible={picker} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Chọn trường</Text>
              <TouchableOpacity onPress={() => setPicker(false)}>
                <Ionicons name="close" size={22} color={THEME.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={portals}
              keyExtractor={p => p.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.portalRow, item.id === portal?.id && styles.portalRowActive]}
                  onPress={() => { setPortal(item); setPicker(false); }}
                >
                  <View style={styles.portalAvatar}>
                    <Text style={styles.portalAvatarTxt}>{item.shortName[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.portalName}>{item.name}</Text>
                    <Text style={styles.portalShort}>{item.shortName}</Text>
                  </View>
                  {item.id === portal?.id &&
                    <Ionicons name="checkmark-circle" size={21} color={THEME.primary} />}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() =>
                <View style={{ height: 1, backgroundColor: THEME.border, marginLeft: 70 }} />}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#095E61' },
  scroll: { flexGrow: 1, paddingBottom: 32 },

  hero: { alignItems: 'center', paddingTop: 52, paddingBottom: 28, paddingHorizontal: 24 },
  logoWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.3, marginBottom: 5 },
  heroSub:   { fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },

  card: {
    backgroundColor: THEME.card,
    marginHorizontal: 18,
    borderRadius: 22,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },

  label:     { fontSize: 12, fontWeight: '700', color: THEME.textSec, letterSpacing: 0.3, marginBottom: 7 },
  inputRow:  {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: THEME.border,
    borderRadius: 12, backgroundColor: THEME.bg,
    paddingHorizontal: 12, height: 50,
  },
  icoL:      { marginRight: 9 },
  inputText: { flex: 1, fontSize: 14, color: THEME.text },

  wakeBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, marginTop: 12,
  },
  wakeText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },

  errBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginTop: 12,
  },
  errText: { color: THEME.danger, fontSize: 12, flex: 1, lineHeight: 18 },

  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: THEME.primary, borderRadius: 13, height: 52, marginTop: 18,
    shadowColor: THEME.primary, shadowOpacity: 0.35, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled:    { opacity: 0.6 },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  divLine: { flex: 1, height: 1, backgroundColor: THEME.border },
  divTxt:  { fontSize: 12, color: THEME.textMuted },

  btnOutline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, borderWidth: 1.5, borderColor: THEME.primary,
    borderRadius: 13, height: 48, backgroundColor: THEME.primaryBg,
  },
  btnOutlineText: { color: THEME.primary, fontSize: 14, fontWeight: '600' },

  note: {
    color: 'rgba(255,255,255,0.5)', fontSize: 11.5,
    textAlign: 'center', marginTop: 20, paddingHorizontal: 30,
  },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: THEME.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '70%', paddingBottom: 28,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 18, borderBottomWidth: 1, borderBottomColor: THEME.border,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: THEME.text },

  portalRow:       { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 },
  portalRowActive: { backgroundColor: THEME.primaryBg },
  portalAvatar:    {
    width: 42, height: 42, borderRadius: 11,
    backgroundColor: THEME.primary, justifyContent: 'center', alignItems: 'center',
  },
  portalAvatarTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  portalName:      { fontSize: 14, fontWeight: '700', color: THEME.text },
  portalShort:     { fontSize: 12, color: THEME.textSec, marginTop: 2 },
});
