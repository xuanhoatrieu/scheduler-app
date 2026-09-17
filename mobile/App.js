import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './navigation/AppNavigator';
import InspectorNavigator from './navigation/InspectorNavigator';
import LecturerNavigator from './navigation/LecturerNavigator';
import LoginScreen from './screens/LoginScreen';
import { logout, checkCurrentUser, registerSessionExpiredCallback } from './services/api';
import { Colors } from './theme/colors';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Kiểm tra trạng thái đăng nhập khi ứng dụng khởi chạy
  useEffect(() => {
    // Đăng ký lắng nghe sự kiện hết hạn phiên đăng nhập từ Axios interceptor
    registerSessionExpiredCallback(() => {
      setUser(null);
      Alert.alert('Thông báo', 'Phiên đăng nhập của bạn đã hết hạn. Vui lòng đăng nhập lại!');
    });

    const checkLoginStatus = async () => {
      try {
        const cachedUser = await AsyncStorage.getItem('user_profile');
        if (cachedUser) {
          // Thử xác thực Token JWT với Server
          const result = await checkCurrentUser();
          if (result.success) {
            setUser(result.user);
          } else if (!result.isAuthError) {
            // Nếu không phải lỗi xác thực (ví dụ mất kết nối mạng), vẫn cho dùng offline cache
            setUser(JSON.parse(cachedUser));
          } else {
            // Nếu lỗi xác thực, dọn dẹp profile cục bộ (đã dọn dẹp token trong api interceptor)
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Lỗi khi đọc trạng thái đăng nhập cục bộ:', error);
      } finally {
        setLoading(false);
      }
    };

    checkLoginStatus();
  }, []);

  const handleLoginSuccess = (userProfile) => {
    setUser(userProfile);
  };

  const handleSwitchRole = async (targetRole) => {
    setLoading(true);
    try {
      const { switchRole } = require('./services/api');
      const res = await switchRole(targetRole);
      if (res.success) {
        setUser(res.user);
      } else {
        Alert.alert('Thông báo', res.message || 'Không thể chuyển đổi vai trò!');
      }
    } catch (err) {
      Alert.alert('Lỗi', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
    setUser(null);
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {user ? (
        user.role === 'inspector' || user.role === 'admin' ? (
          <InspectorNavigator user={user} onLogout={handleLogout} onSwitchRole={handleSwitchRole} />
        ) : user.role === 'lecturer' ? (
          <LecturerNavigator user={user} onLogout={handleLogout} onSwitchRole={handleSwitchRole} />
        ) : (
          <AppNavigator user={user} onLogout={handleLogout} />
        )
      ) : (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
