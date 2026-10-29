const ServiceCatalog = require('../models/ServiceCatalog');

const DEFAULT_BANK_INFO = {
  bankId: '970405',
  bankName: 'Agribank CN Thái Nguyên',
  accountNo: '888866669999',
  accountName: 'TRUONG DAI HOC NONG LAM TN',
};

const INITIAL_SERVICES = [
  // ================= GIAI ĐOẠN 1: THÍ ĐIỂM (isActive = true) =================
  {
    code: 'XN_SINH_VIEN',
    name: 'Giấy xác nhận sinh viên (Vay vốn NHCSXH, Hoãn NVQS, Vé xe buýt)',
    department: 'CTSV',
    icon: 'document-text-outline',
    description:
      'Cấp giấy xác nhận đang là sinh viên chính quy tại Trường ĐH Nông Lâm Thái Nguyên phục vụ vay vốn tín dụng, tạm hoãn nghĩa vụ quân sự hoặc làm vé tháng xe buýt.',
    displayOrder: 1,
    slaHours: 24,
    assigneeName: 'Chuyên viên Phòng CTSV',
    assigneeEmail: 'ctsv@tuaf.edu.vn',
    assigneePhone: '0208.3855.555',
    leaderName: 'Trưởng phòng Công tác Sinh viên',
    leaderEmail: 'truongphong.ctsv@tuaf.edu.vn',
    isPaid: false,
    feeAmount: 0,
    postalFeeAmount: 30000,
    bankAccountInfo: DEFAULT_BANK_INFO,
    deliveryOptions: ['digital_pdf', 'office_pickup'],
    pickupLocation: 'Phòng Công tác HSSV (Tầng 1 - Nhà Trung tâm)',
    formSchema: [
      {
        name: 'purpose',
        key: 'purpose',
        label: 'Mục đích xin xác nhận',
        type: 'select',
        required: true,
        options: [
          'Vay vốn Ngân hàng Chính sách Xã hội',
          'Tạm hoãn Nghĩa vụ Quân sự địa phương',
          'Bổ sung hồ sơ cá nhân / Xin việc bán thời gian',
          'Làm vé tháng xe buýt / Ưu đãi sinh viên',
          'Mục đích khác',
        ],
      },
      {
        name: 'note',
        key: 'note',
        label: 'Ghi chú bổ sung (Nơi nhận giấy xác nhận)',
        type: 'text',
        required: false,
      },
    ],
    requiresAttachment: 'none',
    attachmentGuide: '',
    allowAlumni: false,
    isActive: true,
  },
  {
    code: 'GIAY_GIOI_THIEU',
    name: 'Giấy giới thiệu liên hệ thực tập / thu thập số liệu khóa luận',
    department: 'DAO_TAO',
    icon: 'business-outline',
    description:
      'Cấp giấy giới thiệu chính thức của Nhà trường để sinh viên đến liên hệ thực tập nghề nghiệp, thực tập tốt nghiệp hoặc thu thập số liệu tại cơ quan, doanh nghiệp.',
    displayOrder: 2,
    slaHours: 24,
    assigneeName: 'Chuyên viên Phòng Đào tạo',
    assigneeEmail: 'phongdaotao@tuaf.edu.vn',
    assigneePhone: '0208.3855.222',
    leaderName: 'Trưởng phòng Đào tạo',
    leaderEmail: 'truongphong.daotao@tuaf.edu.vn',
    isPaid: false,
    feeAmount: 0,
    postalFeeAmount: 30000,
    bankAccountInfo: DEFAULT_BANK_INFO,
    deliveryOptions: ['digital_pdf', 'office_pickup'],
    pickupLocation: 'Phòng Đào tạo (Tầng 1 - Nhà Trung tâm)',
    formSchema: [
      {
        name: 'companyName',
        key: 'companyName',
        label: 'Tên cơ quan / doanh nghiệp đến liên hệ',
        type: 'text',
        required: true,
      },
      {
        name: 'internshipPeriod',
        key: 'internshipPeriod',
        label: 'Thời gian thực tập / liên hệ dự kiến (Từ ngày - Đến ngày)',
        type: 'text',
        required: true,
      },
      {
        name: 'advisorName',
        key: 'advisorName',
        label: 'Giảng viên hướng dẫn (nếu có)',
        type: 'text',
        required: false,
      },
    ],
    requiresAttachment: 'optional',
    attachmentGuide: 'Đề cương thực tập hoặc công văn tiếp nhận của đơn vị (nếu có).',
    allowAlumni: false,
    isActive: true,
  },
  {
    code: 'CAP_LAI_THE_SV',
    name: 'Cấp lại Thẻ sinh viên (Mất / Hỏng / Mờ thông tin)',
    department: 'CTSV',
    icon: 'card-outline',
    description:
      'Làm lại thẻ sinh viên tích hợp thư viện khi bị mất, gãy hỏng hoặc mờ thông tin.',
    displayOrder: 3,
    slaHours: 48,
    assigneeName: 'Chuyên viên Phòng CTSV',
    assigneeEmail: 'ctsv@tuaf.edu.vn',
    assigneePhone: '0208.3855.555',
    leaderName: 'Trưởng phòng Công tác Sinh viên',
    leaderEmail: 'truongphong.ctsv@tuaf.edu.vn',
    isPaid: true,
    feeAmount: 40000,
    postalFeeAmount: 30000,
    bankAccountInfo: DEFAULT_BANK_INFO,
    deliveryOptions: ['office_pickup'],
    pickupLocation: 'Phòng Công tác HSSV (Tầng 1 - Nhà Trung tâm)',
    formSchema: [
      {
        name: 'reissueReason',
        key: 'reissueReason',
        label: 'Lý do xin cấp lại thẻ',
        type: 'select',
        required: true,
        options: ['Làm mất thẻ', 'Thẻ bị gãy / hỏng chip', 'Thay đổi thông tin cá nhân'],
      },
    ],
    requiresAttachment: 'optional',
    attachmentGuide: 'Ảnh thẻ 3x4 nền xanh/trắng rõ nét (nếu muốn cập nhật ảnh thẻ mới).',
    allowAlumni: false,
    isActive: true,
  },
  {
    code: 'BAN_SAO_BANG_TN',
    name: 'Cấp bản sao Bằng tốt nghiệp / Bảng điểm từ sổ gốc (Cho SV & Cựu SV)',
    department: 'DAO_TAO',
    icon: 'school-outline',
    description:
      'Cấp bản sao văn bằng tốt nghiệp đại học/sau đại học từ sổ gốc theo Thông tư 21/2019/TT-BGDĐT. Hỗ trợ nhận trực tiếp hoặc gửi chuyển phát nhanh Bưu điện về tận nhà.',
    displayOrder: 4,
    slaHours: 72,
    assigneeName: 'Chuyên viên Quản lý Văn bằng - P. Đào tạo',
    assigneeEmail: 'vanbang.daotao@tuaf.edu.vn',
    assigneePhone: '0208.3855.222',
    leaderName: 'Trưởng phòng Đào tạo',
    leaderEmail: 'truongphong.daotao@tuaf.edu.vn',
    isPaid: true,
    feeAmount: 50000,
    postalFeeAmount: 30000,
    bankAccountInfo: DEFAULT_BANK_INFO,
    deliveryOptions: ['office_pickup', 'postal_delivery'],
    pickupLocation: 'Phòng Đào tạo (Tầng 1 - Nhà Trung tâm)',
    formSchema: [
      {
        name: 'diplomaNumber',
        key: 'diplomaNumber',
        label: 'Số hiệu bằng / Số vào sổ gốc (nếu có)',
        type: 'text',
        required: false,
      },
    ],
    requiresAttachment: 'required',
    attachmentGuide: 'Bắt buộc đính kèm ảnh chụp mặt trước Căn cước công dân (CCCD) để đối chiếu sổ gốc.',
    allowAlumni: true,
    isActive: true,
  },

  // ================= GIAI ĐOẠN 2: MỞ RỘNG CUỐN CHIẾU (isActive = false mặc định) =================
  {
    code: 'BANG_DIEM_QR',
    name: 'Cấp bảng điểm học tập tích lũy (Bản điện tử QR / Bản giấy dấu đỏ)',
    department: 'DAO_TAO',
    icon: 'stats-chart-outline',
    description:
      'Cấp bảng điểm học tập toàn khóa hoặc theo học kỳ phục vụ xét học bổng, du học, xin việc.',
    displayOrder: 5,
    slaHours: 48,
    assigneeName: 'Chuyên viên Phòng Đào tạo',
    assigneeEmail: 'phongdaotao@tuaf.edu.vn',
    leaderName: 'Trưởng phòng Đào tạo',
    leaderEmail: 'truongphong.daotao@tuaf.edu.vn',
    isPaid: true,
    feeAmount: 20000,
    postalFeeAmount: 30000,
    bankAccountInfo: DEFAULT_BANK_INFO,
    deliveryOptions: ['digital_pdf', 'office_pickup', 'postal_delivery'],
    pickupLocation: 'Phòng Đào tạo (Tầng 1 - Nhà Trung tâm)',
    formSchema: [
      {
        name: 'semesterScope',
        key: 'semesterScope',
        label: 'Phạm vi bảng điểm',
        type: 'select',
        required: true,
        options: ['Toàn khóa học đến hiện tại', 'Năm học gần nhất', 'Học kỳ gần nhất'],
      },
    ],
    requiresAttachment: 'none',
    attachmentGuide: '',
    allowAlumni: true,
    isActive: false,
  },
  {
    code: 'DON_HOAN_THI',
    name: 'Đơn xin hoãn thi / dự thi bổ sung kết thúc học phần',
    department: 'KHAO_THI',
    icon: 'calendar-clear-outline',
    description:
      'Giải quyết đơn xin hoãn thi kết thúc học phần vì lý do ốm đau nằm viện, tai nạn hoặc việc đặc biệt đột xuất có minh chứng.',
    displayOrder: 6,
    slaHours: 72,
    assigneeName: 'Chuyên viên Phòng Khảo thí & ĐBCL',
    assigneeEmail: 'khaothi@tuaf.edu.vn',
    leaderName: 'Trưởng phòng Khảo thí & ĐBCL',
    leaderEmail: 'truongphong.khaothi@tuaf.edu.vn',
    isPaid: false,
    feeAmount: 0,
    postalFeeAmount: 0,
    bankAccountInfo: DEFAULT_BANK_INFO,
    deliveryOptions: ['digital_pdf'],
    pickupLocation: 'Phòng Khảo thí & ĐBCL (Nhà Trung tâm)',
    formSchema: [
      { name: 'courseName', key: 'courseName', label: 'Tên học phần & Mã học phần xin hoãn thi', type: 'text', required: true },
      { name: 'examDate', key: 'examDate', label: 'Ngày thi theo lịch', type: 'text', required: true },
      { name: 'reason', key: 'reason', label: 'Lý do xin hoãn thi', type: 'text', required: true },
    ],
    requiresAttachment: 'required',
    attachmentGuide: 'Giấy ra viện, giấy xác nhận y tế hoặc minh chứng sự việc đột xuất.',
    allowAlumni: false,
    isActive: false,
  },
  {
    code: 'PHUC_KHAO_BAI_THI',
    name: 'Đơn xin phúc khảo điểm bài thi kết thúc học phần',
    department: 'KHAO_THI',
    icon: 'search-circle-outline',
    description: 'Tiếp nhận yêu cầu chấm phúc khảo bài thi kết thúc học phần trong thời hạn quy định.',
    displayOrder: 7,
    slaHours: 72,
    assigneeName: 'Chuyên viên Phòng Khảo thí & ĐBCL',
    assigneeEmail: 'khaothi@tuaf.edu.vn',
    leaderName: 'Trưởng phòng Khảo thí & ĐBCL',
    leaderEmail: 'truongphong.khaothi@tuaf.edu.vn',
    isPaid: true,
    feeAmount: 30000,
    postalFeeAmount: 0,
    bankAccountInfo: DEFAULT_BANK_INFO,
    deliveryOptions: ['digital_pdf'],
    pickupLocation: 'Phòng Khảo thí & ĐBCL (Nhà Trung tâm)',
    formSchema: [
      { name: 'courseName', key: 'courseName', label: 'Tên học phần cần phúc khảo', type: 'text', required: true },
      { name: 'examDate', key: 'examDate', label: 'Ngày thi & Phòng thi', type: 'text', required: true },
      { name: 'currentScore', key: 'currentScore', label: 'Điểm thi hiện tại đã công bố', type: 'text', required: true },
    ],
    requiresAttachment: 'none',
    attachmentGuide: '',
    allowAlumni: false,
    isActive: false,
  },
  {
    code: 'BAO_LUU_KET_QUA',
    name: 'Đơn xin nghỉ học tạm thời & Bảo lưu kết quả học tập',
    department: 'DAO_TAO',
    icon: 'pause-circle-outline',
    description: 'Giải quyết thủ tục xin nghỉ học tạm thời và bảo lưu kết quả học tập theo quy chế đào tạo tín chỉ.',
    displayOrder: 8,
    slaHours: 72,
    assigneeName: 'Chuyên viên Phòng Đào tạo',
    assigneeEmail: 'phongdaotao@tuaf.edu.vn',
    leaderName: 'Trưởng phòng Đào tạo',
    leaderEmail: 'truongphong.daotao@tuaf.edu.vn',
    isPaid: false,
    feeAmount: 0,
    postalFeeAmount: 0,
    bankAccountInfo: DEFAULT_BANK_INFO,
    deliveryOptions: ['digital_pdf', 'office_pickup'],
    pickupLocation: 'Phòng Đào tạo (Tầng 1 - Nhà Trung tâm)',
    formSchema: [
      { name: 'preserveDuration', key: 'preserveDuration', label: 'Thời gian xin bảo lưu (Từ học kỳ - Đến học kỳ)', type: 'text', required: true },
      { name: 'reason', key: 'reason', label: 'Lý do xin nghỉ học tạm thời', type: 'text', required: true },
    ],
    requiresAttachment: 'required',
    attachmentGuide: 'Đơn có chữ ký xác nhận của phụ huynh và giấy tờ minh chứng (nếu bảo lưu vì lý do y tế/NVQS).',
    allowAlumni: false,
    isActive: false,
  },
  {
    code: 'MIEN_GIAM_HOC_PHI',
    name: 'Hồ sơ đề nghị Miễn giảm học phí / Trợ cấp xã hội (Nghị định 81)',
    department: 'CTSV',
    icon: 'shield-checkmark-outline',
    description: 'Tiếp nhận và thẩm định hồ sơ miễn giảm học phí, hỗ trợ chi phí học tập đối với sinh viên thuộc diện chính sách.',
    displayOrder: 9,
    slaHours: 72,
    assigneeName: 'Chuyên viên Chế độ Chính sách - P. CTSV',
    assigneeEmail: 'ctsv@tuaf.edu.vn',
    leaderName: 'Trưởng phòng Công tác Sinh viên',
    leaderEmail: 'truongphong.ctsv@tuaf.edu.vn',
    isPaid: false,
    feeAmount: 0,
    postalFeeAmount: 0,
    bankAccountInfo: DEFAULT_BANK_INFO,
    deliveryOptions: ['digital_pdf'],
    pickupLocation: 'Phòng Công tác HSSV (Tầng 1 - Nhà Trung tâm)',
    formSchema: [
      {
        name: 'policyCategory',
        key: 'policyCategory',
        label: 'Đối tượng hưởng chính sách',
        type: 'select',
        required: true,
        options: [
          'Con thương binh / liệt sĩ / người có công',
          'Sinh viên dân tộc thiểu số thuộc hộ nghèo / cận nghèo',
          'Sinh viên dân tộc thiểu số rất ít người',
          'Sinh viên khuyết tật / mồ côi cả cha lẫn mẹ',
        ],
      },
    ],
    requiresAttachment: 'required',
    attachmentGuide: 'Bản chụp giấy chứng nhận hộ nghèo/cận nghèo hoặc giấy xác nhận đối tượng chính sách có dấu đỏ.',
    allowAlumni: false,
    isActive: false,
  },
  {
    code: 'DANG_KY_KTX',
    name: 'Đăng ký nội trú Ký túc xá / Xác nhận ngoại trú sinh viên',
    department: 'KTX',
    icon: 'home-outline',
    description: 'Đăng ký chỗ ở nội trú tại Ký túc xá sinh viên TUAF hoặc xin giấy xác nhận hoàn thành đăng ký ngoại trú.',
    displayOrder: 10,
    slaHours: 48,
    assigneeName: 'Ban Quản lý Ký túc xá',
    assigneeEmail: 'ktx@tuaf.edu.vn',
    leaderName: 'Trưởng Ban Quản lý Ký túc xá',
    leaderEmail: 'truongban.ktx@tuaf.edu.vn',
    isPaid: false,
    feeAmount: 0,
    postalFeeAmount: 0,
    bankAccountInfo: DEFAULT_BANK_INFO,
    deliveryOptions: ['digital_pdf', 'office_pickup'],
    pickupLocation: 'Văn phòng Ban Quản lý Ký túc xá TUAF',
    formSchema: [
      {
        name: 'requestType',
        key: 'requestType',
        label: 'Loại yêu cầu',
        type: 'select',
        required: true,
        options: ['Đăng ký vào ở Ký túc xá', 'Xin xác nhận ngoại trú', 'Xin chuyển phòng / trả phòng KTX'],
      },
      { name: 'addressOrRoom', key: 'addressOrRoom', label: 'Khu KTX mong muốn hoặc Địa chỉ tạm trú ngoại trú', type: 'text', required: true },
    ],
    requiresAttachment: 'none',
    attachmentGuide: '',
    allowAlumni: false,
    isActive: false,
  },
];

