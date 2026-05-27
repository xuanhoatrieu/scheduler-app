import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const THEME = {
  primary:      '#0D7377',
  primaryLight: '#14BDCC',
  primaryBg:    '#E8F5F5',
  bg:           '#F0F4F8',
  card:         '#FFFFFF',
  text:         '#1E293B',
  textSecondary:'#64748B',
  textMuted:    '#94A3B8',
  border:       '#E2E8F0',
};

const SUBJECT_COLORS = [
  { bg:'#FFF0F0', text:'#C0392B', border:'#FECDD3', dot:'#E74C3C' },
  { bg:'#F0F4FF', text:'#1D4ED8', border:'#BFDBFE', dot:'#3B82F6' },
  { bg:'#F0FDF4', text:'#15803D', border:'#BBF7D0', dot:'#22C55E' },
  { bg:'#FFFBF0', text:'#B45309', border:'#FDE68A', dot:'#F59E0B' },
  { bg:'#FDF4FF', text:'#7C3AED', border:'#E9D5FF', dot:'#8B5CF6' },
  { bg:'#F0FDFA', text:'#0F766E', border:'#99F6E4', dot:'#14B8A6' },
];

// Thứ trong tuần theo thứ tự hiển thị
const DAYS      = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'];
const DAY_SHORT = ['T2',   'T3',   'T4',   'T5',   'T6',   'T7',   'CN'];

// Hôm nay là thứ mấy?
function todayIdx() {
  const d = new Date().getDay(); // 0=CN,1=T2,...6=T7
  return d === 0 ? 6 : d - 1;   // map về 0=T2..6=CN
}

// Gán màu cho môn học (nhất quán)
function colorForSubject(name, cache) {
  if (!cache[name]) {
    cache[name] = SUBJECT_COLORS[Object.keys(cache).length % SUBJECT_COLORS.length];
  }
  return cache[name];
}

