import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Thay đổi IP này phù hợp với địa chỉ IP LAN của máy chủ backend khi chạy Expo Go
const API_BASE_URL = 'https://wet-dolls-stay.loca.lt/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Bypass-Tunnel-Reminder': 'true',
    'bypass-tunnel-reminder': 'true',
    'User-Agent': 'TUAF-Schedule-App',
  },
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
export const getSchedule = async (forceSync = false, semester = null, schoolYear = null) => {
  try {
    let url = `/schedule?forceSync=${forceSync}`;
    if (semester) url += `&semester=${semester}`;
    if (schoolYear) url += `&schoolYear=${schoolYear}`;
    const response = await api.get(url);
    const data = response.data.data;
    
    // Cache dữ liệu cục bộ trên điện thoại để đọc offline
    const cacheKey = semester ? `cached_schedule_${semester}_${schoolYear}` : 'cached_schedule';
    await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    
    return { success: true, data, lastSyncedAt: response.data.lastSyncedAt, source: 'network' };
  } catch (error) {
    console.warn('Network error, loading offline schedule cache...');
    const cacheKey = semester ? `cached_schedule_${semester}_${schoolYear}` : 'cached_schedule';
    const cached = await AsyncStorage.getItem(cacheKey);
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
 * Lấy bảng điểm TẤT CẢ các kỳ, bao gồm GPA tích lũy
 */
export const getGradesAll = async () => {
  try {
    const response = await api.get('/grades/all');
    const { data, summary } = response.data;
    await AsyncStorage.setItem('cached_grades_all', JSON.stringify({ data, summary }));
    return { success: true, data, summary, source: 'network' };
  } catch (error) {
    const cached = await AsyncStorage.getItem('cached_grades_all');
    if (cached) {
      const parsed = JSON.parse(cached);
      return { success: true, ...parsed, source: 'cache' };
    }
    return { success: false, message: 'Lỗi tải bảng điểm tổng hợp!' };
  }
};

/**
 * Lấy lịch sử tài chính TẤT CẢ các kỳ
 */
export const getFinanceAll = async () => {
  try {
    const response = await api.get('/finance/all');
    const { data, summary } = response.data;
    await AsyncStorage.setItem('cached_finance_all', JSON.stringify({ data, summary }));
    return { success: true, data, summary, source: 'network' };
  } catch (error) {
    const cached = await AsyncStorage.getItem('cached_finance_all');
    if (cached) {
      const parsed = JSON.parse(cached);
      return { success: true, ...parsed, source: 'cache' };
    }
    return { success: false, message: 'Lỗi tải lịch sử tài chính!' };
  }
};

/**
 * Kích hoạt đồng bộ lịch sử toàn bộ các kỳ (có thể mất 20-40 giây)
 */
export const syncHistory = async () => {
  try {
    const response = await api.post('/sync-history', {}, { timeout: 120000 });
    return { success: true, ...response.data };
  } catch (error) {
    const msg = error.response?.data?.message || 'Lỗi đồng bộ lịch sử!';
    return { success: false, message: msg };
  }
};

/**
 * Lấy Khung Chương trình Đào tạo, merge với bảng điểm (status cho từng môn)
 */
export const getCurriculum = async () => {
  try {
    const response = await api.get('/curriculum');
    const { data, summary, source } = response.data;
    await AsyncStorage.setItem('cached_curriculum', JSON.stringify({ data, summary, source }));
    return { success: true, data, summary, source, networkSource: 'network' };
  } catch (error) {
    const cached = await AsyncStorage.getItem('cached_curriculum');
    if (cached) {
      const parsed = JSON.parse(cached);
      return { success: true, ...parsed, networkSource: 'cache' };
    }
    return { success: false, message: 'Lỗi tải chương trình đào tạo!' };
  }
};

/**
 * Lấy danh sách lớp phụ trách (dành cho Giảng viên)
 */
export const getLecturerClasses = async () => {
  try {
    const response = await api.get('/lecturer/classes');
    const { data, totalClasses } = response.data;
    await AsyncStorage.setItem('cached_lecturer_classes', JSON.stringify({ data, totalClasses }));
    return { success: true, data, totalClasses, source: 'network' };
  } catch (error) {
    const cached = await AsyncStorage.getItem('cached_lecturer_classes');
    if (cached) {
      const parsed = JSON.parse(cached);
      return { success: true, ...parsed, source: 'cache' };
    }
    return { success: false, message: 'Lỗi tải danh sách lớp!' };
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
  await AsyncStorage.removeItem('cached_grades_all');
  await AsyncStorage.removeItem('cached_finance_all');
  await AsyncStorage.removeItem('cached_curriculum');
  await AsyncStorage.removeItem('cached_lecturer_classes');
};

