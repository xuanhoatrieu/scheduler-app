import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProfileScreen from '../screens/ProfileScreen';
import AttendanceScreen from '../screens/inspector/AttendanceScreen';
import InspectorDashboardScreen from '../screens/inspector/InspectorDashboardScreen';
import { Colors } from '../theme/colors';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Attendance: { active: 'clipboard', inactive: 'clipboard-outline' },
  Dashboard: { active: 'stats-chart', inactive: 'stats-chart-outline' },
  Profile: { active: 'person-circle', inactive: 'person-circle-outline' },
};

export default function InspectorNavigator({ user, onLogout, onSwitchRole }) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 8);
  const tabHeight = 56 + bottomPadding;

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
          tabBarStyle: [
            styles.tabBar,
            {
              height: tabHeight,
              paddingBottom: bottomPadding,
            },
          ],
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarItemStyle: styles.tabBarItem,
        })}
      >
        <Tab.Screen name="Attendance" options={{ tabBarLabel: 'Điểm Danh' }}>
          {(props) => <AttendanceScreen {...props} user={user} onSwitchRole={onSwitchRole} />}
        </Tab.Screen>
        <Tab.Screen name="Dashboard" options={{ tabBarLabel: 'Báo Cáo' }}>
          {(props) => <InspectorDashboardScreen {...props} user={user} onSwitchRole={onSwitchRole} />}
        </Tab.Screen>
        <Tab.Screen name="Profile" options={{ tabBarLabel: 'Hồ Sơ' }}>
          {(props) => <ProfileScreen {...props} user={user} onLogout={onLogout} onSwitchRole={onSwitchRole} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  activeIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIndicator: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.tabBarActive,
    marginTop: 2,
  },
  tabBar: {
    backgroundColor: Colors.tabBarBg,
    borderTopColor: Colors.borderLight,
    borderTopWidth: 1,
    paddingTop: 6,
    elevation: 8,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tabBarItem: {
    gap: 2,
  },
});
