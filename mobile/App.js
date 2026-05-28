import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import AppNavigator from './navigation/AppNavigator';
import LecturerNavigator from './navigation/LecturerNavigator';
import LoginScreen from './screens/LoginScreen';
import { logout } from './services/api';
import { Colors } from './theme/colors';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Kiểm tra trạng thái đăng nhập khi ứng dụng khởi chạy
  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const cachedUser = await AsyncStorage.getItem('user_profile');
        if (cachedUser) {
          setUser(JSON.parse(cachedUser));
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

  const handleLogout = async () => {
    setLoading(true);
    await logout();
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
    <>
      <StatusBar style="dark" />
      {user ? (
        user.role === 'lecturer' ? (
          <LecturerNavigator user={user} onLogout={handleLogout} />
        ) : (
          <AppNavigator user={user} onLogout={handleLogout} />
        )
      ) : (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      )}
    </>
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
