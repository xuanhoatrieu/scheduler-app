import React from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  SafeAreaView, TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const THEME = {
  primary:'#0D7377', primaryLight:'#14BDCC', primaryBg:'#E8F5F5',
  bg:'#F0F4F8', card:'#FFFFFF',
  text:'#1E293B', textSecondary:'#64748B', textMuted:'#94A3B8',
  border:'#E2E8F0', danger:'#EF4444',
};

export default function InfoScreen() {
  const { user, schedule, logout } = useAuth();

  const allSubjects = [...new Set(schedule.map(s => s.monHoc))];
  const allDays     = [...new Set(schedule.map(s => s.thu))];

  const initials = user?.hoTen
    ? user.hoTen.split(' ').filter(Boolean).slice(-2).map(w => w[0].toUpperCase()).join('')
    : 'SV';

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ]);
  };

  const sections = [
    {
      title: 'Thông Tin Sinh Viên',
      icon: 'person',
      items: [
        { label: 'Họ và tên',    value: user?.hoTen  || '—', icon: 'person-outline' },
        { label: 'Mã sinh viên', value: user?.maSV   || '—', icon: 'card-outline' },
        { label: 'Lớp',          value: user?.lop    || '—', icon: 'people-outline' },
        { label: 'Khoa',         value: user?.khoa   || '—', icon: 'school-outline' },
        { label: 'Ngành',        value: user?.nganh  || '—', icon: 'code-slash-outline' },
      ].filter(i => i.value !== '—' || ['Họ và tên','Mã sinh viên'].includes(i.label)),
    },
    {
      title: 'Lịch Học Hiện Tại',
      icon: 'calendar',
      items: [
        { label: 'Số môn học',   value: `${allSubjects.length} môn`,  icon: 'book-outline' },
        { label: 'Ngày học/tuần',value: `${allDays.length} ngày`,     icon: 'today-outline' },
        { label: 'Tổng buổi',    value: `${schedule.length} buổi`,    icon: 'calendar-outline' },
        { label: 'Cổng trường',  value: user?.portal || 'TUAF',       icon: 'globe-outline' },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.studentName}>{user?.hoTen || 'Sinh viên'}</Text>
          <Text style={styles.studentId}>
            {[user?.lop, user?.maSV].filter(Boolean).join(' • ') || ''}
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Ionicons name="school-outline" size={13} color={THEME.primary} />
              <Text style={styles.badgeText}>{user?.portal || 'TUAF'}</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="book-outline" size={13} color={THEME.primary} />
              <Text style={styles.badgeText}>{allSubjects.length} môn</Text>
            </View>
          </View>
        </View>

        {/* Sections */}
        <View style={styles.content}>
          {sections.map(sec => (
            <View key={sec.title} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name={`${sec.icon}-outline`} size={15} color={THEME.primary} />
                </View>
                <Text style={styles.sectionTitle}>{sec.title}</Text>
              </View>
              <View style={styles.sectionCard}>
                {sec.items.map((item, idx) => (
                  <View
                    key={item.label}
                    style={[styles.infoRow, idx < sec.items.length - 1 && styles.infoRowBorder]}
                  >
                    <View style={styles.infoLeft}>
                      <Ionicons name={item.icon} size={15} color={THEME.textMuted} />
                      <Text style={styles.infoLabel}>{item.label}</Text>
                    </View>
                    <Text style={styles.infoValue} numberOfLines={1}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* Nút đăng xuất */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={19} color={THEME.danger} />
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:THEME.bg },

  profileHeader: { backgroundColor:THEME.primary, alignItems:'center', paddingTop:32, paddingBottom:36, gap:6 },
  avatarRing:    { width:88, height:88, borderRadius:44, borderWidth:3, borderColor:'rgba(255,255,255,0.35)', justifyContent:'center', alignItems:'center', marginBottom:8 },
  avatar:        { width:76, height:76, borderRadius:38, backgroundColor:'rgba(255,255,255,0.2)', justifyContent:'center', alignItems:'center' },
  avatarText:    { fontSize:24, fontWeight:'800', color:'#fff', letterSpacing:1 },
  studentName:   { fontSize:21, fontWeight:'800', color:'#fff', letterSpacing:-0.3 },
  studentId:     { fontSize:13, color:'rgba(255,255,255,0.72)', fontWeight:'500' },
  badgeRow:      { flexDirection:'row', gap:8, marginTop:8 },
  badge:         { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'rgba(255,255,255,0.17)', paddingHorizontal:12, paddingVertical:6, borderRadius:20 },
  badgeText:     { fontSize:12, fontWeight:'700', color:'#fff' },

  content:    { padding:16, gap:16, marginTop:-14 },
  section:    { gap:8 },
  sectionHeader:   { flexDirection:'row', alignItems:'center', gap:8, paddingLeft:4 },
  sectionIconWrap: { width:28, height:28, borderRadius:8, backgroundColor:THEME.primaryBg, justifyContent:'center', alignItems:'center' },
  sectionTitle:    { fontSize:13, fontWeight:'800', color:THEME.text, letterSpacing:-0.1 },
  sectionCard:     { backgroundColor:THEME.card, borderRadius:16, overflow:'hidden', borderWidth:1, borderColor:THEME.border },

  infoRow:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:16, paddingVertical:13 },
  infoRowBorder: { borderBottomWidth:1, borderBottomColor:THEME.border },
  infoLeft:      { flexDirection:'row', alignItems:'center', gap:8 },
  infoLabel:     { fontSize:14, color:THEME.textSecondary, fontWeight:'500' },
  infoValue:     { fontSize:14, fontWeight:'700', color:THEME.text, maxWidth:'55%', textAlign:'right' },

  logoutBtn:  { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:THEME.card, borderRadius:16, padding:16, borderWidth:1.5, borderColor:'#FECACA' },
  logoutText: { fontSize:15, fontWeight:'700', color:THEME.danger },
});
