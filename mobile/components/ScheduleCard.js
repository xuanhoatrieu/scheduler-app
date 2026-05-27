import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const DAY_NAMES = {
  2: 'Thứ Hai',
  3: 'Thứ Ba',
  4: 'Thứ Tư',
  5: 'Thứ Năm',
  6: 'Thứ Sáu',
  7: 'Thứ Bảy',
  8: 'Chủ Nhật'
};

const DAY_COLORS = {
  2: '#3f51b5', // Indigo
  3: '#009688', // Teal
  4: '#ff9800', // Orange
  5: '#e91e63', // Pink
  6: '#4caf50', // Green
  7: '#9c27b0', // Purple
  8: '#f44336'  // Red
};

export default function ScheduleCard({ item }) {
  const dayColor = DAY_COLORS[item.dayOfWeek] || '#607d8b';
  const dayLabel = DAY_NAMES[item.dayOfWeek] || `Thứ ${item.dayOfWeek}`;

  return (
    <View style={styles.card}>
      {/* Cột thời gian bên trái */}
      <View style={[styles.timeColumn, { backgroundColor: dayColor + '15' }]}>
        <Text style={[styles.dayBadge, { color: dayColor }]}>{dayLabel}</Text>
        <View style={[styles.periodBadge, { backgroundColor: dayColor }]}>
          <Text style={styles.periodText}>{item.studyTime}</Text>
        </View>
        <Text style={styles.creditsText}>{item.credits} Tín chỉ</Text>
      </View>

      {/* Cột thông tin bên phải */}
      <View style={styles.infoColumn}>
        <Text style={styles.courseName} numberOfLines={2}>{item.courseName}</Text>
        
        {item.classCode ? (
          <Text style={styles.subText}>📄 Mã lớp: <Text style={styles.boldText}>{item.classCode}</Text></Text>
        ) : null}

        <View style={styles.row}>
          <View style={styles.detailItem}>
            <Text style={styles.icon}>📍</Text>
            <Text style={styles.detailText} numberOfLines={1}>{item.room || 'Phòng online/Chưa xếp'}</Text>
          </View>
        </View>

        {item.teacherName ? (
          <View style={styles.detailItem}>
            <Text style={styles.icon}>👨‍🏫</Text>
            <Text style={styles.detailText} numberOfLines={1}>{item.teacherName}</Text>
          </View>
        ) : null}

        {item.batch ? (
          <View style={styles.batchContainer}>
            <Text style={[styles.batchText, { color: dayColor }]}>{item.batch === 'Dothoc1' ? 'Đợt 1' : 'Đợt 2'}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    flexDirection: 'row',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  timeColumn: {
    width: 100,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#f9f9f9',
  },
  dayBadge: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  periodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 6,
  },
  periodText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  creditsText: {
    fontSize: 11,
    color: '#777',
    fontWeight: '500',
  },
  infoColumn: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  courseName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 6,
    lineHeight: 22,
  },
  subText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  boldText: {
    fontWeight: '600',
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginRight: 12,
  },
  icon: {
    fontSize: 12,
    marginRight: 4,
  },
  detailText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '400',
  },
  batchContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  batchText: {
    fontSize: 10,
    fontWeight: 'bold',
  }
});
