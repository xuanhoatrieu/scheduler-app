import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ClassListScreen from '../screens/lecturer/ClassListScreen';
import HomeroomScreen from '../screens/lecturer/HomeroomScreen';
import TeachingScheduleScreen from '../screens/lecturer/TeachingScheduleScreen';
import LecturerUtilitiesScreen from '../screens/lecturer/LecturerUtilitiesScreen';
import TeachingPaymentScreen from '../screens/lecturer/TeachingPaymentScreen';
import InspectorFeedbackScreen from '../screens/lecturer/InspectorFeedbackScreen';
import AcademicDocumentsScreen from '../screens/lecturer/AcademicDocumentsScreen';
import { Colors } from '../theme/colors';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  TeachingSchedule: { active: 'calendar', inactive: 'calendar-outline' },
  Utilities: { active: 'apps', inactive: 'apps-outline' },
  Homeroom: { active: 'school', inactive: 'school-outline' },
  Notifications: { active: 'notifications', inactive: 'notifications-outline' },
  Profile: { active: 'person-circle', inactive: 'person-circle-outline' },
};

function UtilitiesTab({ user }) {
  const [currentScreen, setCurrentScreen] = React.useState('hub');

  if (currentScreen === 'TeachingHistory') {
    return <ClassListScreen user={user} onBack={() => setCurrentScreen('hub')} />;
  }
  if (currentScreen === 'TeachingPayment') {
    return <TeachingPaymentScreen onBack={() => setCurrentScreen('hub')} />;
  }
  if (currentScreen === 'InspectorFeedback') {
    return <InspectorFeedbackScreen onBack={() => setCurrentScreen('hub')} />;
  }
  if (currentScreen === 'AcademicDocuments') {
    return <AcademicDocumentsScreen onBack={() => setCurrentScreen('hub')} />;
  }

  return (
    <LecturerUtilitiesScreen
      user={user}
      onNavigate={(screen) => setCurrentScreen(screen)}
    />
  );
}

export default function LecturerNavigator({ user, onLogout, onSwitchRole }) {
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
        <Tab.Screen
          name="TeachingSchedule"
          options={{ tabBarLabel: 'Lịch' }}
        >
          {(props) => <TeachingScheduleScreen {...props} user={user} onSwitchRole={onSwitchRole} />}
        </Tab.Screen>
        <Tab.Screen
          name="Utilities"
          options={{ tabBarLabel: 'Tiện ích' }}
        >
          {(props) => <UtilitiesTab {...props} user={user} />}
        </Tab.Screen>
        <Tab.Screen
          name="Homeroom"
          options={{ tabBarLabel: 'Chủ Nhiệm' }}
        >
          {(props) => <HomeroomScreen {...props} user={user} />}
        </Tab.Screen>
        <Tab.Screen
          name="Notifications"
          options={{ tabBarLabel: 'Thông Báo' }}
        >
          {(props) => <NotificationsScreen {...props} user={user} />}
        </Tab.Screen>
        <Tab.Screen
          name="Profile"
          options={{ tabBarLabel: 'Hồ Sơ' }}
        >
          {(props) => <ProfileScreen {...props} user={user} onLogout={onLogout} onSwitchRole={onSwitchRole} />}
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
