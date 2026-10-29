import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  cancelOneStopRequest,
  createOneStopRequest,
  getMyOneStopRequests,
  getOneStopServices,
  rateOneStopRequest,
  uploadOneStopReceipt,
} from '../services/api';
import { Colors } from '../theme/colors';

const STATUS_META = {
  pending_payment: { label: 'Chờ nộp lệ phí', bg: '#fef3c7', color: '#92400e', icon: 'card-outline' },
  payment_review: { label: 'Chờ đối soát phí', bg: '#dbeafe', color: '#1e40af', icon: 'time-outline' },
  submitted: { label: 'Đã tiếp nhận', bg: '#e0f2fe', color: '#0369a1', icon: 'paper-plane-outline' },
  processing: { label: 'Đang xử lý', bg: '#ede9fe', color: '#5b21b6', icon: 'sync-outline' },
  need_more_info: { label: 'Cần bổ sung HS', bg: '#ffedd5', color: '#c2410c', icon: 'alert-circle-outline' },
  ready_for_pickup: { label: 'Sẵn sàng nhận KQ', bg: '#dcfce7', color: '#15803d', icon: 'qr-code-outline' },
  completed: { label: 'Đã hoàn thành', bg: '#dcfce7', color: '#166534', icon: 'checkmark-circle-outline' },
  rejected: { label: 'Từ chối', bg: '#fee2e2', color: '#b91c1c', icon: 'close-circle-outline' },
  cancelled: { label: 'Đã hủy', bg: '#f1f5f9', color: '#64748b', icon: 'ban-outline' },
};

const DELIVERY_LABELS = {
  digital_pdf: '📄 Bản điện tử PDF có QR xác thực (Nhận ngay trên App)',
  digital: '📄 Bản điện tử PDF có QR xác thực (Nhận ngay trên App)',
  office_pickup: '🏢 Nhận bản giấy trực tiếp',
  physical_pickup: '🏢 Nhận bản giấy trực tiếp',
  postal_delivery: '📮 Gửi thư bảo đảm qua Bưu điện về tận nhà',
};

const normalizeDeliveryKey = (key) => {
  if (key === 'digital') return 'digital_pdf';
  if (key === 'physical_pickup') return 'office_pickup';
  return key;
};

