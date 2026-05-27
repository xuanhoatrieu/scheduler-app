import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Thay đổi IP này phù hợp với địa chỉ IP LAN của máy chủ backend khi chạy Expo Go
const API_BASE_URL = 'http://10.0.2.2:5000/api'; // localhost trong Android Emulator

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Inject Bearer Token vào mọi request
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('jwt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Đăng nhập vào hệ thống cổng trường, lưu JWT & thông tin user cục bộ
 */
export const login = async (username, password, role) => {
  try {
    const response = await api.post('/auth/login', { username, password, role });
    const { token, user } = response.data;
    
    // Lưu Token và hồ sơ người dùng
    await AsyncStorage.setItem('jwt_token', token);
    await AsyncStorage.setItem('user_profile', JSON.stringify(user));
    
    return { success: true, user };
  } catch (error) {
    console.error('API login error:', error.response?.data || error.message);
    const msg = error.response?.data?.message || 'Không thể kết nối tới máy chủ!';
    return { success: false, message: msg };
  }
};

/**
 * Lấy thời khóa biểu học tập, tự động fallback đọc offline cache nếu có lỗi
 */
export const getSchedule = async (forceSync = false) => {
  try {
    const response = await api.get(`/schedule?forceSync=${forceSync}`);
    const data = response.data.data;
    
    // Cache dữ liệu cục bộ trên điện thoại để đọc offline
    await AsyncStorage.setItem('cached_schedule', JSON.stringify(data));
    
    return { success: true, data, lastSyncedAt: response.data.lastSyncedAt, source: 'network' };
  } catch (error) {
    console.warn('Network error, loading offline schedule cache...');
    const cached = await AsyncStorage.getItem('cached_schedule');
    if (cached) {
      return { success: true, data: JSON.parse(cached), source: 'cache' };
    }
    return { success: false, message: 'Lỗi mạng và không có dữ liệu lưu trữ offline!' };
  }
};

/**
 * Lấy lịch thi học kỳ, tự động offline cache
 */
export const getExams = async (forceSync = false) => {
  try {
    const response = await api.get(`/exams?forceSync=${forceSync}`);
    const data = response.data.data;
    await AsyncStorage.setItem('cached_exams', JSON.stringify(data));
    return { success: true, data, source: 'network' };
  } catch (error) {
    const cached = await AsyncStorage.getItem('cached_exams');
    if (cached) {
      return { success: true, data: JSON.parse(cached), source: 'cache' };
    }
    return { success: false, message: 'Lỗi tải lịch thi offline!' };
  }
};

/**
 * Lấy bảng điểm học tập, tự động offline cache
 */
export const getGrades = async (forceSync = false) => {
  try {
    const response = await api.get(`/grades?forceSync=${forceSync}`);
    const data = response.data.data;
    await AsyncStorage.setItem('cached_grades', JSON.stringify(data));
    return { success: true, data, source: 'network' };
  } catch (error) {
    const cached = await AsyncStorage.getItem('cached_grades');
    if (cached) {
      return { success: true, data: JSON.parse(cached), source: 'cache' };
    }
    return { success: false, message: 'Lỗi tải bảng điểm offline!' };
  }
};

/**
 * Lấy học phí công nợ tài chính, tự động offline cache
 */
export const getFinance = async (forceSync = false) => {
  try {
    const response = await api.get(`/finance?forceSync=${forceSync}`);
    const data = response.data.data;
    await AsyncStorage.setItem('cached_finance', JSON.stringify(data));
    return { success: true, data, source: 'network' };
  } catch (error) {
    const cached = await AsyncStorage.getItem('cached_finance');
    if (cached) {
      return { success: true, data: JSON.parse(cached), source: 'cache' };
    }
    return { success: false, message: 'Lỗi tải học phí offline!' };
  }
};

/**
 * Đăng xuất, xóa toàn bộ bộ nhớ cache & tokens
 */
export const logout = async () => {
  await AsyncStorage.removeItem('jwt_token');
  await AsyncStorage.removeItem('user_profile');
  await AsyncStorage.removeItem('cached_schedule');
  await AsyncStorage.removeItem('cached_exams');
  await AsyncStorage.removeItem('cached_grades');
  await AsyncStorage.removeItem('cached_finance');
};
