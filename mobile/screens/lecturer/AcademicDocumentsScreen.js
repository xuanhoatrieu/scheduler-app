import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
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

  // Trạng thái Document Preview Modal
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

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

  /**
   * Chuẩn hóa URL tuyệt đối từ fileUrl của tài liệu
   */
  const getFullFileUrl = (fileUrl) => {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      return fileUrl;
    }
    const cleanPath = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
    return `https://scheduler.tuaf.edu.vn${cleanPath}`;
  };

  /**
   * Mở xem trước tài liệu trực tiếp bên trong App
   */
  const handlePreview = (doc) => {
    if (!doc.fileUrl) {
      Alert.alert('Thông báo', 'Tài liệu không có đường dẫn tệp tin!');
      return;
    }

    const fullUrl = getFullFileUrl(doc.fileUrl);
    const fileType = (doc.fileType || '').toLowerCase();

    // Đối với file tài liệu (PDF, Word, Excel, PPT): dùng Google Docs Viewer nhúng
    // Đối với trang web trực tuyến: mở trực tiếp URL
    let viewerUrl = fullUrl;
    const isDocFile = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].some(ext =>
      fileType.includes(ext) || fullUrl.toLowerCase().endsWith(`.${ext}`)
    );

    if (isDocFile) {
      if (Platform.OS === 'android') {
        // Android WebView không có bộ dựng Word/Excel gốc -> Dùng Google Docs Viewer nhúng
        viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fullUrl)}&embedded=true`;
      } else {
        // iOS (WKWebView) hỗ trợ NATIVE 100% hiển thị file PDF, Word (.docx), Excel (.xlsx) trực tiếp!
        viewerUrl = fullUrl;
      }
    }

    setPreviewLoading(true);
    setPreviewDoc({
      ...doc,
      fullUrl,
      viewerUrl,
      isDocFile,
    });
  };

  /**
   * Tải tệp tin về thiết bị và kích hoạt hộp thoại lưu/chia sẻ
   */
  const handleDownload = async (doc) => {
    if (!doc.fileUrl) {
      Alert.alert('Thông báo', 'Tài liệu không có đường dẫn tệp tin!');
      return;
    }

    const fullUrl = getFullFileUrl(doc.fileUrl);
    setDownloadingId(doc.id);

    try {
      const ext = doc.fileType || 'pdf';
      const cleanName = (doc.fileName || `${doc.title}.${ext}`)
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const localUri = `${FileSystem.documentDirectory}${cleanName}`;

      // Tải tệp về bộ nhớ tạm của app
      const downloadResult = await FileSystem.downloadAsync(fullUrl, localUri);

      if (downloadResult.status === 200) {
        // Mở hộp thoại Chia sẻ / Lưu vào Tệp của hệ điều hành
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloadResult.uri, {
            dialogTitle: `Mở hoặc lưu: ${doc.title}`,
            mimeType: getMimeType(doc.fileType),
          });
        } else {
          Alert.alert('Thành công', `Đã tải về tệp tin: ${cleanName}`);
        }
      } else {
        // Fallback: Mở trình duyệt tải trực tiếp
        await Linking.openURL(fullUrl);
      }
    } catch (err) {
      console.warn('Lỗi download native:', err.message);
      try {
        await Linking.openURL(fullUrl);
      } catch (openErr) {
        Alert.alert('Lỗi', 'Không thể tải tệp tin: ' + err.message);
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const getMimeType = (fileType) => {
    const t = (fileType || '').toLowerCase();
    if (t.includes('pdf')) return 'application/pdf';
    if (t.includes('docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (t.includes('doc')) return 'application/msword';
    if (t.includes('xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (t.includes('xls')) return 'application/vnd.ms-excel';
    return 'application/octet-stream';
  };

  const getFileIcon = (fileType) => {
    const t = (fileType || '').toLowerCase();
    if (t.includes('pdf')) return { name: 'document-text', color: '#ef4444', label: 'PDF' };
    if (t.includes('doc')) return { name: 'document', color: '#2563eb', label: 'WORD' };
    if (t.includes('xls')) return { name: 'grid', color: '#16a34a', label: 'EXCEL' };
    return { name: 'attach', color: '#64748b', label: 'FILE' };
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

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
          <Text style={styles.loadingText}>Đang tải danh sách tài liệu...</Text>
        </View>
      ) : documents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Chưa có tài liệu phù hợp</Text>
          <Text style={styles.emptySubtitle}>Không tìm thấy biểu mẫu hoặc quy chế nào theo phân loại này.</Text>
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
            const isDownloading = downloadingId === item.id;

            return (
              <View style={styles.docCard}>
                {/* PHẦN THÔNG TIN TÀI LIỆU */}
                <TouchableOpacity
                  style={styles.docCardBody}
                  onPress={() => handlePreview(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconWrap, { backgroundColor: icon.color + '15' }]}>
                    <Ionicons name={icon.name} size={24} color={icon.color} />
                    <Text style={[styles.iconBadge, { color: icon.color }]}>{icon.label}</Text>
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
                </TouchableOpacity>

                {/* HÀNG NÚT THAO TÁC RÕ RÀNG: ĐỌC & TẢI VỀ */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionBtnRead}
                    onPress={() => handlePreview(item)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="eye-outline" size={16} color="#ffffff" />
                    <Text style={styles.actionBtnReadTxt}>Đọc biểu mẫu</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnDownload}
                    onPress={() => handleDownload(item)}
                    disabled={isDownloading}
                    activeOpacity={0.7}
                  >
                    {isDownloading ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="cloud-download-outline" size={16} color={Colors.primary} />
                        <Text style={styles.actionBtnDownloadTxt}>Tải về</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ── IN-APP DOCUMENT READER MODAL (TOÀN MÀN HÌNH TRONG APP) ── */}
      <Modal
        visible={!!previewDoc}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setPreviewDoc(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

          {/* THANH ĐIỀU HƯỚNG TRÌNH ĐỌC TÀI LIỆU */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setPreviewDoc(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {previewDoc?.title || 'Đọc tài liệu'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {previewDoc?.fileName || 'Xem trước trực tiếp'}
              </Text>
            </View>

            {/* CÁC NÚT TÁC VỤ PHỤ TRÊN HEADER */}
            <View style={styles.modalHeaderRight}>
              {previewDoc && (
                <TouchableOpacity
                  style={styles.modalIconBtn}
                  onPress={() => handleDownload(previewDoc)}
                  title="Tải về máy"
                >
                  <Ionicons name="cloud-download-outline" size={20} color={Colors.primary} />
                </TouchableOpacity>
              )}

              {previewDoc && (
                <TouchableOpacity
                  style={styles.modalIconBtn}
                  onPress={() => Linking.openURL(previewDoc.fullUrl)}
                  title="Mở bằng trình duyệt ngoài"
                >
                  <Ionicons name="open-outline" size={19} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* THÂN WEBVIEW ĐỌC VĂN BẢN TRỰC TIẾP */}
          <View style={styles.webViewWrap}>
            {previewDoc && (
              <WebView
                source={{ uri: previewDoc.viewerUrl }}
                style={styles.webView}
                startInLoadingState={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                scalesPageToFit={true}
                onLoadStart={() => setPreviewLoading(true)}
                onLoadEnd={() => setPreviewLoading(false)}
                renderLoading={() => (
                  <View style={styles.webLoadingOverlay}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.webLoadingTxt}>Đang nạp dữ liệu văn bản...</Text>
                  </View>
                )}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.warn('WebView error: ', nativeEvent);
                  setPreviewLoading(false);
                }}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>
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
  catChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  catChipTextActive: { color: '#ffffff', fontWeight: '700' },

  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: Colors.textSecondary },

  emptyCard: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  emptySubtitle: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  listContent: { padding: 16, gap: 12 },

  /* CARD TÀI LIỆU */
  docCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  docCardBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  iconBadge: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  docInfo: { flex: 1 },
  docTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, lineHeight: 20 },
  docDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, lineHeight: 16 },
  docMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' },
  docMetaTxt: { fontSize: 11, color: Colors.textMuted },
  metaDot: { fontSize: 11, color: Colors.textMuted, marginHorizontal: 6 },

  /* HÀNG NÚT THAO TÁC */
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionBtnRead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  actionBtnReadTxt: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  actionBtnDownload: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  actionBtnDownloadTxt: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },

  /* MODAL PREVIEW TOÀN MÀN HÌNH */
  modalContainer: { flex: 1, backgroundColor: '#ffffff' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: '#ffffff',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleWrap: { flex: 1, marginLeft: 12 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  modalSubtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  modalHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  webViewWrap: { flex: 1, backgroundColor: '#f8fafc', position: 'relative' },
  webView: { flex: 1, backgroundColor: '#ffffff' },
  webLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 10,
  },
  webLoadingTxt: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
});
