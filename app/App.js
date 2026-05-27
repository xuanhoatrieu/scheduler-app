import { registerRootComponent } from 'expo';
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen    from './src/screens/LoginScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import InfoScreen     from './src/screens/InfoScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const THEME_COLOR   = '#0D7377';
const INACTIVE_COLOR = '#94A3B8';

// ── Tab navigator (sau đăng nhập) ──────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   THEME_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle:      styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color }) => {
          const icons = {
            'Lịch Học':  focused ? 'calendar'        : 'calendar-outline',
            'Thông Tin': focused ? 'person-circle'   : 'person-circle-outline',
            'Cài Đặt':   focused ? 'settings'        : 'settings-outline',
          };
          return (
            <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
              <Ionicons name={icons[route.name]} size={22} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Lịch Học"  component={ScheduleScreen} />
      <Tab.Screen name="Thông Tin" component={InfoScreen} />
      <Tab.Screen name="Cài Đặt"  component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// ── Root navigator — chọn Login hay Main ───────
function RootNavigator() {
  const { user, booting } = useAuth();

  // Đang khôi phục session → màn chờ
  if (booting) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={THEME_COLOR} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {user
        ? <Stack.Screen name="Main"  component={MainTabs} />
        : <Stack.Screen name="Login" component={LoginScreen} />
      }
    </Stack.Navigator>
  );
}

// ── App root ────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 72,
    paddingBottom: 12,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0,
    elevation: 20,
    shadowColor: '#0D7377',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  iconContainer: {
    width: 40, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  iconContainerActive: { backgroundColor: '#E8F5F5' },
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
});

registerRootComponent(App);