function normalizeDeliveryMethodKey(opt) {
  if (opt === 'digital') return 'digital_pdf';
  if (opt === 'physical_pickup') return 'office_pickup';
  return opt;
}

function getDefaultPickupLocation(code, department) {
  const tpl = INITIAL_SERVICES.find((s) => s.code === code);
  if (tpl && tpl.pickupLocation) return tpl.pickupLocation;
  const dept = String(department || '').toUpperCase();
  if (dept.includes('DAO_TAO') || dept.includes('ĐÀO TẠO')) {
    return 'Phòng Đào tạo (Tầng 1 - Nhà Trung tâm)';
  }
  if (dept.includes('KHAO_THI') || dept.includes('KHẢO THÍ')) {
    return 'Phòng Khảo thí & ĐBCL (Nhà Trung tâm)';
  }
  if (dept.includes('KTX') || dept.includes('KÝ TÚC XÁ')) {
    return 'Văn phòng Ban Quản lý Ký túc xá TUAF';
  }
  return 'Phòng Công tác HSSV (Tầng 1 - Nhà Trung tâm)';
}

/**
 * Khởi tạo danh mục dịch vụ Một cửa mặc định nếu bảng ServiceCatalog đang trống
 * Đồng thời tự động chuẩn hóa các bản ghi cũ nếu có lệch tên trường formSchema hoặc deliveryOptions
 */
