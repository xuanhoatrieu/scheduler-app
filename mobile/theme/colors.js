/**
 * Design System – Color Tokens cho TUAF Schedule App
 * Lấy cảm hứng từ banking apps hiện đại + màu xanh lá nhận diện TUAF
 */

export const Colors = {
  // Primary Palette (TUAF Green)
  primary: '#1B5E20',
  primaryLight: '#2E7D32',
  primarySoft: '#4CAF50',
  primaryMuted: '#81C784',
  primaryBg: '#E8F5E9',

  // Surface & Background
  background: '#F0F4F0',
  surface: '#FFFFFF',
  surfaceElevated: '#FAFCFA',

  // Text
  textPrimary: '#1A1A2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  // Accent
  accentBlue: '#3B82F6',
  accentPurple: '#8B5CF6',
  accentOrange: '#F59E0B',
  accentPink: '#EC4899',

  // Semantic
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',
  info: '#0EA5E9',

  // Grade Colors
  gradeA: '#059669',
  gradeB: '#3B82F6',
  gradeC: '#F59E0B',
  gradeD: '#F97316',
  gradeF: '#DC2626',

  // Day of Week Colors
  dayMon: '#3B82F6',
  dayTue: '#8B5CF6',
  dayWed: '#F59E0B',
  dayThu: '#EC4899',
  dayFri: '#059669',
  daySat: '#6366F1',
  daySun: '#EF4444',

  // Borders & Dividers
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  divider: '#E2E8F0',

  // Shadows
  shadowColor: '#000000',

  // Tab bar
  tabBarBg: '#FFFFFF',
  tabBarActive: '#1B5E20',
  tabBarInactive: '#9CA3AF',
};

/**
 * Lấy màu cho điểm chữ
 */
export const getGradeColor = (letterGrade) => {
  if (!letterGrade) return Colors.textMuted;
  const grade = letterGrade.toUpperCase();
  if (grade.startsWith('A')) return Colors.gradeA;
  if (grade.startsWith('B')) return Colors.gradeB;
  if (grade.startsWith('C')) return Colors.gradeC;
  if (grade.startsWith('D')) return Colors.gradeD;
  return Colors.gradeF;
};

/**
 * Lấy màu cho ngày trong tuần
 */
export const getDayColor = (dayOfWeek) => {
  const map = {
    2: Colors.dayMon,
    3: Colors.dayTue,
    4: Colors.dayWed,
    5: Colors.dayThu,
    6: Colors.dayFri,
    7: Colors.daySat,
    8: Colors.daySun,
  };
  return map[dayOfWeek] || Colors.textMuted;
};
