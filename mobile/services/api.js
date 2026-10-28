import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { clearAllNotifications } from './notificationService';

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
 * Lấy danh sách thí sinh của ca thi (ưu tiên theo phòng thi, fallback theo lớp tín chỉ)
 */
export const getExamCandidates = async (idDotThiPhong, idLopTc) => {
  try {
    const params = new URLSearchParams();
    if (idDotThiPhong) params.append('idDotThiPhong', idDotThiPhong);
    if (idLopTc) params.append('idLopTc', idLopTc);
    const response = await api.get(`/lecturer/exams/candidates?${params.toString()}`);
    return response.data;
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Không thể tải danh sách thí sinh ca thi!'
    };
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
 * Chi tiết học phí từng kỳ + phiếu thu của 1 sinh viên lớp chủ nhiệm.
 * KHÔNG lưu vào bộ nhớ máy (dữ liệu tài chính của người khác).
 */
export const getHomeroomStudentTuition = async (idLop, studentCode) => {
  try {
    const response = await api.get(
      `/lecturer/homeroom/${encodeURIComponent(idLop)}/students/${encodeURIComponent(studentCode)}/tuition`
    );
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải chi tiết học phí sinh viên!' };
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
 * Lấy danh sách phòng thi / ca thi theo ngày cho Thanh tra
 */
export const getInspectorExamsByDate = async (dateStr) => {
  try {
    const response = await api.get(`/inspector/exams?date=${encodeURIComponent(dateStr)}`);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải lịch thi thanh tra!' };
  }
};

/**
 * Ghi nhận trạng thái kiểm tra Phòng thi & Cán bộ coi thi
 */
export const submitInspectorExamRoomStatus = async (payload) => {
  try {
    const response = await api.post('/inspector/exams/room-status', payload);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể lưu trạng thái phòng thi!' };
  }
};

/**
 * Lấy danh sách thí sinh phòng thi kèm biên bản vi phạm (dành cho Thanh tra)
 */
export const getInspectorExamCandidates = async ({ idDotThiPhong, idPhongThi, examDate, roomKey } = {}) => {
  try {
    const params = new URLSearchParams();
    if (idDotThiPhong) params.append('idDotThiPhong', idDotThiPhong);
    if (idPhongThi) params.append('idPhongThi', idPhongThi);
    if (examDate) params.append('examDate', examDate);
    if (roomKey) params.append('roomKey', roomKey);
    const response = await api.get(`/inspector/exams/candidates?${params.toString()}`);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể tải danh sách thí sinh phòng thi!' };
  }
};

/**
 * Lập mới hoặc cập nhật biên bản vi phạm quy chế thi của thí sinh
 */
export const submitInspectorExamViolation = async (payload) => {
  try {
    const response = await api.post('/inspector/exams/violation', payload);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể lưu biên bản vi phạm thi!' };
  }
};

/**
 * Xóa biên bản vi phạm quy chế thi
 */
export const deleteInspectorExamViolation = async (id) => {
  try {
    const response = await api.delete(`/inspector/exams/violation/${encodeURIComponent(id)}`);
    return response.data;
  } catch (error) {
    return { success: false, message: error.response?.data?.message || 'Không thể xóa biên bản vi phạm thi!' };
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

// ═══════════════════════════════════════
// PUSH NOTIFICATION (Expo Push Token)
// ═══════════════════════════════════════

/** Khóa lưu trạng thái push trên máy */
export const PUSH_KEYS = {
  token: 'push_token_v1', // Expo Push Token của máy (không bí mật)
  owner: 'push_owner_v1', // tài khoản (username|role) mà server đang gắn với token này
  unregisterPending: 'push_unregister_pending_v1', // gỡ token lúc đăng xuất bị lỗi mạng → thử lại sau
};

/** Gắn token của máy với tài khoản đang đăng nhập */
export const registerPushDevice = async (token, platform) => {
  try {
    await api.post('/devices/register', { token, platform });
    return { success: true };
  } catch (error) {
    console.warn('⚠️ [API] Không đăng ký được push:', error.response?.status || error.message);
    return { success: false };
  }
};

/** Gỡ token khỏi server (không cần phiên còn hạn) */
export const unregisterPushDevice = async (token) => {
  try {
    await api.post('/devices/unregister', { token }, { timeout: 8000 });
    return { success: true };
  } catch (error) {
    return { success: false };
  }
};

/** Báo server: máy đã lập lại lịch nhắc local thành công */
export const reportRemindersSynced = async (token) => {
  try {
    await api.post('/devices/synced', { token }, { timeout: 10000 });
    return { success: true };
  } catch (error) {
    return { success: false };
  }
};

// ═══════════════════════════════════════
// THÔNG BÁO TỪ NHÀ TRƯỜNG (Admin gửi)
// Không lưu cache trên máy: hộp thư là dữ liệu riêng của từng tài khoản.
// ═══════════════════════════════════════

/** Hộp thư thông báo của tài khoản đang đăng nhập */
export const getAnnouncements = async () => {
  try {
    const response = await api.get('/announcements', { params: { limit: 50 } });
    const { data, unread } = response.data || {};
    return { success: true, data: Array.isArray(data) ? data : [], unread: Number(unread) || 0 };
  } catch (error) {
    return { success: false, data: [], unread: 0 };
  }
};

/** Đánh dấu một thông báo đã đọc */
export const markAnnouncementRead = async (id) => {
  try {
    await api.post(`/announcements/${encodeURIComponent(id)}/read`);
    return { success: true };
  } catch (error) {
    return { success: false };
  }
};

// ═══════════════════════════════════════
// PHÂN HỆ HÀNH CHÍNH MỘT CỬA SỐ (ONE-STOP SERVICE)
// ═══════════════════════════════════════

/** Lấy danh sách thủ tục Một cửa đang mở */
export const getOneStopServices = async () => {
  try {
    const response = await api.get('/services');
    const data = response.data?.data || [];
    await AsyncStorage.setItem('cached_onestop_services', JSON.stringify(data));
    return { success: true, data, source: 'network' };
  } catch (error) {
    const cached = await AsyncStorage.getItem('cached_onestop_services');
    if (cached) {
      return { success: true, data: JSON.parse(cached), source: 'cache' };
    }
    return {
      success: false,
      data: [],
      message: error.response?.data?.message || 'Lỗi tải danh mục thủ tục Một cửa!',
    };
  }
};

/** Sinh viên nộp hồ sơ thủ tục Một cửa mới */
export const createOneStopRequest = async (payload) => {
  try {
    const response = await api.post('/services/requests', payload, { timeout: 60000 });
    return {
      success: true,
      data: response.data?.data,
      message: response.data?.message || 'Nộp hồ sơ thành công!',
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Lỗi gửi hồ sơ Một cửa!',
    };
  }
};

/** Lấy danh sách hồ sơ Một cửa của sinh viên đang đăng nhập */
export const getMyOneStopRequests = async (status = '') => {
  try {
    const response = await api.get('/services/my-requests', {
      params: status ? { status } : {},
    });
    const data = response.data?.data || [];
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      data: [],
      message: error.response?.data?.message || 'Lỗi tải lịch sử hồ sơ!',
    };
  }
};

/** Xem chi tiết 1 hồ sơ Một cửa */
export const getOneStopRequestDetail = async (id) => {
  try {
    const response = await api.get(`/services/requests/${id}`);
    return { success: true, data: response.data?.data };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Lỗi tải chi tiết hồ sơ!',
    };
  }
};

/** Sinh viên tải lên ảnh biên lai VietQR hoặc bổ sung minh chứng */
export const uploadOneStopReceipt = async (id, payload) => {
  try {
    const response = await api.post(`/services/requests/${id}/upload-receipt`, payload, {
      timeout: 60000,
    });
    return {
      success: true,
      data: response.data?.data,
      message: response.data?.message || 'Đã tải lên thành công!',
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Lỗi tải lên biên lai / minh chứng!',
    };
  }
};

/** Sinh viên hủy yêu cầu khi chưa xử lý */
export const cancelOneStopRequest = async (id, reason = '') => {
  try {
    const response = await api.post(`/services/requests/${id}/cancel`, { reason });
    return {
      success: true,
      data: response.data?.data,
      message: response.data?.message || 'Đã hủy yêu cầu!',
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Không thể hủy hồ sơ!',
    };
  }
};

/** Sinh viên đánh giá chất lượng phục vụ (1-5 sao) */
export const rateOneStopRequest = async (id, payload) => {
  try {
    const response = await api.post(`/services/requests/${id}/rate`, payload);
    return {
      success: true,
      data: response.data?.data,
      message: response.data?.message || 'Cảm ơn bạn đã đánh giá!',
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Lỗi gửi đánh giá!',
    };
  }
};

/** Cán bộ / Giảng viên: Kiểm tra xem tài khoản hiện tại có được Admin phân công phụ trách thủ tục Một cửa nào không */
export const getMyOneStopStaffRole = async () => {
  try {
    const response = await api.get('/services/staff/my-role');
    return {
      success: true,
      isAssignedStaff: Boolean(response.data?.isAssignedStaff),
      assignedServices: response.data?.assignedServices || [],
      pendingCount: Number(response.data?.pendingCount) || 0,
    };
  } catch (_error) {
    return {
      success: false,
      isAssignedStaff: false,
      assignedServices: [],
      pendingCount: 0,
    };
  }
};

/** Giáo viên chủ nhiệm (GVCN): Lấy danh sách hồ sơ Một cửa của sinh viên lớp chủ nhiệm */
export const getHomeroomOneStopRequests = async (idLop) => {
  try {
    const response = await api.get(`/services/homeroom/${idLop}/requests`);
    return {
      success: true,
      data: response.data?.data || [],
      className: response.data?.className || '',
      classCode: response.data?.classCode || '',
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      message: error.response?.data?.message || 'Không thể tải danh sách hồ sơ Một cửa của lớp!',
    };
  }
};

/** Giáo viên chủ nhiệm (GVCN): Ghi ý kiến xác nhận / nhận xét vào hồ sơ Một cửa của sinh viên lớp mình */
export const submitHomeroomOneStopNote = async (idLop, requestId, homeroomNote) => {
  try {
    const response = await api.post(`/services/homeroom/${idLop}/requests/${requestId}/note`, {
      homeroomNote,
    });
    return {
      success: true,
      data: response.data?.data,
      message: response.data?.message || 'Đã lưu ý kiến Giáo viên chủ nhiệm!',
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Lỗi lưu ý kiến Giáo viên chủ nhiệm!',
    };
  }
};

/** Cán bộ / Chuyên viên: Lấy danh sách hồ sơ cần xử lý trên App */
export const getStaffOneStopRequests = async (params = {}) => {
  try {
    const response = await api.get('/services/staff/requests', { params });
    return {
      success: true,
      data: response.data?.data || [],
      stats: response.data?.stats || {},
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      stats: {},
      message: error.response?.data?.message || 'Lỗi tải danh sách hồ sơ Một cửa!',
    };
  }
};

/** Cán bộ: Xác nhận biên lai lệ phí hợp lệ */
export const confirmOneStopPayment = async (id, note = '') => {
  try {
    const response = await api.post(`/services/staff/requests/${id}/confirm-payment`, { note });
    return {
      success: true,
      data: response.data?.data,
      message: response.data?.message || 'Đã xác nhận lệ phí!',
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Lỗi xác nhận lệ phí!',
    };
  }
};

/** Cán bộ: Từ chối biên lai lệ phí */
export const rejectOneStopPayment = async (id, reason) => {
  try {
    const response = await api.post(`/services/staff/requests/${id}/reject-payment`, { reason });
    return {
      success: true,
      data: response.data?.data,
      message: response.data?.message || 'Đã yêu cầu tải lại biên lai!',
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Lỗi từ chối biên lai!',
    };
  }
};

/** Cán bộ: Cập nhật tiến độ xử lý & giải trình quá hạn SLA */
export const processOneStopRequest = async (id, payload) => {
  try {
    const response = await api.patch(`/services/staff/requests/${id}/process`, payload);
    return {
      success: true,
      data: response.data?.data,
      message: response.data?.message || 'Đã cập nhật tiến độ hồ sơ!',
    };
  } catch (error) {
    return {
      success: false,
      code: error.response?.data?.code,
      message: error.response?.data?.message || 'Lỗi xử lý hồ sơ!',
    };
  }
};

/** Cán bộ: Giải trình nguyên nhân quá hạn SLA */
export const explainOneStopOverdue = async (id, payload) => {
  try {
    const response = await api.post(`/services/staff/requests/${id}/explain-overdue`, payload);
    return {
      success: true,
      data: response.data?.data,
      message: response.data?.message || 'Đã lưu giải trình quá hạn!',
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Lỗi lưu giải trình quá hạn!',
    };
  }
};

/** Cán bộ: Bàn giao bản giấy tại quầy bằng mã QR / mã hồ sơ */
export const handoverOneStopRequest = async (idOrScan, payload = {}) => {
  try {
    const response = await api.post(`/services/staff/requests/${idOrScan}/handover`, payload);
    return {
      success: true,
      data: response.data?.data,
      message: response.data?.message || 'Đã bàn giao bản giấy thành công!',
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Lỗi bàn giao bản giấy!',
    };
  }
};

/**
 * Đăng xuất, xóa toàn bộ bộ nhớ cache & tokens
 */
export const logout = async () => {
  // 0. Gỡ token push khỏi server TRƯỚC khi xóa JWT → server không còn gửi thông báo của
  //    tài khoản này tới máy. Lỗi mạng → ghi nhớ để thử lại (App.js) khi chưa ai đăng nhập.
  try {
    const pushToken = await AsyncStorage.getItem(PUSH_KEYS.token);
    await AsyncStorage.removeItem(PUSH_KEYS.owner);
    if (pushToken) {
      const res = await unregisterPushDevice(pushToken);
      if (!res.success) await AsyncStorage.setItem(PUSH_KEYS.unregisterPending, pushToken);
    }
  } catch (e) {
    console.warn('⚠️ Lỗi gỡ push khi đăng xuất:', e.message);
  }

  // 1. Hủy toàn bộ thông báo (hẹn giờ + đã hiển thị + badge) của tài khoản đang đăng xuất
  try {
    await clearAllNotifications();
  } catch (e) {
    console.warn('⚠️ Lỗi xóa thông báo khi đăng xuất:', e.message);
  }

  try {
    await SecureStore.deleteItemAsync('jwt_token');
  } catch (e) {
    // Key may not exist — ignore
  }

  // 2. Xóa MỌI bộ nhớ đệm dữ liệu cá nhân. Cache lưu theo tên động
  //    (cached_schedule_1_2026_DHCQ, cached_exams_..._ALL, ...) nên phải xóa theo tiền tố,
  //    nếu không tài khoản sau sẽ đọc được lịch của tài khoản trước khi mất mạng.
  const fixedKeys = ['user_profile'];
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith('cached_'));
    await AsyncStorage.multiRemove([...fixedKeys, ...cacheKeys]);
  } catch (e) {
    await AsyncStorage.multiRemove(fixedKeys).catch(() => {});
  }
};