export default function ScheduleScreen() {
  const { user, schedule, refreshSchedule } = useAuth();
  const [selDay,     setSelDay]     = useState(todayIdx());
  const [refreshing, setRefreshing] = useState(false);
  const colorCache = {};

  // Nhóm lịch học theo thứ
  const byDay = {};
  for (const item of schedule) {
    const key = item.thu;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(item);
  }

  const classes    = byDay[DAYS[selDay]] || [];
  const today      = todayIdx();
  const currentWeek = Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (7 * 86400000));

  // Tổng số môn + tín chỉ
  const allSubjects = [...new Set(schedule.map(s => s.monHoc))];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshSchedule?.();
    setRefreshing(false);
  }, []);

  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerGreeting}>
            {user ? `Xin chào, ${user.hoTen.split(' ').pop()}! 👋` : 'Xin chào! 👋'}
          </Text>
          <Text style={styles.headerTitle}>Lịch Học</Text>
        </View>
        <View style={styles.weekBadge}>
          <Ionicons name="calendar-outline" size={14} color={THEME.primary} />
          <Text style={styles.weekText}>Tuần {currentWeek}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{allSubjects.length}</Text>
          <Text style={styles.statLabel}>Môn học</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{schedule.length}</Text>
          <Text style={styles.statLabel}>Buổi/tuần</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{classes.length}</Text>
          <Text style={styles.statLabel}>Hôm nay</Text>
        </View>
      </View>

      {/* Day tabs */}
      <View style={styles.dayTabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
          {DAYS.map((day, idx) => {
            const isSelected = selDay === idx;
            const isToday    = idx === today;
            const count      = (byDay[day] || []).length;
            return (
              <TouchableOpacity
                key={day}
                style={[styles.dayTab, isSelected && styles.dayTabActive]}
                onPress={() => setSelDay(idx)}
              >
                <Text style={[styles.dayTabLabel, isSelected && styles.dayTabLabelActive]}>
                  {DAY_SHORT[idx]}
                </Text>
                {count > 0 ? (
                  <View style={[styles.dayTabDot, isSelected && styles.dayTabDotActive]}>
                    <Text style={[styles.dayTabDotText, isSelected && styles.dayTabDotTextActive]}>{count}</Text>
                  </View>
                ) : <View style={styles.dayTabEmpty} />}
                {isToday && <View style={styles.todayDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Danh sách lịch */}
      <ScrollView
        style={styles.scheduleList}
        contentContainerStyle={styles.scheduleListContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[THEME.primary]} tintColor={THEME.primary} />
        }
      >
        <Text style={styles.sectionTitle}>
          {DAYS[selDay]}
          {selDay === today && <Text style={styles.todayLabel}> — Hôm nay</Text>}
        </Text>

        {classes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cafe-outline" size={48} color={THEME.textMuted} />
            <Text style={styles.emptyTitle}>
              {schedule.length === 0 ? 'Không có dữ liệu lịch học' : 'Không có lịch học'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {schedule.length === 0
                ? 'Có thể chưa có lịch học kỳ này hoặc scrape chưa lấy được dữ liệu'
                : 'Tận hưởng ngày nghỉ! 🎉'}
            </Text>
          </View>
        ) : (
          classes.map((cls, i) => {
            const color = colorForSubject(cls.monHoc, colorCache);
            return (
              <View key={`${cls.monHoc}-${i}`} style={styles.classCard}>
                {/* Cột giờ */}
                <View style={styles.timeCol}>
                  <Text style={styles.timeStart}>{cls.start || cls.tiet?.split('-')[0] || '—'}</Text>
                  <View style={styles.timeLine} />
                  <Text style={styles.timeEnd}>{cls.end   || cls.tiet?.split('-')[1] || ''}</Text>
                </View>

                {/* Card môn */}
                <View style={[styles.classContent, { backgroundColor: color.bg, borderColor: color.border }]}>
                  <View style={styles.classHeader}>
                    <View style={[styles.colorDot, { backgroundColor: color.dot }]} />
                    <Text style={[styles.className, { color: color.text }]} numberOfLines={1}>
                      {cls.monHoc}
                    </Text>
                    {cls.nhom ? (
                      <View style={[styles.typeBadge, { backgroundColor: color.border }]}>
                        <Text style={[styles.typeBadgeText, { color: color.text }]}>{cls.nhom}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.classDetails}>
                    {!!cls.giangVien && (
                      <View style={styles.detailRow}>
                        <Ionicons name="person-outline"   size={13} color={THEME.textSecondary} />
                        <Text style={styles.detailText}>{cls.giangVien}</Text>
                      </View>
                    )}
                    {!!cls.phongHoc && (
                      <View style={styles.detailRow}>
                        <Ionicons name="location-outline" size={13} color={THEME.textSecondary} />
                        <Text style={styles.detailText}>{cls.phongHoc}</Text>
                      </View>
                    )}
                    {!!cls.tiet && (
                      <View style={styles.detailRow}>
                        <Ionicons name="time-outline"     size={13} color={THEME.textSecondary} />
                        <Text style={styles.detailText}>Tiết {cls.tiet}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  header: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:20, paddingTop:16, paddingBottom:12, backgroundColor:THEME.card,
  },
  headerGreeting: { fontSize:13, color:THEME.textSecondary, fontWeight:'500' },
  headerTitle:    { fontSize:24, fontWeight:'800', color:THEME.text, letterSpacing:-0.5 },
  weekBadge:      { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:THEME.primaryBg, paddingHorizontal:12, paddingVertical:7, borderRadius:20 },
  weekText:       { fontSize:12, fontWeight:'700', color:THEME.primary },

  statsRow: { flexDirection:'row', paddingHorizontal:16, paddingVertical:12, backgroundColor:THEME.card, gap:10, borderBottomWidth:1, borderBottomColor:THEME.border },
  statCard: { flex:1, backgroundColor:THEME.bg, borderRadius:12, paddingVertical:10, alignItems:'center' },
  statNum:  { fontSize:20, fontWeight:'800', color:THEME.primary },
  statLabel:{ fontSize:11, color:THEME.textSecondary, fontWeight:'500', marginTop:2 },

  dayTabsWrapper: { backgroundColor:THEME.card, paddingBottom:12, paddingTop:4 },
  dayTabs:        { paddingHorizontal:14, gap:6 },
  dayTab:         { alignItems:'center', paddingHorizontal:10, paddingVertical:8, borderRadius:14, minWidth:44, position:'relative' },
  dayTabActive:   { backgroundColor:THEME.primary },
  dayTabLabel:    { fontSize:12, fontWeight:'700', color:THEME.textSecondary },
  dayTabLabelActive:{ color:'#FFFFFF' },
  dayTabDot:      { marginTop:4, width:18, height:18, borderRadius:9, backgroundColor:THEME.border, justifyContent:'center', alignItems:'center' },
  dayTabDotActive:{ backgroundColor:'rgba(255,255,255,0.3)' },
  dayTabDotText:  { fontSize:10, fontWeight:'800', color:THEME.textSecondary },
  dayTabDotTextActive:{ color:'#FFFFFF' },
  dayTabEmpty:    { marginTop:4, width:18, height:18 },
  todayDot:       { position:'absolute', top:4, right:4, width:6, height:6, borderRadius:3, backgroundColor:'#F59E0B' },

  scheduleList:        { flex:1 },
  scheduleListContent: { paddingHorizontal:16, paddingTop:16 },
  sectionTitle:        { fontSize:16, fontWeight:'800', color:THEME.text, marginBottom:14 },
  todayLabel:          { fontSize:14, fontWeight:'600', color:THEME.primary },

  emptyState:    { alignItems:'center', paddingVertical:56, gap:10 },
  emptyTitle:    { fontSize:17, fontWeight:'700', color:THEME.textSecondary, textAlign:'center' },
  emptySubtitle: { fontSize:13, color:THEME.textMuted, textAlign:'center', paddingHorizontal:20 },

  classCard:    { flexDirection:'row', marginBottom:12, gap:12, alignItems:'stretch' },
  timeCol:      { width:44, alignItems:'center', paddingTop:4 },
  timeStart:    { fontSize:11, fontWeight:'700', color:THEME.textSecondary },
  timeLine:     { flex:1, width:1.5, backgroundColor:THEME.border, marginVertical:4, minHeight:24 },
  timeEnd:      { fontSize:11, fontWeight:'600', color:THEME.textMuted },

  classContent: { flex:1, borderRadius:16, borderWidth:1, padding:14, gap:10 },
  classHeader:  { flexDirection:'row', alignItems:'center', gap:8 },
  colorDot:     { width:8, height:8, borderRadius:4, flexShrink:0 },
  className:    { fontSize:15, fontWeight:'800', flex:1, letterSpacing:-0.2 },
  typeBadge:    { paddingHorizontal:8, paddingVertical:3, borderRadius:8 },
  typeBadgeText:{ fontSize:10, fontWeight:'700' },
  classDetails: { gap:5 },
  detailRow:    { flexDirection:'row', alignItems:'center', gap:6 },
  detailText:   { fontSize:13, color:THEME.textSecondary, fontWeight:'500', flex:1 },
});
