import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import FinanceBreakdown from '../components/FinanceBreakdown';
import { getFinanceAll, syncHistory } from '../services/api';
import { Colors } from '../theme/colors';

export default function FinanceScreen({ user }) {
  const [financeData, setFinanceData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadData = async () => {
    try {
      const res = await getFinanceAll();
      if (res.success) {
        setFinanceData(res.data || []);
        setSummary(res.summary || null);
      }
    } catch (err) {
      console.warn('Error loading finance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSyncHistory = async () => {
    setSyncing(true);
    try {
      const res = await syncHistory();
      if (res.success) {
        await loadData();
      }
    } catch (err) {
      console.warn('Sync finance failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải thông tin học phí...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Học Phí</Text>
          <Text style={styles.headerSubtitle}>Tài chính, miễn giảm & hoàn trả</Text>
        </View>

        <TouchableOpacity
          style={[styles.syncBtn, syncing && { opacity: 0.6 }]}
          onPress={handleSyncHistory}
          disabled={syncing}
        >
          <Ionicons
            name="sync-outline"
            size={18}
            color="#fff"
            style={syncing ? styles.spinIcon : null}
          />
          <Text style={styles.syncBtnText}>{syncing ? 'Đang đồng bộ...' : 'Cập nhật'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
      >
        {/* Tổng quan toàn khóa + lịch sử theo học kỳ (dùng chung với màn chi tiết của GVCN) */}
        <FinanceBreakdown financeData={financeData} summary={summary} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: Colors.textSecondary },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  syncBtnText: { color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 4 },
});
