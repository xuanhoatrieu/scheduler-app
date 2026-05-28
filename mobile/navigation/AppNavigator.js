import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import ExamsScreen from '../screens/ExamsScreen';
import FinanceScreen from '../screens/FinanceScreen';
import GradesScreen from '../screens/GradesScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import { Colors } from '../theme/colors';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Schedule: { active: 'calendar', inactive: 'calendar-outline' },
  Notifications: { active: 'notifications', inactive: 'notifications-outline' },
  Grades: { active: 'trophy', inactive: 'trophy-outline' },
  Finance: { active: 'wallet', inactive: 'wallet-outline' },
  Profile: { active: 'person-circle', inactive: 'person-circle-outline' },
};

export default function AppNavigator({ user, onLogout }) {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => {
            const iconName = focused
              ? TAB_ICONS[route.name].active
              : TAB_ICONS[route.name].inactive;
            return (
              <View style={focused ? styles.activeIconWrap : null}>
                <Ionicons name={iconName} size={focused ? 24 : 22} color={color} />
                {focused && <View style={styles.activeIndicator} />}
              </View>
            );
          },
          tabBarActiveTintColor: Colors.tabBarActive,
          tabBarInactiveTintColor: Colors.tabBarInactive,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarItemStyle: styles.tabBarItem,
        })}
      >
        <Tab.Screen
          name="Schedule"
          options={{ tabBarLabel: 'Lịch Học' }}
        >
          {(props) => <ScheduleScreen {...props} user={user} />}
        </Tab.Screen>
        <Tab.Screen
          name="Notifications"
          options={{ tabBarLabel: 'Thông Báo' }}
        >
          {(props) => <NotificationsScreen {...props} user={user} />}
        </Tab.Screen>
        <Tab.Screen
          name="Grades"
          options={{ tabBarLabel: 'Điểm Số' }}
        >
          {(props) => <GradesScreen {...props} user={user} />}
        </Tab.Screen>
        <Tab.Screen
          name="Finance"
          options={{ tabBarLabel: 'Học Phí' }}
        >
          {(props) => <FinanceScreen {...props} user={user} />}
        </Tab.Screen>
        <Tab.Screen
          name="Profile"
          options={{ tabBarLabel: 'Hồ Sơ' }}
        >
          {(props) => <ProfileScreen {...props} user={user} onLogout={onLogout} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBarBg,
    borderTopWidth: 0,
    elevation: 20,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    paddingTop: 8,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  tabBarItem: {
    paddingTop: 4,
  },
  activeIconWrap: {
    alignItems: 'center',
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.tabBarActive,
    marginTop: 2,
  },
});
