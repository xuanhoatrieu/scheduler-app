import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView,
  TouchableOpacity, Switch, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const THEME = {
  primary:'#0D7377', primaryBg:'#E8F5F5',
  bg:'#F0F4F8', card:'#FFFFFF',
  text:'#1E293B', textSecondary:'#64748B', textMuted:'#94A3B8',
  border:'#E2E8F0', danger:'#EF4444',
};

export default function SettingsScreen() {
  const { user, logout } = useAuth();

  const [notifications, setNotifications] = useState(true);
  const [remind15,      setRemind15]      = useState(true);
  const [darkMode,      setDarkMode]      = useState(false);
  const [weekStart,     setWeekStart]     = useState(false);

  const handleLogout = () =>
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ]);

  const sections = [
    {
      title: 'Tài Khoản',
      items: [
        {
          icon:'person-circle-outline', iconColor:'#0D7377', iconBg:'#E8F5F5',
          label: user?.hoTen || 'Sinh viên',
          sublabel: user?.maSV || '',
          type:'info',
        },
        {
          icon:'sync-outline', iconColor:'#22C55E', iconBg:'#F0FDF4',
          label:'Đồng bộ lịch học', type:'arrow',
          onPress: () => Alert.alert('Đồng bộ', 'Vui lòng đăng xuất và đăng nhập lại để cập nhật lịch mới nhất.'),
        },
      ],
    },
    {
      title: 'Thông Báo',
      items: [
        { icon:'notifications-outline', iconColor:'#8B5CF6', iconBg:'#F3F0FF', label:'Bật thông báo',    type:'toggle', value:notifications, onChange:setNotifications },
        { icon:'alarm-outline',         iconColor:'#F59E0B', iconBg:'#FFFBEB', label:'Nhắc trước 15 phút', type:'toggle', value:remind15,  onChange:setRemind15 },
      ],
    },
    {
      title: 'Giao Diện',
      items: [
        { icon:'moon-outline',     iconColor:'#64748B', iconBg:'#F1F5F9', label:'Chế độ tối',             type:'toggle', value:darkMode,   onChange:setDarkMode },
        { icon:'calendar-outline', iconColor:'#0D7377', iconBg:'#E8F5F5', label:'Tuần bắt đầu từ Thứ Hai', type:'toggle', value:weekStart, onChange:setWeekStart },
      ],
    },
    {
      title: 'Khác',
      items: [
        { icon:'information-circle-outline', iconColor:THEME.textSecondary, iconBg:THEME.bg, label:'Phiên bản', type:'info', value:'v1.0.0' },
        { icon:'log-out-outline',            iconColor:THEME.danger,        iconBg:'#FEF2F2', label:'Đăng xuất', type:'danger', onPress:handleLogout },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cài Đặt</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {sections.map(sec => (
          <View key={sec.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            <View style={styles.sectionCard}>
              {sec.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.row, idx < sec.items.length - 1 && styles.rowBorder]}
                  onPress={item.onPress}
                  disabled={item.type === 'toggle' || item.type === 'info' || !item.onPress}
                  activeOpacity={item.onPress ? 0.7 : 1}
                >
                  <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
                    <Ionicons name={item.icon} size={18} color={item.iconColor} />
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={[styles.rowLabel, item.type==='danger' && { color:THEME.danger }]}>
                      {item.label}
                    </Text>
                    {item.sublabel ? <Text style={styles.rowSublabel}>{item.sublabel}</Text> : null}
                  </View>
                  <View style={styles.rowRight}>
                    {item.type==='toggle' && (
                      <Switch
                        value={item.value}
                        onValueChange={item.onChange}
                        trackColor={{ false:THEME.border, true:THEME.primaryBg }}
                        thumbColor={item.value ? THEME.primary : '#FFFFFF'}
                        ios_backgroundColor={THEME.border}
                      />
                    )}
                    {item.type==='arrow'  && <Ionicons name="chevron-forward" size={18} color={THEME.textMuted} />}
                    {item.type==='info' && item.value && <Text style={styles.infoText}>{item.value}</Text>}
                    {item.type==='danger' && <Ionicons name="chevron-forward" size={18} color={THEME.danger} />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
        <View style={{ height:24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:THEME.bg },
  header:    { paddingHorizontal:20, paddingTop:16, paddingBottom:12, backgroundColor:THEME.card, borderBottomWidth:1, borderBottomColor:THEME.border },
  headerTitle:{ fontSize:24, fontWeight:'800', color:THEME.text, letterSpacing:-0.5 },
  content:   { padding:16, gap:20 },
  section:   { gap:8 },
  sectionTitle:{ fontSize:11, fontWeight:'700', color:THEME.textMuted, textTransform:'uppercase', letterSpacing:0.9, paddingLeft:4 },
  sectionCard: { backgroundColor:THEME.card, borderRadius:16, borderWidth:1, borderColor:THEME.border, overflow:'hidden' },
  row:         { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:13, gap:12 },
  rowBorder:   { borderBottomWidth:1, borderBottomColor:THEME.border },
  iconWrap:    { width:34, height:34, borderRadius:9, justifyContent:'center', alignItems:'center' },
  rowLabel:    { fontSize:14, fontWeight:'600', color:THEME.text },
  rowSublabel: { fontSize:12, color:THEME.textMuted, marginTop:1 },
  rowRight:    { alignItems:'flex-end' },
  infoText:    { fontSize:13, color:THEME.textMuted, fontWeight:'500' },
});