async function seedInitialServices() {
  try {
    const existingRows = await ServiceCatalog.findAll();
    if (existingRows.length > 0) {
      for (const row of existingRows) {
        let changed = false;
        const expectedDefaultPickup = getDefaultPickupLocation(row.code, row.department);
        if (!row.pickupLocation || !String(row.pickupLocation).trim()) {
          row.pickupLocation = expectedDefaultPickup;
          changed = true;
        } else if (String(row.pickupLocation).includes('Quầy Một cửa')) {
          row.pickupLocation = String(row.pickupLocation)
            .replace(/^Quầy Một cửa\s*-\s*/i, '')
            .trim() || expectedDefaultPickup;
          changed = true;
        }
        if (Array.isArray(row.deliveryOptions)) {
          const nextDeliv = row.deliveryOptions.map(normalizeDeliveryMethodKey);
          if (JSON.stringify(nextDeliv) !== JSON.stringify(row.deliveryOptions)) {
            row.deliveryOptions = nextDeliv;
            changed = true;
          }
        }
        if (Array.isArray(row.formSchema)) {
          const filteredSchema = row.formSchema.filter((f) => {
            const fKey = f?.name || f?.key;
            return fKey !== 'graduationYear';
          });
          if (filteredSchema.length !== row.formSchema.length) {
            changed = true;
          }
          const nextSchema = filteredSchema.map((f) => {
            if (f && !f.name && f.key) {
              changed = true;
              return { ...f, name: f.key };
            }
            if (f && !f.key && f.name) {
              changed = true;
              return { ...f, key: f.name };
            }
            return f;
          });
          if (changed) {
            row.formSchema = nextSchema;
          }
        }
        if (changed) {
          await row.save();
        }
      }
      return { seeded: false, count: existingRows.length };
    }

    await ServiceCatalog.bulkCreate(INITIAL_SERVICES);
    console.log(`✅ [OneStopSeeder] Đã khởi tạo ${INITIAL_SERVICES.length} thủ tục Dịch vụ Một cửa mẫu!`);
    return { seeded: true, count: INITIAL_SERVICES.length };
  } catch (error) {
    console.warn('⚠️ [OneStopSeeder] Không thể khởi tạo dữ liệu mẫu Một cửa:', error.message);
    return { seeded: false, error: error.message };
  }
}

module.exports = {
  DEFAULT_BANK_INFO,
  INITIAL_SERVICES,
  seedInitialServices,
};