// Ảnh biên lai mẫu 1x1 PNG hợp lệ khi SV xác nhận đã chuyển khoản trực tuyến kèm mã giao dịch
const DEFAULT_RECEIPT_PLACEHOLDER_B64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export default function OneStopServiceScreen({ user }) {
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'my_requests'
  const [services, setServices] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // State cho Modal Đăng ký thủ tục
  const [selectedService, setSelectedService] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [deliveryMethod, setDeliveryMethod] = useState('digital_pdf');
  const [postalAddress, setPostalAddress] = useState('');
  const [dbContact, setDbContact] = useState({
    phone: user?.phone || '',
    email: user?.email || '',
    className: user?.className || '',
  });
  const [studentPhone, setStudentPhone] = useState(user?.phone || '');
  const [studentEmail, setStudentEmail] = useState(user?.email || '');
  const [extraNote, setExtraNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // State cho Modal Chi tiết Hồ sơ của tôi
  const [detailRequest, setDetailRequest] = useState(null);
  const [receiptNote, setReceiptNote] = useState('');
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [srvRes, reqRes] = await Promise.all([
        getOneStopServices(),
        getMyOneStopRequests(),
      ]);
      if (srvRes.success) setServices(srvRes.data || []);
      const reqList = reqRes.success ? reqRes.data || [] : [];
      if (reqRes.success) setMyRequests(reqList);

      const resolvedPhone =
        srvRes?.studentContact?.phone ||
        reqRes?.studentContact?.phone ||
        reqList[0]?.studentPhone ||
        user?.phone ||
        '';
      const resolvedEmail =
        srvRes?.studentContact?.email ||
        reqRes?.studentContact?.email ||
        reqList[0]?.studentEmail ||
        user?.email ||
        '';
      const resolvedClass =
        srvRes?.studentContact?.className ||
        reqRes?.studentContact?.className ||
        user?.className ||
        '';

      setDbContact({
        phone: resolvedPhone,
        email: resolvedEmail,
        className: resolvedClass,
      });
      setStudentPhone((prev) => prev || resolvedPhone);
      setStudentEmail((prev) => prev || resolvedEmail);
    } finally {
      setLoading(false);
    }
  }, [user?.phone, user?.email, user?.className]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openApplyModal = (srv) => {
    setSelectedService(srv);
    const defaults = {};
    const validSchemaFields = (srv.formSchema || []).filter(
      (f) => (f?.name || f?.key) !== 'graduationYear'
    );
    for (const f of validSchemaFields) {
      const fName = f.name || f.key;
      if (!fName) continue;
      if (f.defaultValue !== undefined) {
        defaults[fName] = String(f.defaultValue);
      } else if (f.type === 'select' && Array.isArray(f.options) && f.options[0]) {
        defaults[fName] = f.options[0];
      } else {
        defaults[fName] = '';
      }
    }
    setFormValues(defaults);
    if (!studentPhone && dbContact.phone) setStudentPhone(dbContact.phone);
    if (!studentEmail && dbContact.email) setStudentEmail(dbContact.email);
    const allowedDeliv = Array.isArray(srv.deliveryOptions)
      ? srv.deliveryOptions.map(normalizeDeliveryKey)
      : ['digital_pdf', 'office_pickup'];
    setDeliveryMethod(allowedDeliv[0] || 'digital_pdf');
    setPostalAddress('');
    setExtraNote('');
  };

  const handleCreateRequest = async () => {
    if (!selectedService) return;
    setSubmitting(true);
    try {
      const payload = {
        serviceId: selectedService.id,
        formData: {
          ...formValues,
          ...(extraNote.trim() ? { extraNote: extraNote.trim() } : {}),
        },
        deliveryMethod,
        postalAddress: deliveryMethod === 'postal_delivery' ? postalAddress.trim() : '',
        studentPhone: studentPhone.trim(),
        studentEmail: studentEmail.trim(),
      };

      const res = await createOneStopRequest(payload);
      if (!res.success) {
        Alert.alert('Chưa thể nộp hồ sơ', res.message);
        return;
      }

      setSelectedService(null);
      await loadData();
      setActiveTab('my_requests');
      if (res.data) {
        setDetailRequest(res.data);
      }
      Alert.alert('Thành công', res.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmTransferReceipt = async () => {
    if (!detailRequest) return;
    if (!receiptNote.trim()) {
      Alert.alert(
        'Nhập thông tin biên lai',
        'Vui lòng nhập Mã giao dịch ngân hàng / Thời gian chuyển khoản hoặc nội dung xác nhận để cán bộ đối soát!'
      );
      return;
    }
    setActionLoading(true);
    try {
      const res = await uploadOneStopReceipt(detailRequest.id, {
        receiptBase64: DEFAULT_RECEIPT_PLACEHOLDER_B64,
        note: receiptNote.trim(),
      });
      if (!res.success) {
        Alert.alert('Lỗi', res.message);
        return;
      }
      setDetailRequest(res.data);
      setReceiptNote('');
      await loadData();
      Alert.alert('Đã gửi xác nhận lệ phí', res.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSupplementInfo = async () => {
    if (!detailRequest) return;
    if (!receiptNote.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập nội dung giải trình / thông tin bổ sung!');
      return;
    }
    setActionLoading(true);
    try {
      const res = await uploadOneStopReceipt(detailRequest.id, {
        note: receiptNote.trim(),
      });
      if (!res.success) {
        Alert.alert('Lỗi', res.message);
        return;
      }
      setDetailRequest(res.data);
      setReceiptNote('');
      await loadData();
      Alert.alert('Đã gửi bổ sung', res.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async (reqItem) => {
    setActionLoading(true);
    try {
      const res = await cancelOneStopRequest(reqItem.id, 'Sinh viên chủ động hủy trên ứng dụng');
      if (!res.success) {
        Alert.alert('Không thể hủy', res.message);
        return;
      }
      setDetailRequest(null);
      await loadData();
      Alert.alert('Đã hủy', res.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRateService = async () => {
    if (!detailRequest) return;
    setActionLoading(true);
    try {
      const res = await rateOneStopRequest(detailRequest.id, {
        rating: ratingStars,
        ratingCriteria: {
          speed: ratingStars,
          attitude: ratingStars,
          clarity: ratingStars,
        },
        ratingComment: ratingComment.trim(),
      });
      if (!res.success) {
        Alert.alert('Lỗi', res.message);
        return;
      }
      setDetailRequest(res.data);
      await loadData();
      Alert.alert('Cảm ơn bạn!', res.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openExternalUrl = async (urlPath) => {
    if (!urlPath) return;
    const fullUrl = urlPath.startsWith('http')
      ? urlPath
      : `https://scheduler.tuaf.edu.vn${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;
    try {
      await Linking.openURL(fullUrl);
    } catch (_e) {
      Alert.alert('Không thể mở liên kết', fullUrl);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerBadge}>TUAF ONE-STOP SERVICE</Text>
          <Text style={styles.headerTitle}>Dịch Vụ Một Cửa Số</Text>
          <Text style={styles.headerSub}>
            Xin giấy xác nhận, bảng điểm, KTX & theo dõi tiến độ SLA trực tuyến
          </Text>
        </View>
        <TouchableOpacity
          style={styles.alumniWebBtn}
          onPress={() => openExternalUrl('/onegate')}
        >
          <Ionicons name="globe-outline" size={16} color="#166534" />
          <Text style={styles.alumniWebBtnTxt}>Cổng Web</Text>
        </TouchableOpacity>
      </View>

      {/* SWITCH TABS */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'catalog' && styles.tabBtnActive]}
          onPress={() => setActiveTab('catalog')}
        >
          <Ionicons
            name="apps-outline"
            size={16}
            color={activeTab === 'catalog' ? '#fff' : '#475569'}
          />
          <Text style={[styles.tabBtnTxt, activeTab === 'catalog' && styles.tabBtnTxtActive]}>
            Danh mục Thủ tục ({services.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'my_requests' && styles.tabBtnActive]}
          onPress={() => setActiveTab('my_requests')}
        >
          <Ionicons
            name="folder-open-outline"
            size={16}
            color={activeTab === 'my_requests' ? '#fff' : '#475569'}
          />
          <Text
            style={[styles.tabBtnTxt, activeTab === 'my_requests' && styles.tabBtnTxtActive]}
          >
            Hồ sơ của tôi ({myRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingTxt}>Đang tải dữ liệu Một cửa Số...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
            />
          }
        >
          {activeTab === 'catalog' ? (
            <>
              <View style={styles.infoBanner}>
                <Ionicons name="shield-checkmark" size={20} color="#166534" />
                <Text style={styles.infoBannerTxt}>
                  Cam kết xử lý đúng hạn SLA (giờ hành chính T2–T6). Mọi văn bản điện tử đều có mã QR xác thực pháp lý chống giả mạo.
                </Text>
              </View>

              {services.map((srv) => (
                <TouchableOpacity
                  key={srv.id}
                  style={styles.serviceCard}
                  activeOpacity={0.85}
                  onPress={() => openApplyModal(srv)}
                >
                  <View style={styles.serviceCardHeader}>
                    <View style={styles.serviceIconCircle}>
                      <Ionicons name="document-text-outline" size={22} color="#166534" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceName}>{srv.name}</Text>
                      <Text style={styles.serviceDept}>🏢 {srv.department}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                  </View>

                  {srv.description ? (
                    <Text style={styles.serviceDesc} numberOfLines={2}>
                      {srv.description}
                    </Text>
                  ) : null}

                  <View style={styles.serviceBadgeRow}>
                    <View style={[styles.pillBadge, { backgroundColor: '#dcfce7' }]}>
                      <Text style={[styles.pillBadgeTxt, { color: '#166534' }]}>
                        ⏱️ Cam kết SLA: {srv.slaHours}h làm việc
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.pillBadge,
                        { backgroundColor: srv.isPaid ? '#fef3c7' : '#e0f2fe' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillBadgeTxt,
                          { color: srv.isPaid ? '#92400e' : '#0369a1' },
                        ]}
                      >
                        {srv.isPaid
                          ? `💳 Lệ phí: ${Number(srv.feeAmount || 0).toLocaleString('vi-VN')}đ`
                          : '✨ Miễn phí'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          ) : myRequests.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={48} color="#94a3b8" />
              <Text style={styles.emptyTitle}>Bạn chưa nộp hồ sơ Một cửa nào</Text>
              <Text style={styles.emptySub}>
                Chọn mục "Danh mục Thủ tục" để đăng ký Giấy xác nhận sinh viên, Bảng điểm hoặc các thủ tục học vụ trực tuyến.
              </Text>
            </View>
          ) : (
            myRequests.map((reqItem) => {
              const st = STATUS_META[reqItem.status] || STATUS_META.submitted;
              return (
                <TouchableOpacity
                  key={reqItem.id}
                  style={styles.requestCard}
                  activeOpacity={0.85}
                  onPress={() => setDetailRequest(reqItem)}
                >
                  <View style={styles.requestTopRow}>
                    <Text style={styles.requestCodeTxt}>#{reqItem.requestCode}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                      <Ionicons name={st.icon} size={13} color={st.color} />
                      <Text style={[styles.statusBadgeTxt, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>

                  <Text style={styles.requestServiceName}>{reqItem.serviceName}</Text>
                  <Text style={styles.requestMetaTxt}>
                    Đơn vị thụ lý: {reqItem.assignedDepartment}
                  </Text>
                  <Text
                    style={[
                      styles.requestSlaTxt,
                      {
                        color: reqItem.slaStatus?.isOverdue
                          ? '#dc2626'
                          : reqItem.slaStatus?.isNearDue
                          ? '#d97706'
                          : '#15803d',
                      },
                    ]}
                  >
                    ⏱️ Tiến độ SLA: {reqItem.slaStatus?.remainingText || 'Đang tính'}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* MODAL 1: ĐĂNG KÝ THỦ TỤC MỚI */}
      <Modal
        visible={Boolean(selectedService)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedService(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>
                📝 {selectedService?.name}
              </Text>
              <TouchableOpacity onPress={() => setSelectedService(null)}>
                <Ionicons name="close-circle" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              {/* Auto-fill Student Identity */}
              <View style={styles.autoFillCard}>
                <Text style={styles.autoFillTitle}>
                  👤 Thông tin Sinh viên (Tự động điền từ hồ sơ)
                </Text>
                <Text style={styles.autoFillLine}>
                  Họ và tên: <Text style={{ fontWeight: '700' }}>{user?.fullName || user?.name}</Text>
                </Text>
                <Text style={styles.autoFillLine}>
                  Mã SV: <Text style={{ fontWeight: '700' }}>{user?.username}</Text> • Lớp:{' '}
                  <Text style={{ fontWeight: '700' }}>
                    {dbContact.className || user?.className || 'Chính quy'}
                  </Text>
                </Text>
              </View>

              <Text style={styles.inputLabel}>Số điện thoại liên hệ nhận thông báo *</Text>
              <TextInput
                style={styles.textInput}
                value={studentPhone}
                onChangeText={setStudentPhone}
                placeholder="Nhập số điện thoại của bạn..."
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Email nhận bản điện tử PDF (nếu có)</Text>
              <TextInput
                style={styles.textInput}
                value={studentEmail}
                onChangeText={setStudentEmail}
                placeholder="Nhập email cá nhân..."
                keyboardType="email-address"
              />

              {/* Dynamic Schema Fields (bỏ trường Năm tốt nghiệp vì SV đang học) */}
              {(selectedService?.formSchema || [])
                .filter((field) => (field?.name || field?.key) !== 'graduationYear')
                .map((field, idx) => {
                  const fName = field.name || field.key || `field_${idx}`;
                  return (
                    <View key={fName} style={{ marginTop: 10 }}>
                      <Text style={styles.inputLabel}>
                        {field.label} {field.required ? '*' : ''}
                      </Text>
                      {field.type === 'select' && Array.isArray(field.options) ? (
                        <View style={styles.optionChipsWrap}>
                          {field.options.map((opt) => {
                            const chosen = formValues[fName] === opt;
                            return (
                              <TouchableOpacity
                                key={opt}
                                style={[styles.optionChip, chosen && styles.optionChipActive]}
                                onPress={() =>
                                  setFormValues((prev) => ({ ...prev, [fName]: opt }))
                                }
                              >
                                <Text
                                  style={[
                                    styles.optionChipTxt,
                                    chosen && styles.optionChipTxtActive,
                                  ]}
                                >
                                  {opt}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : (
                        <TextInput
                          style={styles.textInput}
                          value={String(formValues[fName] ?? '')}
                          onChangeText={(txt) =>
                            setFormValues((prev) => ({ ...prev, [fName]: txt }))
                          }
                          placeholder={
                            field.placeholder ||
                            `Nhập ${(field.label || fName).toLowerCase()}...`
                          }
                          keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                        />
                      )}
                    </View>
                  );
                })}

              {/* Delivery Method */}
              <Text style={[styles.inputLabel, { marginTop: 14 }]}>
                Hình thức nhận kết quả *
              </Text>
              {(selectedService?.deliveryOptions || ['digital_pdf', 'office_pickup'])
                .map(normalizeDeliveryKey)
                .map((optKey) => {
                  const chosen = deliveryMethod === optKey;
                  const configuredPickup = String(selectedService?.pickupLocation || '').trim();
                  const optionLabel =
                    optKey === 'office_pickup'
                      ? configuredPickup
                        ? `🏢 Nhận trực tiếp (${configuredPickup})`
                        : DELIVERY_LABELS.office_pickup
                      : DELIVERY_LABELS[optKey] || optKey;
                  return (
                    <TouchableOpacity
                      key={optKey}
                      style={[styles.deliveryOptionRow, chosen && styles.deliveryOptionRowActive]}
                      onPress={() => setDeliveryMethod(optKey)}
                    >
                      <Ionicons
                        name={chosen ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={chosen ? '#166534' : '#64748b'}
                      />
                      <Text
                        style={[
                          styles.deliveryOptionTxt,
                          chosen && { color: '#166534', fontWeight: '700' },
                        ]}
                      >
                        {optionLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                }
              )}

              {deliveryMethod === 'office_pickup' &&
                Boolean(String(selectedService?.pickupLocation || '').trim()) && (
                  <View style={styles.pickupLocationBox}>
                    <Ionicons name="location" size={18} color="#166534" style={{ marginTop: 1 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickupLocationTitle}>Nơi nhận kết quả:</Text>
                      <Text style={styles.pickupLocationValue}>
                        {selectedService.pickupLocation}
                      </Text>
                    </View>
                  </View>
                )}

              {deliveryMethod === 'postal_delivery' && (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.inputLabel}>
                    Địa chỉ nhận thư bảo đảm qua Bưu điện *
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={postalAddress}
                    onChangeText={setPostalAddress}
                    placeholder="Số nhà, đường, xã/phường, quận/huyện, tỉnh/TP..."
                  />
                </View>
              )}

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>
                Ghi chú thêm cho Cán bộ thụ lý (không bắt buộc)
              </Text>
              <TextInput
                style={styles.textInput}
                value={extraNote}
                onChangeText={setExtraNote}
                placeholder="Ghi chú thêm..."
              />
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitPrimaryBtn, submitting && { opacity: 0.6 }]}
              disabled={submitting}
              onPress={handleCreateRequest}
            >
              <Ionicons name="paper-plane" size={18} color="#fff" />
              <Text style={styles.submitPrimaryBtnTxt}>
                {submitting ? 'Đang gửi hồ sơ...' : 'Nộp Hồ Sơ Trực Tuyến'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: CHI TIẾT HỒ SƠ, VIETQR, TẢI PDF & ĐÁNH GIÁ SAO */}
      <Modal
        visible={Boolean(detailRequest)}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailRequest(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Hồ sơ #{detailRequest?.requestCode}
              </Text>
              <TouchableOpacity onPress={() => setDetailRequest(null)}>
                <Ionicons name="close-circle" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            {detailRequest && (
              <ScrollView style={{ maxHeight: 540 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.detailServiceName}>{detailRequest.serviceName}</Text>
                <Text style={styles.detailMetaLine}>
                  🏢 Đơn vị thụ lý: {detailRequest.assignedDepartment}
                </Text>
                <Text style={styles.detailMetaLine}>
                  👤 Cán bộ phụ trách: {detailRequest.assignedStaffName || 'Bộ phận Một cửa'}
                </Text>
                <Text style={styles.detailMetaLine}>
                  ⏱️ Cam kết SLA: {detailRequest.slaStatus?.remainingText || '—'}
                </Text>
                {normalizeDeliveryKey(detailRequest.deliveryMethod) === 'office_pickup' &&
                  Boolean(
                    detailRequest.trayLocation ||
                      detailRequest.pickupLocation ||
                      detailRequest.service?.pickupLocation
                  ) && (
                    <Text style={styles.detailMetaLine}>
                      📍 Nơi nhận kết quả:{' '}
                      <Text style={{ fontWeight: '700', color: '#166534' }}>
                        {detailRequest.trayLocation ||
                          detailRequest.pickupLocation ||
                          detailRequest.service?.pickupLocation}
                      </Text>
                    </Text>
                  )}

                {detailRequest.staffNote ? (
                  <View style={styles.staffNoteBox}>
                    <Text style={styles.staffNoteTitle}>💬 Phản hồi từ Cán bộ thụ lý:</Text>
                    <Text style={styles.staffNoteBody}>{detailRequest.staffNote}</Text>
                  </View>
                ) : null}

                {/* Khu vực Thanh toán VietQR */}
                {detailRequest.paymentInfo &&
                  ['pending_payment', 'payment_review'].includes(detailRequest.status) && (
                    <View style={styles.vietqrCard}>
                      <Text style={styles.vietqrTitle}>
                        💳 Quét mã VietQR để nộp lệ phí ({Number(detailRequest.paymentInfo.amount).toLocaleString('vi-VN')} VNĐ)
                      </Text>
                      <Image
                        source={{ uri: detailRequest.paymentInfo.qrImageUrl }}
                        style={styles.vietqrImg}
                        resizeMode="contain"
                      />
                      <Text style={styles.vietqrSub}>
                        Ngân hàng: {detailRequest.paymentInfo.bankName} • STK:{' '}
                        {detailRequest.paymentInfo.accountNo}
                      </Text>
                      <Text style={styles.vietqrSyntax}>
                        Nội dung CK: {detailRequest.paymentInfo.transferSyntax}
                      </Text>

                      {detailRequest.status === 'pending_payment' && (
                        <View style={{ width: '100%', marginTop: 10 }}>
                          <TextInput
                            style={styles.textInput}
                            value={receiptNote}
                            onChangeText={setReceiptNote}
                            placeholder="Nhập mã giao dịch ngân hàng / thời gian CK..."
                          />
                          <TouchableOpacity
                            style={styles.submitPrimaryBtn}
                            disabled={actionLoading}
                            onPress={handleConfirmTransferReceipt}
                          >
                            <Text style={styles.submitPrimaryBtnTxt}>
                              📤 Xác nhận đã chuyển khoản lệ phí
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                {/* Khu vực Bổ sung thông tin khi need_more_info */}
                {detailRequest.status === 'need_more_info' && (
                  <View style={styles.vietqrCard}>
                    <Text style={styles.vietqrTitle}>📝 Gửi bổ sung thông tin hồ sơ</Text>
                    <TextInput
                      style={[styles.textInput, { width: '100%', marginVertical: 8 }]}
                      value={receiptNote}
                      onChangeText={setReceiptNote}
                      placeholder="Nhập thông tin bổ sung theo yêu cầu của cán bộ..."
                    />
                    <TouchableOpacity
                      style={styles.submitPrimaryBtn}
                      disabled={actionLoading}
                      onPress={handleSupplementInfo}
                    >
                      <Text style={styles.submitPrimaryBtnTxt}>Gửi Bổ Sung Hồ Sơ</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Khu vực Kết quả: Tải PDF + Mã QR Nhận bản giấy + Link xác thực */}
                {(detailRequest.resultPdfUrl ||
                  detailRequest.verifyQrCode ||
                  detailRequest.pickupQrCode) && (
                  <View style={styles.resultSuccessBox}>
                    <Text style={styles.resultSuccessTitle}>
                      🎉 Kết quả Thủ tục Hành chính
                    </Text>
                    {detailRequest.trayLocation ? (
                      <Text style={styles.detailMetaLine}>
                        📍 Vị trí nhận bản giấy: <Text style={{ fontWeight: '800' }}>{detailRequest.trayLocation}</Text>
                      </Text>
                    ) : null}
                    {detailRequest.pickupQrCode ? (
                      <Text style={styles.detailMetaLine}>
                        🎫 Mã QR nhận kết quả trực tiếp: <Text style={{ fontWeight: '800' }}>{detailRequest.pickupQrCode}</Text>
                      </Text>
                    ) : null}
                    {detailRequest.postalTrackingNumber ? (
                      <Text style={styles.detailMetaLine}>
                        📦 Mã vận đơn Bưu điện: <Text style={{ fontWeight: '800' }}>{detailRequest.postalTrackingNumber}</Text>
                      </Text>
                    ) : null}

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                      {detailRequest.resultPdfUrl && (
                        <TouchableOpacity
                          style={styles.downloadPdfBtn}
                          onPress={() => openExternalUrl(detailRequest.resultPdfUrl)}
                        >
                          <Ionicons name="download-outline" size={16} color="#fff" />
                          <Text style={styles.downloadPdfBtnTxt}>Tải Bản Điện Tử PDF</Text>
                        </TouchableOpacity>
                      )}
                      {detailRequest.verifyQrCode && (
                        <TouchableOpacity
                          style={styles.verifyWebBtn}
                          onPress={() => openExternalUrl(`/verify/${detailRequest.verifyQrCode}`)}
                        >
                          <Ionicons name="qr-code-outline" size={16} color="#166534" />
                          <Text style={styles.verifyWebBtnTxt}>Trang Xác Thực QR</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}

                {/* Khu vực Đánh giá 1-5 Sao */}
                {['ready_for_pickup', 'completed'].includes(detailRequest.status) &&
                  !detailRequest.rating && (
                    <View style={styles.ratingBox}>
                      <Text style={styles.ratingTitle}>
                        ⭐ Đánh giá chất lượng giải quyết thủ tục
                      </Text>
                      <View style={styles.starsRow}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <TouchableOpacity
                            key={star}
                            onPress={() => setRatingStars(star)}
                          >
                            <Ionicons
                              name={star <= ratingStars ? 'star' : 'star-outline'}
                              size={30}
                              color="#f59e0b"
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput
                        style={styles.textInput}
                        value={ratingComment}
                        onChangeText={setRatingComment}
                        placeholder="Nhận xét về tốc độ & thái độ phục vụ..."
                      />
                      <TouchableOpacity
                        style={[styles.submitPrimaryBtn, { marginTop: 8 }]}
                        onPress={handleRateService}
                      >
                        <Text style={styles.submitPrimaryBtnTxt}>Gửi Đánh Giá</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                {/* Timeline Logs */}
                <Text style={[styles.inputLabel, { marginTop: 16, marginBottom: 8 }]}>
                  📜 Tiến trình xử lý hồ sơ
                </Text>
                {(detailRequest.logs || []).map((logItem) => (
                  <View key={logItem.id} style={styles.timelineRow}>
                    <View style={styles.timelineDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timelineAction}>
                        {logItem.action} •{' '}
                        {new Date(logItem.createdAt).toLocaleString('vi-VN')}
                      </Text>
                      <Text style={styles.timelineNote}>{logItem.note}</Text>
                    </View>
                  </View>
                ))}

                {/* Nút Hủy yêu cầu nếu chưa xử lý */}
                {['pending_payment', 'submitted', 'need_more_info'].includes(
                  detailRequest.status
                ) && (
                  <TouchableOpacity
                    style={styles.cancelReqBtn}
                    onPress={() => handleCancelRequest(detailRequest)}
                  >
                    <Text style={styles.cancelReqBtnTxt}>Hủy Yêu Cầu Thủ Tục Này</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#166534',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBadge: {
    color: '#bbf7d0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 2 },
  headerSub: { color: '#dcfce7', fontSize: 12, marginTop: 2 },
  alumniWebBtn: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  alumniWebBtnTxt: { color: '#166534', fontSize: 12, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    margin: 14,
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabBtnActive: { backgroundColor: '#166534' },
  tabBtnTxt: { fontSize: 13, fontWeight: '700', color: '#475569' },
  tabBtnTxtActive: { color: '#fff' },
  scrollContent: { paddingHorizontal: 14, paddingBottom: 30 },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingTxt: { marginTop: 10, color: '#64748b', fontSize: 13 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  infoBannerTxt: { flex: 1, fontSize: 12, color: '#166534', lineHeight: 18 },
  serviceCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  serviceCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  serviceIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  serviceDept: { fontSize: 12, color: '#64748b', marginTop: 2 },
  serviceDesc: { fontSize: 12, color: '#475569', marginTop: 8, lineHeight: 17 },
  serviceBadgeRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  pillBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillBadgeTxt: { fontSize: 11, fontWeight: '700' },
  emptyBox: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 6 },
  requestCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  requestTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  requestCodeTxt: { fontSize: 13, fontWeight: '800', color: '#166534' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeTxt: { fontSize: 11, fontWeight: '700' },
  requestServiceName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  requestMetaTxt: { fontSize: 12, color: '#64748b', marginTop: 4 },
  requestSlaTxt: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0f172a', marginRight: 8 },
  autoFillCard: {
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  autoFillTitle: { fontSize: 12, fontWeight: '800', color: '#166534', marginBottom: 4 },
  autoFillLine: { fontSize: 12, color: '#1e293b', marginTop: 2 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  optionChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  optionChipActive: { backgroundColor: '#166534', borderColor: '#166534' },
  optionChipTxt: { fontSize: 12, color: '#334155', fontWeight: '600' },
  optionChipTxtActive: { color: '#fff' },
  deliveryOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 6,
  },
  deliveryOptionRowActive: { backgroundColor: '#f0fdf4', borderColor: '#166534' },
  deliveryOptionTxt: { flex: 1, fontSize: 12, color: '#334155' },
  pickupLocationBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  pickupLocationTitle: { fontSize: 11, fontWeight: '700', color: '#166534' },
  pickupLocationValue: { fontSize: 12, fontWeight: '700', color: '#0f172a', marginTop: 2 },
  submitPrimaryBtn: {
    backgroundColor: '#166534',
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  submitPrimaryBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  detailServiceName: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  detailMetaLine: { fontSize: 13, color: '#334155', marginBottom: 4 },
  staffNoteBox: {
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
  },
  staffNoteTitle: { fontSize: 12, fontWeight: '800', color: '#92400e' },
  staffNoteBody: { fontSize: 13, color: '#78350f', marginTop: 2 },
  vietqrCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginVertical: 10,
  },
  vietqrTitle: { fontSize: 13, fontWeight: '800', color: '#166534', textAlign: 'center' },
  vietqrImg: { width: 190, height: 190, marginVertical: 10 },
  vietqrSub: { fontSize: 12, color: '#334155', textAlign: 'center' },
  vietqrSyntax: {
    fontSize: 13,
    fontWeight: '800',
    color: '#b45309',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  resultSuccessBox: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginVertical: 10,
  },
  resultSuccessTitle: { fontSize: 14, fontWeight: '800', color: '#166534', marginBottom: 6 },
  downloadPdfBtn: {
    backgroundColor: '#166534',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  downloadPdfBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  verifyWebBtn: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verifyWebBtnTxt: { color: '#166534', fontSize: 12, fontWeight: '700' },
  ratingBox: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  ratingTitle: { fontSize: 13, fontWeight: '800', color: '#92400e', textAlign: 'center' },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 10,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#166534',
    marginTop: 5,
  },
  timelineAction: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  timelineNote: { fontSize: 13, color: '#0f172a' },
  cancelReqBtn: {
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fca5a5',
    alignItems: 'center',
  },
  cancelReqBtnTxt: { color: '#dc2626', fontSize: 13, fontWeight: '700' },
});
