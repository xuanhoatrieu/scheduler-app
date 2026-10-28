import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  deleteInspectorExamViolation,
  getInspectorExamCandidates,
  getInspectorExamsByDate,
  submitInspectorExamRoomStatus,
  submitInspectorExamViolation,
} from '../../services/api';
import { Colors } from '../../theme/colors';

const ROOM_STATUS_OPTIONS = [
  {
    value: 'normal',
    label: 'Phòng thi & CBCT nghiêm túc',
    shortLabel: 'Bình thường',
    icon: 'checkmark-circle',
    color: '#2e7d32',
    bg: '#e8f5e9',
  },
  {
    value: 'proctor_late',
    label: 'Cán bộ coi thi (CBCT) đi muộn',
    shortLabel: 'CBCT đi muộn',
    icon: 'time',
    color: '#e65100',
    bg: '#fff3e0',
  },
  {
    value: 'proctor_changed',
    label: 'Đổi CBCT / Coi thi thay',
    shortLabel: 'Đổi CBCT',
    icon: 'swap-horizontal',
    color: '#0277bd',
    bg: '#e1f5fe',
  },
  {
    value: 'proctor_absent',
    label: 'Thiếu / Vắng CBCT',
    shortLabel: 'Vắng CBCT',
    icon: 'close-circle',
    color: '#c62828',
    bg: '#ffebee',
  },
  {
    value: 'other_issue',
    label: 'Bất thường khác tại phòng thi',
    shortLabel: 'Bất thường',
    icon: 'warning',
    color: '#ad1457',
    bg: '#fce4ec',
  },
];

const VIOLATION_TYPES = [
  {
    value: 'reprimand',
    label: 'Khiển trách',
    penalty: 'Trừ 25% điểm bài thi',
    color: '#f57c00',
    bg: '#fff3e0',
  },
  {
    value: 'warning',
    label: 'Cảnh cáo',
    penalty: 'Trừ 50% điểm bài thi',
    color: '#e65100',
    bg: '#fbe9e7',
  },
  {
    value: 'suspension',
    label: 'Đình chỉ thi',
    penalty: 'Điểm 0 bài thi, buộc rời phòng thi',
    color: '#c62828',
    bg: '#ffebee',
  },
  {
    value: 'late_disqualified',
    label: 'Đến muộn quá giờ (Không cho thi)',
    penalty: 'Cấm vào phòng thi ca này',
    color: '#6a1b9a',
    bg: '#f3e5f5',
  },
  {
    value: 'other',
    label: 'Vi phạm khác',
    penalty: 'Xử lý theo quy chế thi',
    color: '#37474f',
    bg: '#eceff1',
  },
];

const VIOLATION_ACTION_CHIPS = [
  'Sử dụng điện thoại di động trong phòng thi',
  'Mang tài liệu trái phép vào phòng thi',
  'Trao đổi bài / Nhìn bài thí sinh khác',
  'Thi hộ / Nhờ người thi hộ',
  'Không mang Thẻ sinh viên / CCCD',
  'Ngồi sai vị trí số báo danh',
  'Đến muộn quá 15 phút sau khi tính giờ thi',
  'Gây mất trật tự trong phòng thi',
  'Mang đề thi / giấy nháp ra khỏi phòng thi',
  'Không chấp hành hiệu lệnh của CBCT',
];

const STATUS_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'uninspected', label: 'Chưa kiểm tra' },
  { key: 'inspected', label: 'Đã kiểm tra' },
  { key: 'abnormal', label: 'Có vi phạm / Bất thường' },
];

const formatTodayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (dateStr, delta) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
};

