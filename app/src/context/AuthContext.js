import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, DEMO_DATA } from '../services/api';

const AuthContext = createContext(null);

const STORAGE_KEY_USER     = '@lichhoc:user';
const STORAGE_KEY_SCHEDULE = '@lichhoc:schedule';

export function AuthProvider({ children }) {
  const [user,     setUser]     = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [booting,  setBooting]  = useState(true); // khởi động app
  const [error,    setError]    = useState('');

  // Khôi phục session đã lưu khi mở app
  useEffect(() => {
    (async () => {
      try {
        const [u, s] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_USER),
          AsyncStorage.getItem(STORAGE_KEY_SCHEDULE),
        ]);
        if (u) { setUser(JSON.parse(u)); setSchedule(s ? JSON.parse(s) : []); }
      } catch (_) {}
      finally { setBooting(false); }
    })();
  }, []);

  /**
   * @param {string}  portalId  - 'tuaf' | ...
   * @param {string}  maSV
   * @param {string}  matKhau
   * @param {boolean} useDemo   - dùng dữ liệu mẫu
   */
  const login = async (portalId, maSV, matKhau, useDemo = false) => {
    setLoading(true);
    setError('');
    try {
      let data;
      if (useDemo) {
        await new Promise(r => setTimeout(r, 1000));
        data = { success: true, ...DEMO_DATA };
      } else {
        const res = await fetch(`${API_BASE_URL}/api/login`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ portalId, maSV, matKhau }),
        });
        data = await res.json();
      }

      if (!data.success) { setError(data.message || 'Đăng nhập thất bại'); return false; }

      const u = { ...data.studentInfo, portalId };
      setUser(u);
      setSchedule(data.schedule);

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEY_USER,     JSON.stringify(u)),
        AsyncStorage.setItem(STORAGE_KEY_SCHEDULE, JSON.stringify(data.schedule)),
      ]);
      return true;
    } catch (err) {
      setError(err.message || 'Không kết nối được server. Kiểm tra API_BASE_URL trong services/api.js');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setUser(null);
    setSchedule([]);
    await AsyncStorage.multiRemove([STORAGE_KEY_USER, STORAGE_KEY_SCHEDULE]);
  };

  // Làm mới lịch học (pull-to-refresh)
  const refreshSchedule = async () => {
    if (!user || !user.portalId) return;
    // Chỉ gọi lại nếu không phải demo
    // (demo không có mật khẩu nên bỏ qua — người dùng cần đăng nhập lại)
  };

  return (
    <AuthContext.Provider value={{ user, schedule, loading, booting, error, login, logout, refreshSchedule }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
