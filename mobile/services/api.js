import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

// Địa chỉ máy chủ API production chính thức
const API_BASE_URL = 'https://scheduler.tuaf.edu.vn/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'User-Agent': 'TUAF-Schedule-App',
  },
});

// Biến lưu callback khi hết hạn phiên
let sessionExpiredCallback = null;

export const registerSessionExpiredCallback = (callback) => {
  sessionExpiredCallback = callback;
};

// Inject Bearer Token vào mọi request
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('jwt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor để tự động xử lý khi Token hết hạn (401 Unauthorized)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Chỉ kích hoạt popup hết hạn phiên đối với các request đang dùng Token, không áp dụng cho request đăng nhập (/auth/login)
    const isLoginRequest = error.config && error.config.url && error.config.url.includes('/auth/login');
    if (error.response && error.response.status === 401 && !isLoginRequest) {
      console.warn('⚠️ [API] Phiên đăng nhập hết hạn (401). Đang đăng xuất...');
      await logout();
      if (sessionExpiredCallback) {
        sessionExpiredCallback();
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Đăng nhập vào hệ thống cổng trường, lưu JWT & thông tin user cục bộ
 */
export const login = async (username, password, role) => {
  try {
    const response = await api.post('/auth/login', { username, password, role });
    const { token, user } = response.data;
    
    // Lưu Token bảo mật và hồ sơ người dùng cục bộ
    await SecureStore.setItemAsync('jwt_token', token);
    await AsyncStorage.setItem('user_profile', JSON.stringify(user));
    
    return { success: true, user };
  } catch (error) {
    console.error('API login error:', error.response?.data || error.message);
    const msg = error.response?.data?.message || 'Không thể kết nối tới máy chủ!';
    return { success: false, message: msg };
  }
};

/**
 * Chuyển đổi vai trò nhanh giữa Giảng viên và Thanh tra (Dual Role)
 */
export const switchRole = async (targetRole) => {
  try {
    const response = await api.post('/auth/switch-role', { targetRole });
    const { token, user } = response.data;

    await SecureStore.setItemAsync('jwt_token', token);
    await AsyncStorage.setItem('user_profile', JSON.stringify(user));
    await AsyncStorage.setItem('saved_role', user.role);

    return { success: true, user };
  } catch (error) {
    console.error('API switchRole error:', error.response?.data || error.message);
    const msg = error.response?.data?.message || 'Lỗi khi chuyển đổi vai trò!';
    return { success: false, message: msg };
  }
};

/**
 * Lấy danh sách các học kỳ có dữ liệu hoặc đang hoạt động
 */
export const getScheduleSemesters = async () => {
  try {
    const response = await api.get('/schedule/semesters');
    const data = response.data.data;
    if (response.data.success && data && data.length > 0) {
      await AsyncStorage.setItem('cached_schedule_semesters', JSON.stringify(data));
      return { success: true, data, source: 'network' };
    }
  } catch (error) {
    console.warn('Network error fetching schedule semesters, loading offline cache...');
  }
  const cached = await AsyncStorage.getItem('cached_schedule_semesters');
  if (cached) {
    return { success: true, data: JSON.parse(cached), source: 'cache' };
  }
  return { success: false, data: [] };
};

/**
 * Lấy thời khóa biểu học tập, tự động fallback đọc offline cache nếu có lỗi
 */
export const getSchedule = async (forceSync = false, semester = null, schoolYear = null, trainingSystem = 'DHCQ') => {
  const sys = String(trainingSystem || 'DHCQ').toUpperCase();
  const cacheKey = semester ? `cached_schedule_${semester}_${schoolYear}_${sys}` : `cached_schedule_${sys}`;
  try {
    let url = `/schedule?forceSync=${forceSync}`;
    if (semester) url += `&semester=${semester}`;
    if (schoolYear) url += `&schoolYear=${schoolYear}`;
    if (sys) url += `&heDaoTao=${sys}`;
    const response = await api.get(url);
    const data = response.data.data;
    
    // Cache dữ liệu cục bộ trên điện thoại để đọc offline theo từng hệ đào tạo
    await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    
    return { success: true, data, lastSyncedAt: response.data.lastSyncedAt, source: 'network' };
  } catch (error) {
    console.warn('Network error, loading offline schedule cache...');
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
export const getExams = async (forceSync = false, semester = null, schoolYear = null, trainingSystem = 'DHCQ') => {
  const sys = String(trainingSystem || 'DHCQ').toUpperCase();
  const cacheKey = semester && schoolYear ? `cached_exams_${semester}_${schoolYear}_${sys}` : `cached_exams_${sys}`;
  try {
    let url = `/exams?forceSync=${forceSync}`;
    if (semester && schoolYear) {
      url += `&semester=${semester}&schoolYear=${schoolYear}`;
    }
    if (sys) {
      url += `&heDaoTao=${sys}`;
    }
    const response = await api.get(url);
    const data = response.data.data;
    if (Array.isArray(data)) {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    }
    return { success: true, data, source: 'network' };
  } catch (error) {
    const cached = await AsyncStorage.getItem(cacheKey);
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
export const getGradesAll = async (forceSync = false) => {
  try {
    const response = await api.get(`/grades/all${forceSync ? '?force=true' : ''}`);
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
 * Lấy danh sách tin tức / thông báo chính thức từ Nhà trường
 */
export const getNews = async () => {
  try {
    const response = await api.get('/news');
    const { data } = response.data;
    await AsyncStorage.setItem('cached_school_news', JSON.stringify(data));
    return { success: true, data, source: 'network' };
  } catch (error) {
    const cached = await AsyncStorage.getItem('cached_school_news');
    if (cached) {
      return { success: true, data: JSON.parse(cached), source: 'cache' };
    }
    return { success: false, message: 'Không thể tải tin tức nhà trường!' };
  }
};

/**
 * Lấy chi tiết 1 bài tin tức
 */
export const getNewsDetail = async (id) => {
  try {
    const response = await api.get(`/news/${id}`);
    return { success: true, data: response.data.data };
  } catch (error) {
    return { success: false, message: 'Lỗi tải chi tiết bài viết!' };
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
export const getCurriculum = async (forceSync = false) => {
  try {
    const response = await api.get(`/curriculum${forceSync ? '?force=true' : ''}`);
    const { data, summary, source, graduationRequirements, byBlock, bySemester } = response.data;
    await AsyncStorage.setItem('cached_curriculum', JSON.stringify({ data, summary, source, graduationRequirements, byBlock, bySemester }));
    return { success: true, data, summary, graduationRequirements, byBlock, bySemester, source, networkSource: 'network' };
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
 * Lanh tai khoan Inspector - lay danh sach lop hom nay
 */
export const getInspectorToday = async () => {
  try {
    const response = await api.get('/inspector/attendance/today');
    return { success: true, data: response.data.data, date: response.data.date, dayOfWeek: response.data.dayOfWeek };
  } catch (error) {
    console.error('[API] getInspectorToday error:', error.response?.data || error.message);
    return { success: false, message: error.response?.data?.message || 'Loi tai danh sach lop hom nay!' };
  }
};

/**
 * Ghi nhan diem danh (gio den/ve) cho mot lop
 */
export const submitAttendance = async (data) => {
  try {
    const response = await api.post('/inspector/attendance', data);
    return { success: true, data: response.data.data, message: response.data.message };
  } catch (error) {
    console.error('[API] submitAttendance error:', error.response?.data || error.message);
    return { success: false, message: error.response?.data?.message || 'Loi ghi nhan diem danh!' };
  }
};

/**
 * Lay bao cao diem danh theo khoang ngay
 */
export const getAttendanceReport = async (params) => {
  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await api.get(`/inspector/attendance/report?${queryString}`);
    return { success: true, ...response.data };
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Loi tai bao cao!' };
  }
};

/**
 * Lay tong quan diem danh hom nay (dashboard)
 */
export const getDashboardToday = async () => {
  try {
    const response = await api.get('/inspector/dashboard/today');
    return { success: true, ...response.data };
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Loi tai dashboard!' };
  }
};

/**
 * Lay bao cao chi tiet theo khoang thoi gian (tuần/tháng/kỳ)
 */
export const getDashboardReport = async (params) => {
  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await api.get(`/inspector/dashboard/report?${queryString}`);
    return { success: true, ...response.data };
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Loi tai bao cao!' };
  }
};

/**
 * Lấy danh sách sinh viên của lớp tín chỉ
 */
export const getClassStudents = async (idLopTc) => {
  try {
    const response = await api.get(`/lecturer/classes/${idLopTc}/students`);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải danh sách sinh viên!' };
  }
};

/**
 * Lấy bảng điểm danh buổi học đã lưu
 */
export const getSessionAttendance = async (scheduleId, date) => {
  try {
    const response = await api.get(`/lecturer/attendance?scheduleId=${scheduleId}&date=${date}`);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải điểm danh buổi học!' };
  }
};

/**
 * Lưu điểm danh sinh viên buổi học
 */
export const submitSessionAttendance = async (payload) => {
  try {
    const response = await api.post('/lecturer/attendance', payload);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể lưu điểm danh!' };
  }
};

/**
 * Lấy danh sách lớp chủ nhiệm (GVCN)
 */
export const getHomeroomClasses = async (schoolYear = null) => {
  try {
    const url = schoolYear ? `/lecturer/homeroom/classes?schoolYear=${schoolYear}` : '/lecturer/homeroom/classes';
    const response = await api.get(url);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải danh sách lớp chủ nhiệm!' };
  }
};

/**
 * Theo dõi đăng ký học lớp chủ nhiệm
 */
export const getHomeroomRegistration = async (idLop, semester = 1, schoolYear = '2026-2027') => {
  try {
    const response = await api.get(`/lecturer/homeroom/${idLop}/course-registration?semester=${semester}&schoolYear=${schoolYear}`);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải dữ liệu đăng ký học!' };
  }
};

/**
 * Theo dõi công nợ học phí lớp chủ nhiệm
 */
export const getHomeroomTuition = async (idLop, semester = 1, schoolYear = '2026-2027') => {
  try {
    const response = await api.get(`/lecturer/homeroom/${idLop}/tuition?semester=${semester}&schoolYear=${schoolYear}`);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải dữ liệu học phí!' };
  }
};

/**
 * Lấy danh sách thông báo điểm danh từ GV học phần gửi cho GVCN
 */
export const getHomeroomAlerts = async () => {
  try {
    const response = await api.get('/lecturer/homeroom/alerts');
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải thông báo!' };
  }
};

/**
 * Đánh dấu thông báo GVCN đã đọc
 */
export const markHomeroomAlertRead = async (id) => {
  try {
    const response = await api.put(`/lecturer/homeroom/alerts/${id}/read`);
    return response.data;
  } catch (error) {
    return { success: false };
  }
};

/**
 * Lấy danh sách lớp thanh tra theo ngày bất kỳ
 */
export const getInspectorClassesByDate = async (dateStr) => {
  try {
    const response = await api.get(`/inspector/attendance/classes?date=${dateStr}`);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải danh sách lớp!' };
  }
};

/**
 * Gửi email báo cáo thanh tra theo yêu cầu
 */
export const sendInspectorEmailReport = async (payload) => {
  try {
    const response = await api.post('/inspector/reports/send-email', payload);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể gửi email báo cáo!' };
  }
};

/**
 * Lấy dữ liệu thanh toán giờ giảng / duyệt tiền giảng của Giảng viên
 */
export const getTeachingPayment = async (params = {}) => {
  try {
    const response = await api.get('/lecturer/teaching-payment', { params });
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải thanh toán giờ giảng!' };
  }
};

/**
 * Lấy nhật ký các buổi học bị Thanh tra ghi nhận lỗi của Giảng viên
 */
export const getInspectorLogs = async (params = {}) => {
  try {
    const response = await api.get('/lecturer/inspector-logs', { params });
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải phản hồi thanh tra!' };
  }
};

/**
 * Gửi giải trình cho sự kiện thanh tra
 */
export const submitInspectorExplanation = async (id, data) => {
  try {
    const response = await api.post(`/lecturer/inspector-logs/${id}/explanation`, data);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể gửi giải trình!' };
  }
};

/**
 * Lấy danh sách biểu mẫu, quy chế nhà trường
 */
export const getAcademicDocuments = async (params = {}) => {
  try {
    const response = await api.get('/documents', { params });
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải danh sách biểu mẫu quy chế!' };
  }
};

/**
 * Kiểm tra token JWT hiện tại với backend và đồng bộ lại thông tin user mới nhất
 */
export const checkCurrentUser = async () => {
  try {
    const response = await api.get('/auth/me');
    const { user } = response.data;
    await AsyncStorage.setItem('user_profile', JSON.stringify(user));
    return { success: true, user };
  } catch (error) {
    console.error('❌ [API] checkCurrentUser error:', error.response?.data || error.message);
    const isAuthError = error.response && error.response.status === 401;
    return { 
      success: false, 
      isAuthError,
      message: error.response?.data?.message || 'Phiên làm việc hết hạn!' 
    };
  }
};

/**
 * Đăng xuất, xóa toàn bộ bộ nhớ cache & tokens
 */
export const logout = async () => {
  try {
    await SecureStore.deleteItemAsync('jwt_token');
  } catch (e) {
    // Key may not exist — ignore
  }
  const keys = [
    'user_profile', 'cached_schedule', 'cached_exams', 'cached_grades',
    'cached_finance', 'cached_grades_all', 'cached_finance_all',
    'cached_curriculum', 'cached_lecturer_classes', 'cached_inspector_today',
  ];
  await AsyncStorage.multiRemove(keys);
};

