import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getAcademicDocuments } from '../../services/api';
import { Colors } from '../../theme/colors';

const CATEGORIES = [
  { key: 'all', label: 'Tất cả' },
  { key: 'daotao', label: 'Đào tạo' },
  { key: 'khaothi', label: 'Khảo thí' },
  { key: 'bieumau', label: 'Biểu mẫu' },
  { key: 'nckh', label: 'NCKH & Dự án' },
  { key: 'khac', label: 'Khác' },
];

export default function AcademicDocumentsScreen({ navigation, onBack }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const res = await getAcademicDocuments({
        category: selectedCategory,
        search: searchQuery,
      });
      if (res && res.success) {
        setDocuments(res.data || []);
      }
    } catch (err) {
      console.error('Lỗi tải biểu mẫu:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleBack = () => {
    if (onBack) onBack();
    else if (navigation?.goBack) navigation.goBack();
  };

  const handleOpenFile = async (doc) => {
    if (!doc.fileUrl) {
      Alert.alert('Thông báo', 'Tài liệu không có đường dẫn tệp tin!');
      return;
    }

    let url = doc.fileUrl;
    if (url.startsWith('/')) {
      url = `https://scheduler.tuaf.edu.vn${url}`;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Không thể mở', 'Không tìm thấy ứng dụng phù hợp để mở tệp tin này!');
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể mở liên kết tài liệu: ' + e.message);
    }
  };

  const getFileIcon = (fileType) => {
    const t = (fileType || '').toLowerCase();
    if (t.includes('pdf')) return { name: 'document-text', color: '#ef4444' };
    if (t.includes('doc')) return { name: 'document', color: '#2563eb' };
    if (t.includes('xls')) return { name: 'grid', color: '#16a34a' };
    return { name: 'attach', color: '#64748b' };
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Biểu Mẫu & Quy Chế</Text>
          <Text style={styles.headerSubtitle}>Văn bản, hướng dẫn & biểu mẫu chuẩn TUAF</Text>
        </View>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm theo tên biểu mẫu, quy chế..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* CATEGORY CHIPS */}
      <View style={styles.catScrollWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.catContainer}
          renderItem={({ item }) => {
            const isSelected = selectedCategory === item.key;
            return (
              <TouchableOpacity
                style={[styles.catChip, isSelected && styles.catChipActive]}
                onPress={() => setSelectedCategory(item.key)}
              >
                <Text style={[styles.catChipText, isSelected && styles.catChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* DOCUMENT LIST */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải biểu mẫu & quy chế...</Text>
        </View>
      ) : documents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Chưa có tài liệu phù hợp</Text>
          <Text style={styles.emptySubtitle}>Không tìm thấy biểu mẫu hoặc quy chế nào theo từ khóa này.</Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
          renderItem={({ item }) => {
            const icon = getFileIcon(item.fileType);
            const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('vi-VN') : '';

            return (
              <TouchableOpacity
                style={styles.docCard}
                onPress={() => handleOpenFile(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: icon.color + '15' }]}>
                  <Ionicons name={icon.name} size={24} color={icon.color} />
                </View>

                <View style={styles.docInfo}>
                  <Text style={styles.docTitle} numberOfLines={2}>{item.title}</Text>
                  {item.description ? (
                    <Text style={styles.docDesc} numberOfLines={2}>{item.description}</Text>
                  ) : null}
                  <View style={styles.docMeta}>
                    <Text style={styles.docMetaTxt}>{item.fileSize || 'N/A'}</Text>
                    <Text style={styles.metaDot}>•</Text>
                    <Text style={styles.docMetaTxt}>{item.uploadedBy || 'TUAF'}</Text>
                    {dateStr ? (
                      <>
                        <Text style={styles.metaDot}>•</Text>
                        <Text style={styles.docMetaTxt}>{dateStr}</Text>
                      </>
                    ) : null}
                  </View>
                </View>

                <View style={styles.downloadIconWrap}>
                  <Ionicons name="cloud-download-outline" size={20} color={Colors.primary} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { marginLeft: 12, flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  searchWrap: { backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 8 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  catScrollWrap: { backgroundColor: Colors.surface, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  catContainer: { paddingHorizontal: 16, gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f1f5f9' },
  catChipActive: { backgroundColor: Colors.primary },
  catChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  catChipTextActive: { color: '#fff', fontWeight: '700' },
  listContent: { padding: 16, paddingBottom: 40 },
  loadingBox: { padding: 40, alignItems: 'center' },
  loadingText: { marginTop: 10, fontSize: 13, color: Colors.textSecondary },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    margin: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: { flex: 1 },
  docTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, lineHeight: 19 },
  docDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 16 },
  docMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  docMetaTxt: { fontSize: 11, color: Colors.textMuted },
  metaDot: { fontSize: 11, color: Colors.textMuted, marginHorizontal: 4 },
  downloadIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
