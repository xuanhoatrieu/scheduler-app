import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './navigation/AppNavigator';
import InspectorNavigator from './navigation/InspectorNavigator';
import LecturerNavigator from './navigation/LecturerNavigator';
import LoginScreen from './screens/LoginScreen';
import { logout, checkCurrentUser, registerSessionExpiredCallback } from './services/api';
// Đăng ký tác vụ nền nhận push ẩn (PHẢI nạp sớm, ở module scope)
import './services/backgroundSync';
import {
  clearAllNotifications,
  getActiveOwner,
  initNotifications,
  isAnnouncementTapFor,
  ownerKeyOf,
  requestNotificationPermissions,
  setActiveOwner,
} from './services/notificationService';
import { openSchoolInbox } from './navigation/navigationRef';
import { registerPushForOwner, reportSyncedIfPush, retryPendingUnregister } from './services/pushRegistration';
import { setReminderUser, syncReminders, wasPlannedFor } from './services/reminderSync';
import { Colors } from './theme/colors';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Khởi tạo kênh thông báo hệ thống và kiểm tra trạng thái đăng nhập
  useEffect(() => {
    try {
      initNotifications().catch((e) => console.warn('⚠️ Lỗi initNotifications:', e.message));
      requestNotificationPermissions().catch((e) => console.warn('⚠️ Lỗi requestNotificationPermissions:', e.message));
    } catch (e) {
      console.warn('⚠️ Lỗi khởi tạo thông báo:', e.message);
    }

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

  // Gắn thông báo với ĐÚNG tài khoản đang đăng nhập.
  // Đổi tài khoản / đổi vai trò → xóa sạch thông báo cũ rồi lập lại theo tài khoản mới.
  const ownerKey = ownerKeyOf(user);
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      if (!ownerKey) {
        setReminderUser(null);
        // Không có ai đăng nhập → không được còn thông báo nào (kể cả do bản app cũ để lại)
        await clearAllNotifications();
        // Lần đăng xuất trước mất mạng → gỡ token khỏi server ngay khi có thể
        retryPendingUnregister();
        return;
      }
      await setActiveOwner(ownerKey);
      if (cancelled) return;
      setReminderUser(user);
      syncReminders({ force: true });
      // Nhận push từ server (điểm mới, cập nhật lịch nhắc hằng đêm) cho ĐÚNG tài khoản này
      registerPushForOwner(ownerKey).then((ok) => {
        if (ok && wasPlannedFor(ownerKey)) reportSyncedIfPush(ownerKey).catch(() => {});
      });
    })().catch((e) => console.warn('⚠️ Lỗi gắn thông báo theo tài khoản:', e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, loading]);

  // Mở lại app từ nền → cập nhật lại lịch nhắc (tối đa mỗi 30 phút)
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        syncReminders();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // Bấm vào một thông báo (bản tin sáng, điểm mới...) → cập nhật lại lịch nhắc ngay.
  // Thông báo Nhà trường gửi cho ĐÚNG tài khoản này → mở hộp thư "Nhà Trường".
  useEffect(() => {
    let sub = null;
    try {
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        if (isAnnouncementTapFor(response, getActiveOwner())) {
          openSchoolInbox();
          return;
        }
        syncReminders({ force: true });
      });
    } catch (e) {
      // môi trường không hỗ trợ
    }
    return () => sub && sub.remove();
  }, []);

  const handleLoginSuccess = (userProfile) => {
    setUser(userProfile);
  };

  const handleSwitchRole = async (targetRole) => {
    setLoading(true);
    try {
      // Xóa thông báo của vai trò hiện tại trước khi đổi token sang vai trò mới
      await clearAllNotifications();
      setReminderUser(null);
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
