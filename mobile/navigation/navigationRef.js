import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * Ref điều hướng dùng chung cho AppNavigator (SV) và LecturerNavigator (GV)
 * để mở tab Thông báo khi người dùng bấm vào push của Nhà trường.
 */
export const navigationRef = createNavigationContainerRef();

const TARGET = 'Notifications';
let pending = null;

const canOpen = () => {
  if (!navigationRef.isReady()) return false;
  const state = navigationRef.getRootState();
  return !!(state && Array.isArray(state.routeNames) && state.routeNames.includes(TARGET));
};

/** Mở mục "Nhà Trường" trong tab Thông báo (chờ tới khi điều hướng sẵn sàng nếu app vừa mở) */
export const openSchoolInbox = () => {
  const params = { tab: 'school', at: Date.now() };
  if (canOpen()) {
    navigationRef.navigate(TARGET, params);
    pending = null;
  } else {
    pending = params;
  }
};

/** Gọi trong onReady của NavigationContainer */
export const flushPendingNavigation = () => {
  if (pending && canOpen()) {
    navigationRef.navigate(TARGET, pending);
    pending = null;
  }
};
