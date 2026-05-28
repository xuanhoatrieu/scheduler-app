import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { login } from '../services/api';
import { Colors } from '../theme/colors';

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState('DTN');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      setErrorMsg('Vui lòng nhập tài khoản và mật khẩu!');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const res = await login(username, password, role);
    setLoading(false);

    if (res.success) {
      onLoginSuccess(res.user);
    } else {
      setErrorMsg(res.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Background Decoration */}
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />
      <View style={styles.bgCircle3} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Logo Section */}
        <View style={styles.logoSection}>
          <Image source={require('../assets/logo.png')} style={styles.logoImage} />
          <Text style={styles.logoTitle}>TUAF Schedule</Text>
          <Text style={styles.logoSubtitle}>Lịch học & Giảng dạy thông minh</Text>
        </View>

        {/* Login Card */}
        <View style={styles.card}>
          {/* Role Tabs */}
          <View style={styles.roleTabs}>
            <TouchableOpacity
              style={[styles.roleTab, role === 'student' && styles.activeTab]}
              onPress={() => {
                setRole('student');
                if (username === '') {
                  setUsername('DTN');
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={role === 'student' ? 'school' : 'school-outline'}
                size={16}
                color={role === 'student' ? Colors.textOnPrimary : Colors.textSecondary}
              />
              <Text style={[styles.roleTabText, role === 'student' && styles.activeTabText]}>
                Sinh Viên
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleTab, role === 'lecturer' && styles.activeTab]}
              onPress={() => {
                setRole('lecturer');
                if (username === 'DTN') {
                  setUsername('');
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={role === 'lecturer' ? 'person' : 'person-outline'}
                size={16}
                color={role === 'lecturer' ? Colors.textOnPrimary : Colors.textSecondary}
              />
              <Text style={[styles.roleTabText, role === 'lecturer' && styles.activeTabText]}>
                Giảng Viên
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Message */}
          {errorMsg ? (
            <View style={styles.errorWrap}>
              <Ionicons name="alert-circle" size={16} color={Colors.danger} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Username Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              {role === 'student' ? 'Mã sinh viên (MSSV)' : 'Tên tài khoản'}
            </Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={role === 'student' ? 'VD: DTN245748004' : 'VD: xuanhoatrieu'}
                placeholderTextColor={Colors.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize={role === 'student' ? 'characters' : 'none'}
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mật khẩu cổng thông tin</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.disabledBtn]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.9}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={Colors.textOnPrimary} size="small" />
                <Text style={styles.loginBtnText}>ĐANG KẾT NỐI...</Text>
              </View>
            ) : (
              <View style={styles.loadingRow}>
                <Ionicons name="log-in-outline" size={20} color={Colors.textOnPrimary} />
                <Text style={styles.loginBtnText}>ĐĂNG NHẬP & ĐỒNG BỘ</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Security Note */}
          <View style={styles.securityNote}>
            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.success} />
            <Text style={styles.securityText}>
              Dữ liệu được mã hóa AES-256 đầu cuối & đồng bộ tự động hàng ngày
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // Background Decoration
  bgCircle1: {
    position: 'absolute', top: -80, right: -60,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: Colors.primary + '08',
  },
  bgCircle2: {
    position: 'absolute', bottom: -40, left: -60,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: Colors.primarySoft + '08',
  },
  bgCircle3: {
    position: 'absolute', top: '40%', left: -30,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.accentBlue + '05',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  // Logo
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImage: {
    width: 90,
    height: 90,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  logoTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  logoSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    elevation: 8,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  // Role Tabs
  roleTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  activeTab: {
    backgroundColor: Colors.primary,
    elevation: 2,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  activeTabText: {
    color: Colors.textOnPrimary,
  },
  // Error
  errorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.danger + '08',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.danger + '20',
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  // Input
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 4,
  },
  // Button
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  disabledBtn: {
    backgroundColor: Colors.primaryMuted,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loginBtnText: {
    color: Colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Security Note
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 6,
  },
  securityText: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 14,
  },
});