const formatDisplayDate = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return `${dayNames[dt.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
};

const getRoomStatusMeta = (status) =>
  ROOM_STATUS_OPTIONS.find((o) => o.value === status) || null;

const getViolationTypeMeta = (type) =>
  VIOLATION_TYPES.find((t) => t.value === type) || VIOLATION_TYPES[2];

export default function InspectorExamsScreen({ user, onSwitchRole }) {
  const [selectedDate, setSelectedDate] = useState(formatTodayStr);
  const [examRooms, setExamRooms] = useState([]);
  const [summary, setSummary] = useState({
    totalRooms: 0,
    inspectedRooms: 0,
    normalRooms: 0,
    issueRooms: 0,
    totalStudents: 0,
    totalViolations: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedShift, setSelectedShift] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Date Picker Modal
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [customDateInput, setCustomDateInput] = useState('');
  const [dateError, setDateError] = useState('');

  // Room & Proctor Status Modal
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomStatus, setRoomStatus] = useState('normal');
  const [roomLateMinutes, setRoomLateMinutes] = useState('');
  const [roomSubstituteProctor, setRoomSubstituteProctor] = useState('');
  const [roomActualStudents, setRoomActualStudents] = useState('');
  const [roomNote, setRoomNote] = useState('');
  const [savingRoomStatus, setSavingRoomStatus] = useState(false);
  const [roomErrorMsg, setRoomErrorMsg] = useState('');

  // Candidates Modal
  const [candidatesModalVisible, setCandidatesModalVisible] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidateSearch, setCandidateSearch] = useState('');

  // Candidate Violation Modal
  const [violationModalVisible, setViolationModalVisible] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState(null);
  const [violationType, setViolationType] = useState('suspension');
  const [violationAction, setViolationAction] = useState('');
  const [violationPenalty, setViolationPenalty] = useState(VIOLATION_TYPES[2].penalty);
  const [violationEvidence, setViolationEvidence] = useState('');
  const [proctorNotified, setProctorNotified] = useState(true);
  const [violationNote, setViolationNote] = useState('');
  const [savingViolation, setSavingViolation] = useState(false);
  const [deletingViolation, setDeletingViolation] = useState(false);
  const [confirmDeleteMode, setConfirmDeleteMode] = useState(false);
  const [violationErrorMsg, setViolationErrorMsg] = useState('');

  const loadExams = useCallback(async (dateToLoad) => {
    const res = await getInspectorExamsByDate(dateToLoad);
    if (res.success) {
      setExamRooms(res.examRooms || []);
      if (res.summary) setSummary(res.summary);
    } else {
      setExamRooms([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadExams(selectedDate).finally(() => setLoading(false));
  }, [selectedDate, loadExams]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadExams(selectedDate);
    setRefreshing(false);
  }, [selectedDate, loadExams]);

  // Dynamic shift tabs
  const shiftTabs = useMemo(() => {
    const map = new Map();
    map.set('all', { key: 'all', label: 'Tất cả', count: examRooms.length });
    examRooms.forEach((rm) => {
      const key = rm.shiftKey || 'other';
      const label = rm.shiftTitle ? rm.shiftTitle.split(' (')[0] : 'Khác';
      if (!map.has(key)) {
        map.set(key, { key, label, count: 0 });
      }
      map.get(key).count += 1;
    });
    return Array.from(map.values());
  }, [examRooms]);

  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return examRooms.filter((rm) => {
      if (selectedShift !== 'all' && rm.shiftKey !== selectedShift) return false;
      if (statusFilter === 'uninspected' && rm.roomInspection) return false;
      if (statusFilter === 'inspected' && !rm.roomInspection) return false;
      if (statusFilter === 'abnormal') {
        const hasRoomIssue = rm.roomInspection && rm.roomInspection.status !== 'normal';
        const hasViolation = (rm.violationCount || 0) > 0;
        if (!hasRoomIssue && !hasViolation) return false;
      }
      if (q) {
        const haystack = [
          rm.courseName,
          rm.courseCode,
          rm.room,
          rm.proctor1,
          rm.proctor2,
          rm.proctors,
          rm.examGroup,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [examRooms, selectedShift, statusFilter, searchQuery]);

  // Open Room Inspection Modal
  const openRoomModal = (room) => {
    setActiveRoom(room);
    const existing = room.roomInspection;
    setRoomStatus(existing?.status || 'normal');
    setRoomLateMinutes(existing?.lateMinutes ? String(existing.lateMinutes) : '');
    setRoomSubstituteProctor(existing?.substituteProctor || '');
    setRoomActualStudents(
      existing?.actualStudentCount != null
        ? String(existing.actualStudentCount)
        : room.studentCount != null
        ? String(room.studentCount)
        : ''
    );
    setRoomNote(existing?.note || '');
    setRoomErrorMsg('');
    setRoomModalVisible(true);
  };

  const handleSaveRoomStatus = async () => {
    if (!activeRoom) return;
    setSavingRoomStatus(true);
    setRoomErrorMsg('');
    try {
      const payload = {
        date: selectedDate,
        roomKey: activeRoom.roomKey,
        idDotThiPhong: activeRoom.idDotThiPhong,
        idPhongThi: activeRoom.idPhongThi,
        courseCode: activeRoom.courseCode,
        courseName: activeRoom.courseName,
        room: activeRoom.room,
        examTime: activeRoom.examTime,
        periodText: activeRoom.periodText,
        examFormat: activeRoom.examFormat,
        proctors: activeRoom.proctors,
        expectedStudentCount: activeRoom.studentCount || 0,
        actualStudentCount:
          roomActualStudents !== '' ? parseInt(roomActualStudents, 10) : null,
        status: roomStatus,
        lateMinutes: roomStatus === 'proctor_late' ? parseInt(roomLateMinutes, 10) || 0 : 0,
        substituteProctor:
          roomStatus === 'proctor_changed' ? roomSubstituteProctor.trim() : '',
        note: roomNote.trim(),
      };
      const res = await submitInspectorExamRoomStatus(payload);
      if (res.success) {
        setRoomModalVisible(false);
        await loadExams(selectedDate);
      } else {
        setRoomErrorMsg(res.message || 'Không thể lưu trạng thái phòng thi');
      }
    } catch (err) {
      setRoomErrorMsg('Lỗi kết nối máy chủ');
    } finally {
      setSavingRoomStatus(false);
    }
  };

  // Open Candidates Modal
  const openCandidatesModal = async (room) => {
    setActiveRoom(room);
    setCandidateSearch('');
    setCandidates([]);
    setCandidatesModalVisible(true);
    setCandidatesLoading(true);
    try {
      const res = await getInspectorExamCandidates({
        idDotThiPhong: room.idDotThiPhong || 0,
        idPhongThi: room.idPhongThi || 0,
        roomKey: room.roomKey || '',
        date: selectedDate,
      });
      if (res.success) {
        setCandidates(res.candidates || []);
      }
    } finally {
      setCandidatesLoading(false);
    }
  };

  const filteredCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const hay = [c.studentCode, c.fullName, c.examNumber, c.className]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [candidates, candidateSearch]);

  // Open Candidate Violation Modal
  const openViolationModal = (candidate) => {
    setActiveCandidate(candidate);
    setConfirmDeleteMode(false);
    setViolationErrorMsg('');
    const existing = candidate.violation;
    if (existing) {
      setViolationType(existing.violationType || 'suspension');
      setViolationAction(existing.violationAction || '');
      setViolationPenalty(
        existing.penalty || getViolationTypeMeta(existing.violationType).penalty
      );
      setViolationEvidence(existing.evidence || '');
      setProctorNotified(existing.proctorNotified !== false);
      setViolationNote(existing.note || '');
    } else {
      setViolationType('suspension');
      setViolationAction('');
      setViolationPenalty(VIOLATION_TYPES[2].penalty);
      setViolationEvidence('');
      setProctorNotified(true);
      setViolationNote('');
    }
    setViolationModalVisible(true);
  };

  const handleSelectViolationType = (typeVal) => {
    setViolationType(typeVal);
    const meta = getViolationTypeMeta(typeVal);
    setViolationPenalty(meta.penalty);
  };

  const handleToggleActionChip = (chipText) => {
    if (violationAction.includes(chipText)) {
      const next = violationAction
        .split('; ')
        .filter((item) => item.trim() && item.trim() !== chipText)
        .join('; ');
      setViolationAction(next);
    } else {
      setViolationAction(violationAction ? `${violationAction}; ${chipText}` : chipText);
    }
  };

  const handleSaveViolation = async () => {
    if (!activeRoom || !activeCandidate) return;
    if (!violationAction.trim()) {
      setViolationErrorMsg('Vui lòng chọn hoặc nhập hành vi vi phạm cụ thể.');
      return;
    }
    setSavingViolation(true);
    setViolationErrorMsg('');
    try {
      const payload = {
        date: selectedDate,
        roomKey: activeRoom.roomKey,
        idDotThiPhong: activeRoom.idDotThiPhong,
        idPhongThi: activeRoom.idPhongThi,
        courseCode: activeRoom.courseCode,
        courseName: activeRoom.courseName,
        room: activeRoom.room,
        examTime: activeRoom.examTime,
        periodText: activeRoom.periodText,
        examFormat: activeRoom.examFormat,
        proctors: activeRoom.proctors,
        studentCode: activeCandidate.studentCode,
        studentName: activeCandidate.fullName,
        studentClass: activeCandidate.className,
        examNumber: activeCandidate.examNumber,
        violationType,
        violationAction: violationAction.trim(),
        penalty: violationPenalty.trim(),
        evidence: violationEvidence.trim(),
        proctorNotified,
        note: violationNote.trim(),
      };
      const res = await submitInspectorExamViolation(payload);
      if (res.success) {
        setViolationModalVisible(false);
        // Refresh both candidate list & exam room list
        const [candRes] = await Promise.all([
          getInspectorExamCandidates({
            idDotThiPhong: activeRoom.idDotThiPhong || 0,
            idPhongThi: activeRoom.idPhongThi || 0,
            roomKey: activeRoom.roomKey || '',
            date: selectedDate,
          }),
          loadExams(selectedDate),
        ]);
        if (candRes?.success) {
          setCandidates(candRes.candidates || []);
        }
      } else {
        setViolationErrorMsg(res.message || 'Không thể lưu biên bản vi phạm');
      }
    } catch (err) {
      setViolationErrorMsg('Lỗi kết nối máy chủ');
    } finally {
      setSavingViolation(false);
    }
  };

  const handleDeleteViolation = async () => {
    const violationId = activeCandidate?.violation?.id;
    if (!violationId || !activeRoom) return;
    setDeletingViolation(true);
    setViolationErrorMsg('');
    try {
      const res = await deleteInspectorExamViolation(violationId);
      if (res.success) {
        setViolationModalVisible(false);
        setConfirmDeleteMode(false);
        const [candRes] = await Promise.all([
          getInspectorExamCandidates({
            idDotThiPhong: activeRoom.idDotThiPhong || 0,
            idPhongThi: activeRoom.idPhongThi || 0,
            roomKey: activeRoom.roomKey || '',
            date: selectedDate,
          }),
          loadExams(selectedDate),
        ]);
        if (candRes?.success) {
          setCandidates(candRes.candidates || []);
        }
      } else {
        setViolationErrorMsg(res.message || 'Không thể xóa biên bản vi phạm');
      }
    } catch (err) {
      setViolationErrorMsg('Lỗi kết nối máy chủ');
    } finally {
      setDeletingViolation(false);
    }
  };

  const applyCustomDate = () => {
    const trimmed = customDateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      setDateError('Định dạng ngày phải là YYYY-MM-DD (VD: 2026-06-15)');
      return;
    }
    setDateError('');
    setSelectedDate(trimmed);
    setDateModalVisible(false);
  };

  const renderExamRoomCard = ({ item }) => {
    const roomMeta = item.roomInspection ? getRoomStatusMeta(item.roomInspection.status) : null;
    const hasViolations = (item.violationCount || 0) > 0;

    return (
      <View
        style={[
          styles.roomCard,
          hasViolations && styles.roomCardViolation,
          !hasViolations && roomMeta && { borderLeftColor: roomMeta.color },
        ]}
      >
        {/* Top Row: Room Badge + Exam Time + Format */}
        <View style={styles.cardTopBar}>
          <View style={styles.roomBadge}>
            <Ionicons name="location" size={13} color="#fff" />
            <Text style={styles.roomBadgeText}>{item.room || 'Chưa xếp phòng'}</Text>
          </View>
          <View style={styles.timeBadge}>
            <Ionicons name="time-outline" size={13} color={Colors.primary} />
            <Text style={styles.timeBadgeText}>
              {item.examTime || item.periodText || 'Chưa rõ giờ'}
            </Text>
          </View>
          {item.examFormat ? (
            <View style={styles.formatBadge}>
              <Text style={styles.formatBadgeText}>{item.examFormat}</Text>
            </View>
          ) : null}
        </View>

        {/* Course Info */}
        <Text style={styles.courseName}>{item.courseName}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.courseCode}>
            Mã HP: <Text style={{ fontWeight: '700' }}>{item.courseCode || '—'}</Text>
          </Text>
          {item.periodText ? (
            <Text style={styles.metaChip}>• {item.periodText}</Text>
          ) : null}
          <View style={styles.studentCountChip}>
            <Ionicons name="people" size={12} color={Colors.primary} />
            <Text style={styles.studentCountText}>
              SL: {item.roomInspection?.actualStudentCount ?? item.studentCount ?? 0}/
              {item.studentCount || 0} SV
            </Text>
          </View>
        </View>

        {/* Proctors */}
        <View style={styles.proctorBox}>
          <Ionicons name="person-circle-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.proctorText} numberOfLines={2}>
            CBCT:{' '}
            <Text style={{ fontWeight: '700', color: Colors.textPrimary }}>
              {item.proctors || 'Chưa phân công CBCT'}
            </Text>
          </Text>
        </View>

        {/* Room Status & Note Display */}
        {roomMeta ? (
          <View style={[styles.roomStatusBanner, { backgroundColor: roomMeta.bg }]}>
            <View style={styles.roomStatusBannerHeader}>
              <Ionicons name={roomMeta.icon} size={15} color={roomMeta.color} />
              <Text style={[styles.roomStatusBannerTitle, { color: roomMeta.color }]}>
                Phòng thi / CBCT: {roomMeta.shortLabel}
                {item.roomInspection.status === 'proctor_late' &&
                item.roomInspection.lateMinutes > 0
                  ? ` (+${item.roomInspection.lateMinutes} phút)`
                  : ''}
                {item.roomInspection.status === 'proctor_changed' &&
                item.roomInspection.substituteProctor
                  ? ` (Thay: ${item.roomInspection.substituteProctor})`
                  : ''}
              </Text>
            </View>
            {item.roomInspection.note ? (
              <Text style={styles.roomStatusNote}>
                📝 Ghi chú: {item.roomInspection.note}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Student Violations Summary */}
        {hasViolations ? (
          <View style={styles.violationSummaryBox}>
            <View style={styles.violationSummaryHeader}>
              <Ionicons name="alert-circle" size={15} color="#c62828" />
              <Text style={styles.violationSummaryTitle}>
                {item.violationCount} sinh viên vi phạm quy chế thi
              </Text>
            </View>
            {(item.violations || []).map((v) => {
              const vMeta = getViolationTypeMeta(v.violationType);
              return (
                <Text key={v.id} style={styles.violationSummaryItem} numberOfLines={2}>
                  • <Text style={{ fontWeight: '700' }}>{v.studentName}</Text> ({v.studentCode}) —{' '}
                  <Text style={{ color: vMeta.color, fontWeight: '700' }}>{vMeta.label}</Text>:{' '}
                  {v.violationAction}
                </Text>
              );
            })}
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.roomCheckBtn,
              roomMeta && { borderColor: roomMeta.color, backgroundColor: roomMeta.bg },
            ]}
            onPress={() => openRoomModal(item)}
          >
            <Ionicons
              name={roomMeta ? 'create-outline' : 'shield-checkmark-outline'}
              size={15}
              color={roomMeta ? roomMeta.color : Colors.primary}
            />
            <Text
              style={[
                styles.roomCheckBtnText,
                roomMeta && { color: roomMeta.color },
              ]}
            >
              {roomMeta ? 'Cập nhật Phòng/CBCT' : 'Kiểm tra Phòng/CBCT'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.candidatesBtn,
              hasViolations && styles.candidatesBtnDanger,
            ]}
            onPress={() => openCandidatesModal(item)}
          >
            <Ionicons
              name={hasViolations ? 'warning' : 'document-text-outline'}
              size={15}
              color="#fff"
            />
            <Text style={styles.candidatesBtnText}>
              DS Thí sinh & Biên bản{hasViolations ? ` (${item.violationCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Thanh Tra Lịch Thi</Text>
          <Text style={styles.headerSubtitle}>
            Kiểm tra phòng thi, CBCT & lập biên bản thí sinh
          </Text>
        </View>
        {onSwitchRole && (
          <TouchableOpacity style={styles.switchRoleBtn} onPress={onSwitchRole}>
            <Ionicons name="swap-horizontal" size={16} color={Colors.primary} />
            <Text style={styles.switchRoleText}>Đổi vai trò</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Date Navigator */}
      <View style={styles.dateBar}>
        <TouchableOpacity
          style={styles.dateNavBtn}
          onPress={() => setSelectedDate((d) => addDays(d, -1))}
        >
          <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dateCenterBtn}
          onPress={() => {
            setCustomDateInput(selectedDate);
            setDateError('');
            setDateModalVisible(true);
          }}
        >
          <Ionicons name="calendar-outline" size={15} color={Colors.primary} />
          <Text style={styles.dateText}>{formatDisplayDate(selectedDate)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dateNavBtn}
          onPress={() => setSelectedDate((d) => addDays(d, 1))}
        >
          <Ionicons name="chevron-forward" size={18} color={Colors.textPrimary} />
        </TouchableOpacity>

        {selectedDate !== formatTodayStr() && (
          <TouchableOpacity
            style={styles.todayChip}
            onPress={() => setSelectedDate(formatTodayStr())}
          >
            <Text style={styles.todayChipText}>Hôm nay</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Summary Strip */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{summary.totalRooms || 0}</Text>
          <Text style={styles.summaryLabel}>Tổng phòng</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#2e7d32' }]}>
            {summary.inspectedRooms || 0}
          </Text>
          <Text style={styles.summaryLabel}>Đã kiểm tra</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#0277bd' }]}>
            {summary.totalStudents || 0}
          </Text>
          <Text style={styles.summaryLabel}>Lượt thí sinh</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#c62828' }]}>
            {summary.totalViolations || 0}
          </Text>
          <Text style={styles.summaryLabel}>SV vi phạm</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={17} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm môn thi, mã HP, phòng thi, cán bộ coi thi..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Shift Filter Chips */}
      <View style={{ marginBottom: 6 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipRow}
        >
          {shiftTabs.map((tab) => {
            const active = selectedShift === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.shiftChip, active && styles.shiftChipActive]}
                onPress={() => setSelectedShift(tab.key)}
              >
                <Text style={[styles.shiftChipText, active && styles.shiftChipTextActive]}>
                  {tab.label} ({tab.count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Status Filter Chips */}
      <View style={{ marginBottom: 8 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipRow}
        >
          {STATUS_FILTERS.map((st) => {
            const active = statusFilter === st.key;
            return (
              <TouchableOpacity
                key={st.key}
                style={[styles.statusChip, active && styles.statusChipActive]}
                onPress={() => setStatusFilter(st.key)}
              >
                <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                  {st.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Exam Room List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải lịch thi từ hệ thống TUAF...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRooms}
          keyExtractor={(item, idx) =>
            `${item.idDotThiPhong || 0}_${item.idPhongThi || 0}_${idx}`
          }
          renderItem={renderExamRoomCard}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="document-text-outline" size={52} color={Colors.borderLight} />
              <Text style={styles.emptyTitle}>Không có phòng thi nào</Text>
              <Text style={styles.emptySubtitle}>
                Không tìm thấy lịch thi phù hợp trong ngày {selectedDate}.
              </Text>
            </View>
          }
        />
      )}

      {/* Custom Date Modal */}
      <Modal
        visible={dateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.smallModalCard}>
            <Text style={styles.modalTitle}>Chọn ngày thanh tra lịch thi</Text>
            <Text style={styles.modalLabel}>Nhập ngày (YYYY-MM-DD):</Text>
            <TextInput
              style={styles.textInput}
              value={customDateInput}
              onChangeText={setCustomDateInput}
              placeholder="VD: 2026-06-15"
              autoCapitalize="none"
            />
            {dateError ? <Text style={styles.errorText}>{dateError}</Text> : null}
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDateModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={applyCustomDate}>
                <Text style={styles.modalPrimaryText}>Xem lịch thi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Room & Proctor Inspection Modal */}
      <Modal
        visible={roomModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRoomModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheetModalCard}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Kiểm Tra Phòng Thi & CBCT</Text>
                <Text style={styles.sheetSubTitle} numberOfLines={2}>
                  {activeRoom?.room || 'Phòng thi'} • {activeRoom?.courseName}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setRoomModalVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText}>
                  CBCT phân công: <Text style={{ fontWeight: '700' }}>{activeRoom?.proctors || 'Chưa phân công'}</Text>
                </Text>
                <Text style={styles.infoBannerText}>
                  Ca thi: {activeRoom?.examTime || activeRoom?.periodText || '—'} • Sĩ số danh sách:{' '}
                  {activeRoom?.studentCount || 0} SV
                </Text>
              </View>

              <Text style={styles.modalLabel}>Trạng thái phòng thi & Cán bộ coi thi:</Text>
              {ROOM_STATUS_OPTIONS.map((opt) => {
                const selected = roomStatus === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.radioOption,
                      selected && { borderColor: opt.color, backgroundColor: opt.bg },
                    ]}
                    onPress={() => setRoomStatus(opt.value)}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={selected ? opt.color : Colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.radioOptionText,
                        selected && { color: opt.color, fontWeight: '700' },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {roomStatus === 'proctor_late' && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.modalLabel}>Số phút CBCT đi muộn:</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    placeholder="VD: 15"
                    value={roomLateMinutes}
                    onChangeText={setRoomLateMinutes}
                  />
                </View>
              )}

              {roomStatus === 'proctor_changed' && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.modalLabel}>Họ tên cán bộ coi thi thay:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Nhập họ tên CBCT thay thế..."
                    value={roomSubstituteProctor}
                    onChangeText={setRoomSubstituteProctor}
                  />
                </View>
              )}

              <View style={{ marginTop: 8 }}>
                <Text style={styles.modalLabel}>
                  Số thí sinh dự thi thực tế tại phòng (Danh sách: {activeRoom?.studentCount || 0} SV):
                </Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="Nhập số thí sinh có mặt..."
                  value={roomActualStudents}
                  onChangeText={setRoomActualStudents}
                />
              </View>

              <View style={{ marginTop: 8 }}>
                <Text style={styles.modalLabel}>Ghi chú phòng thi & CBCT:</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  multiline
                  placeholder="Ghi chú về tình hình phòng thi, đề thi, cơ sở vật chất, tác phong CBCT..."
                  value={roomNote}
                  onChangeText={setRoomNote}
                />
              </View>

              {roomErrorMsg ? <Text style={styles.errorText}>{roomErrorMsg}</Text> : null}
            </ScrollView>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRoomModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalPrimaryBtn}
                onPress={handleSaveRoomStatus}
                disabled={savingRoomStatus}
              >
                {savingRoomStatus ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Lưu trạng thái</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Candidates List Modal */}
      <Modal
        visible={candidatesModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCandidatesModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheetModalCard, { height: '86%' }]}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Danh Sách Thí Sinh Phòng Thi</Text>
                <Text style={styles.sheetSubTitle} numberOfLines={2}>
                  {activeRoom?.room} • {activeRoom?.courseName} ({candidates.length} SV)
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCandidatesModalVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.candidateSearchBox}>
              <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm MSSV, họ tên, số báo danh..."
                placeholderTextColor={Colors.textMuted}
                value={candidateSearch}
                onChangeText={setCandidateSearch}
              />
              {candidateSearch ? (
                <TouchableOpacity onPress={() => setCandidateSearch('')}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>

            {candidatesLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Đang tải danh sách thí sinh...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredCandidates}
                keyExtractor={(item, idx) => `${item.studentCode}_${idx}`}
                renderItem={({ item, index }) => {
                  const hasViolation = !!item.violation;
                  const vMeta = hasViolation
                    ? getViolationTypeMeta(item.violation.violationType)
                    : null;
                  return (
                    <View
                      style={[
                        styles.candidateCard,
                        hasViolation && styles.candidateCardViolated,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.candidateHeaderRow}>
                          <Text style={styles.candidateIndex}>
                            {item.examNumber ? `SBD ${item.examNumber}` : `#${index + 1}`}
                          </Text>
                          <Text style={styles.candidateName}>{item.fullName}</Text>
                        </View>
                        <Text style={styles.candidateSub}>
                          MSSV: <Text style={{ fontWeight: '700' }}>{item.studentCode}</Text>
                          {item.className ? ` • Lớp: ${item.className}` : ''}
                          {item.birthDate ? ` • NS: ${item.birthDate}` : ''}
                        </Text>

                        {!item.isEligible && item.ineligibleReason ? (
                          <Text style={styles.ineligibleText}>
                            ⛔ Cấm thi: {item.ineligibleReason}
                          </Text>
                        ) : null}

                        {hasViolation && vMeta ? (
                          <View style={[styles.candidateViolationBox, { backgroundColor: vMeta.bg }]}>
                            <Text style={[styles.candidateViolationTitle, { color: vMeta.color }]}>
                              ⚠️ Biên bản: {vMeta.label} ({item.violation.penalty})
                            </Text>
                            <Text style={styles.candidateViolationDesc}>
                              Hành vi: {item.violation.violationAction}
                            </Text>
                            {item.violation.note ? (
                              <Text style={styles.candidateViolationDesc}>
                                Ghi chú: {item.violation.note}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.recordViolationBtn,
                          hasViolation && styles.editViolationBtn,
                        ]}
                        onPress={() => openViolationModal(item)}
                      >
                        <Ionicons
                          name={hasViolation ? 'create-outline' : 'warning-outline'}
                          size={14}
                          color="#fff"
                        />
                        <Text style={styles.recordViolationBtnText}>
                          {hasViolation ? 'Sửa BB' : 'Lập BB'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyTitle}>Không tìm thấy thí sinh</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Candidate Violation Form Modal */}
      <Modal
        visible={violationModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setViolationModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheetModalCard, { maxHeight: '90%' }]}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: '#c62828' }]}>
                  Lập Biên Bản Vi Phạm Quy Chế Thi
                </Text>
                <Text style={styles.sheetSubTitle}>
                  SV: {activeCandidate?.fullName} ({activeCandidate?.studentCode})
                  {activeCandidate?.examNumber ? ` • SBD: ${activeCandidate.examNumber}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setViolationModalVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 1. Hình thức kỷ luật */}
              <Text style={styles.modalLabel}>1. Mức độ xử lý kỷ luật:</Text>
              <View style={styles.violationTypeGrid}>
                {VIOLATION_TYPES.map((vt) => {
                  const active = violationType === vt.value;
                  return (
                    <TouchableOpacity
                      key={vt.value}
                      style={[
                        styles.violationTypeChip,
                        active && { borderColor: vt.color, backgroundColor: vt.bg },
                      ]}
                      onPress={() => handleSelectViolationType(vt.value)}
                    >
                      <Text
                        style={[
                          styles.violationTypeChipTitle,
                          active && { color: vt.color, fontWeight: '800' },
                        ]}
                      >
                        {vt.label}
                      </Text>
                      <Text style={styles.violationTypeChipSub}>{vt.penalty}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 2. Hành vi vi phạm */}
              <Text style={styles.modalLabel}>2. Hành vi vi phạm (chọn nhanh hoặc nhập):</Text>
              <View style={styles.actionChipsWrap}>
                {VIOLATION_ACTION_CHIPS.map((chip) => {
                  const selected = violationAction.includes(chip);
                  return (
                    <TouchableOpacity
                      key={chip}
                      style={[
                        styles.actionQuickChip,
                        selected && styles.actionQuickChipSelected,
                      ]}
                      onPress={() => handleToggleActionChip(chip)}
                    >
                      <Text
                        style={[
                          styles.actionQuickChipText,
                          selected && styles.actionQuickChipTextSelected,
                        ]}
                      >
                        {chip}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                multiline
                placeholder="Mô tả chi tiết hành vi vi phạm quy chế thi..."
                value={violationAction}
                onChangeText={setViolationAction}
              />

              {/* 3. Tang vật / Bằng chứng */}
              <Text style={styles.modalLabel}>3. Tang vật / Bằng chứng thu giữ (nếu có):</Text>
              <TextInput
                style={styles.textInput}
                placeholder="VD: 01 điện thoại iPhone, 02 tờ tài liệu A4 viết tay..."
                value={violationEvidence}
                onChangeText={setViolationEvidence}
              />

              {/* 4. Hình thức xử lý đề xuất */}
              <Text style={styles.modalLabel}>4. Hình thức xử lý theo quy chế:</Text>
              <TextInput
                style={styles.textInput}
                value={violationPenalty}
                onChangeText={setViolationPenalty}
              />

              {/* 5. Phối hợp CBCT */}
              <View style={styles.switchRow}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary }}>
                  Đã thông báo và lập biên bản cùng CBCT tại phòng thi
                </Text>
                <Switch
                  value={proctorNotified}
                  onValueChange={setProctorNotified}
                  trackColor={{ false: '#ccc', true: Colors.primary }}
                />
              </View>

              {/* 6. Ghi chú bổ sung */}
              <Text style={styles.modalLabel}>5. Ghi chú thêm của Thanh tra:</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                multiline
                placeholder="Ghi chú thêm (nếu có)..."
                value={violationNote}
                onChangeText={setViolationNote}
              />

              {violationErrorMsg ? (
                <Text style={styles.errorText}>{violationErrorMsg}</Text>
              ) : null}

              {/* Delete existing violation confirmation */}
              {activeCandidate?.violation?.id && (
                <View style={styles.deleteSection}>
                  {!confirmDeleteMode ? (
                    <TouchableOpacity
                      style={styles.deleteOutlineBtn}
                      onPress={() => setConfirmDeleteMode(true)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#c62828" />
                      <Text style={styles.deleteOutlineText}>Hủy / Xóa biên bản vi phạm này</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.confirmDeleteBox}>
                      <Text style={styles.confirmDeleteText}>
                        Xác nhận xóa biên bản vi phạm của SV {activeCandidate?.fullName}?
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                        <TouchableOpacity
                          style={styles.modalCancelBtn}
                          onPress={() => setConfirmDeleteMode(false)}
                        >
                          <Text style={styles.modalCancelText}>Không</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.modalPrimaryBtn, { backgroundColor: '#c62828' }]}
                          onPress={handleDeleteViolation}
                          disabled={deletingViolation}
                        >
                          {deletingViolation ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.modalPrimaryText}>Xác nhận xóa</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setViolationModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { backgroundColor: '#c62828' }]}
                onPress={handleSaveViolation}
                disabled={savingViolation}
              >
                {savingViolation ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Lưu Biên Bản Vi Phạm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  switchRoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  switchRoleText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 6,
    gap: 6,
  },
  dateNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.background,
  },
  dateCenterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  dateText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  todayChip: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  todayChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  summaryLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },
  summaryDivider: { width: 1, height: 24, backgroundColor: Colors.borderLight },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 40,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary, paddingVertical: 0 },

  filterChipRow: { paddingHorizontal: 16, gap: 8 },
  shiftChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  shiftChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  shiftChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  shiftChipTextActive: { color: '#fff' },

  statusChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: Colors.surface,
  },
  statusChipActive: { backgroundColor: '#263238' },
  statusChipText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  statusChipTextActive: { color: '#fff' },

  roomCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    elevation: 2,
    shadowColor: Colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  roomCardViolation: {
    borderLeftColor: '#c62828',
    backgroundColor: '#fffdfd',
  },
  cardTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1565c0',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roomBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  formatBadge: {
    backgroundColor: '#f3e5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  formatBadgeText: { fontSize: 11, fontWeight: '700', color: '#6a1b9a' },

  courseName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  courseCode: { fontSize: 12, color: Colors.textSecondary },
  metaChip: { fontSize: 12, color: Colors.textSecondary },
  studentCountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  studentCountText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  proctorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.background,
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  proctorText: { flex: 1, fontSize: 12, color: Colors.textSecondary },

  roomStatusBanner: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  roomStatusBannerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roomStatusBannerTitle: { fontSize: 12, fontWeight: '700' },
  roomStatusNote: { fontSize: 11, color: Colors.textSecondary, marginTop: 3 },

  violationSummaryBox: {
    backgroundColor: '#ffebee',
    padding: 9,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  violationSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  violationSummaryTitle: { fontSize: 12, fontWeight: '800', color: '#c62828' },
  violationSummaryItem: { fontSize: 11, color: Colors.textPrimary, marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  roomCheckBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: '#fff',
  },
  roomCheckBtnText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  candidatesBtn: { backgroundColor: Colors.primary },
  candidatesBtnDanger: { backgroundColor: '#c62828' },
  candidatesBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 },
  loadingText: { marginTop: 10, fontSize: 13, color: Colors.textSecondary },
  emptyWrap: { alignItems: 'center', paddingTop: 48 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginTop: 10 },
  emptySubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  smallModalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
  },
  sheetModalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  sheetSubTitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  modalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
    marginBottom: 6,
  },
  infoBanner: {
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
    gap: 3,
  },
  infoBannerText: { fontSize: 12, color: Colors.textSecondary },

  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: 6,
  },
  radioOptionText: { fontSize: 13, color: Colors.textPrimary },

  textInput: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: Colors.textPrimary,
    backgroundColor: '#fff',
  },
  textArea: { minHeight: 68, textAlignVertical: 'top' },
  errorText: { fontSize: 12, color: '#c62828', marginTop: 6, fontWeight: '600' },

  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.background,
  },
  modalCancelText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  modalPrimaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  candidateSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
    marginBottom: 10,
  },
  candidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: 12,
    backgroundColor: Colors.background,
    marginBottom: 8,
    gap: 10,
  },
  candidateCardViolated: {
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  candidateHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  candidateIndex: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  candidateName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  candidateSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  ineligibleText: { fontSize: 11, color: '#c62828', fontWeight: '700', marginTop: 2 },
  candidateViolationBox: {
    marginTop: 6,
    padding: 7,
    borderRadius: 8,
  },
  candidateViolationTitle: { fontSize: 11, fontWeight: '800' },
  candidateViolationDesc: { fontSize: 11, color: Colors.textPrimary, marginTop: 2 },
  recordViolationBtn: {
    backgroundColor: '#c62828',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
  },
  editViolationBtn: { backgroundColor: '#e65100' },
  recordViolationBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  violationTypeGrid: { gap: 6 },
  violationTypeChip: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: '#fff',
  },
  violationTypeChipTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  violationTypeChipSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  actionChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  actionQuickChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  actionQuickChipSelected: {
    backgroundColor: '#ffebee',
    borderColor: '#c62828',
  },
  actionQuickChipText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  actionQuickChipTextSelected: { color: '#c62828', fontWeight: '700' },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 6,
  },
  deleteSection: { marginTop: 14 },
  deleteOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c62828',
  },
  deleteOutlineText: { fontSize: 12, fontWeight: '700', color: '#c62828' },
  confirmDeleteBox: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 10,
  },
  confirmDeleteText: { fontSize: 12, fontWeight: '700', color: '#c62828' },
});
