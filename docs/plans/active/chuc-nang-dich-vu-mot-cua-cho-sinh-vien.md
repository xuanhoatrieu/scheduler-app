# Kế hoạch Triển khai Chi tiết: Phân hệ Dịch vụ Một cửa Số (TUAF One-Stop Service)

- **Mã kế hoạch:** `PLAN-TUAF-OSS-202610`
- **Story ID:** `US-OSS-01`
- **Tài liệu đặc tả gốc:** [TUAF_ONE_STOP_SERVICE_SPECIFICATION.md](file:///home/trieuhoa/lichhoc-app/docs/TUAF_ONE_STOP_SERVICE_SPECIFICATION.md)
- **Áp dụng cho:** Backend API (`backend/`), Admin & Web Portal (`backend/public/`), Mobile App (`mobile/`)
- **Phương án đã chốt:**
  1. **App Sinh viên**: Thêm Tab **"Một Cửa"** trực tiếp trên thanh Bottom Navigation ([AppNavigator.js](file:///home/trieuhoa/lichhoc-app/mobile/navigation/AppNavigator.js)).
  2. **Kênh xử lý của Cán bộ**: Hỗ trợ xử lý hồ sơ trên **CẢ Web Admin** ([index.html](file:///home/trieuhoa/lichhoc-app/backend/public/admin/index.html)) lẫn trong mục **"Tiện ích"** trên App Giảng viên/Cán bộ ([LecturerUtilitiesScreen.js](file:///home/trieuhoa/lichhoc-app/mobile/screens/lecturer/LecturerUtilitiesScreen.js)).
  3. **Phạm vi**: Triển khai trọn gói cả 4 giai đoạn (Backend & SLA Engine + Quản trị Admin động + App Sinh viên & Cán bộ + Cổng Web Cựu SV `/onegate` & Xác thực QR `/verify`).
- **Trạng thái:** `Đã phê duyệt kế hoạch chi tiết — Sẵn sàng triển khai (Approved)`

---

## 1. Kết quả Rà soát Hệ thống Hiện tại vs. Bản Đặc tả Một cửa

Qua đối chiếu toàn bộ mã nguồn hiện có (`backend/` và `mobile/`) với bản dự thảo [chuc-nang-dich-vu-mot-cua-cho-sinh-vien.md](file:///home/trieuhoa/lichhoc-app/docs/plans/active/chuc-nang-dich-vu-mot-cua-cho-sinh-vien.md) và [TUAF_ONE_STOP_SERVICE_SPECIFICATION.md](file:///home/trieuhoa/lichhoc-app/docs/TUAF_ONE_STOP_SERVICE_SPECIFICATION.md), dưới đây là các điểm kỹ thuật cốt lõi cần chuẩn hóa để khớp 100% với kiến trúc dự án:

1. **Chuẩn hóa Khóa chính & Khóa ngoại (`UUID` thay vì `INTEGER` cho `User`)**:
   - Trong hệ thống hiện tại ([User.js](file:///home/trieuhoa/lichhoc-app/backend/models/User.js#L4-L9)), bảng `Users` dùng `id: DataTypes.UUID` (UUIDv4).
   - Do đó, các cột liên kết tài khoản cán bộ/người dùng trong `ServiceCatalog` (`assigneeUserId`), `ServiceRequest` (`studentUserId`, `assignedTo`, `overdueExplainedBy`, `paymentConfirmedBy`), và `ServiceRequestLog` (`actorId`) phải dùng kiểu **`DataTypes.UUID`** để đồng bộ hoàn toàn với `Users.id` và hệ thống Push Notification ([notificationCenter.js](file:///home/trieuhoa/lichhoc-app/backend/services/notificationCenter.js)).

2. **Tận dụng Hạ tầng Thông báo Đẩy (`NotificationOutbox`) & Email (`emailReportService`) sẵn có**:
   - Hệ thống đã có sẵn [`notificationCenter.js`](file:///home/trieuhoa/lichhoc-app/backend/services/notificationCenter.js) + bảng [`NotificationOutbox`](file:///home/trieuhoa/lichhoc-app/backend/models/NotificationOutbox.js) (xử lý gửi Expo Push theo lô, tự động retry) và [`emailReportService.js`](file:///home/trieuhoa/lichhoc-app/backend/services/emailReportService.js) (Nodemailer SMTP).
   - Phân hệ Một cửa sẽ tích hợp trực tiếp vào 2 dịch vụ này để bắn **Push Notification + Email** tức thời cho:
     - **Cán bộ thụ lý** khi có đơn mới hoặc khi sinh viên tải biên lai nộp phí.
     - **Sinh viên** khi hồ sơ chuyển trạng thái (Đã duyệt phí, Đang xử lý, Có kết quả PDF / Sẵn sàng nhận tại quầy / Đã gửi bưu điện, hoặc Xin lỗi gia hạn khi quá hạn).
     - **Lãnh đạo phòng (`leaderEmail`)** khi hồ sơ quá hạn SLA hoặc khi cán bộ nộp giải trình.

3. **Cơ chế Upload File (Minh chứng, Biên lai chuyển khoản, File PDF kết quả)**:
   - Tương tự [`documentRoutes.js`](file:///home/trieuhoa/lichhoc-app/backend/routes/documentRoutes.js#L134-L160), hệ thống đã hỗ trợ truyền tải Base64 JSON (`express.json({ limit: '50mb' })` tại [server.js](file:///home/trieuhoa/lichhoc-app/backend/server.js#L67)) mà không cần cài thêm thư viện ngoài.
   - Lưu trữ phân tách an toàn tại `backend/public/uploads/onegate/{attachments,receipts,results}` với kiểm tra định dạng (`jpg`, `png`, `pdf`), giới hạn dung lượng (≤ 10MB/file) và chống Path Traversal.

4. **Vị trí trên Mobile App cho Sinh viên & Cán bộ**:
   - **Sinh viên ([AppNavigator.js](file:///home/trieuhoa/lichhoc-app/mobile/navigation/AppNavigator.js))**: Hiện có 5 Bottom Tabs (`Lịch`, `Thông Báo`, `Điểm Số`, `Học Phí`, `Hồ Sơ`). Có thể thêm Tab **"Một Cửa"** trên thanh điều hướng dưới đáy (hoặc đặt lối tắt nổi bật trong màn hình Hồ sơ / Tiện ích).
   - **Cán bộ / Giảng viên ([LecturerNavigator.js](file:///home/trieuhoa/lichhoc-app/mobile/navigation/LecturerNavigator.js))**: Đã có sẵn tab **"Tiện ích"** ([LecturerUtilitiesScreen.js](file:///home/trieuhoa/lichhoc-app/mobile/screens/lecturer/LecturerUtilitiesScreen.js)) — rất thuận tiện để bổ sung mục **"Xử lý Hồ sơ Một cửa"** (duyệt đơn, duyệt biên lai, quét mã Pickup QR, nhập giải trình quá hạn) ngay trên điện thoại của cán bộ, song song với giao diện Web Admin.

---

## 2. Kiến trúc Dữ liệu Chi tiết (Database Models — PostgreSQL / Sequelize)

### 2.1. Bảng `ServiceCatalog` (`backend/models/ServiceCatalog.js`)
Quản lý danh mục thủ tục hành chính động do Admin cấu hình (Không hardcode trên App):
- `id`: `INTEGER` (PK, Auto Increment)
- `code`: `STRING(50)` (Unique, Not Null — VD: `XN_SINH_VIEN`, `XN_VAY_VON`, `GIAY_GIOI_THIEU`, `CAP_LAI_THE_SV`, `BAN_SAO_BANG`)
- `name`: `STRING(255)` (Not Null — Tên thủ tục hiển thị)
- `department`: `STRING(100)` (Not Null — `CTSV`, `DAO_TAO`, `KHAO_THI`, `KTX`, `KHTC`)
- `icon`: `STRING(50)` (Default `'document-text-outline'`)
- `description`: `TEXT` (Mô tả & hướng dẫn thủ tục)
- `displayOrder`: `INTEGER` (Default `0` — Thứ tự ưu tiên hiển thị)
- `slaHours`: `INTEGER` (Default `24` — Số giờ làm việc cam kết xử lý)
- `assigneeName`: `STRING(120)` (Họ tên cán bộ thụ lý mặc định)
- `assigneeEmail`: `STRING(150)` (Email công vụ cán bộ nhận thông báo đơn mới)
- `assigneePhone`: `STRING(30)` (SĐT hỗ trợ)
- `assigneeUserId`: `UUID` (Nullable, FK `Users.id` — Tài khoản App của cán bộ để nhận Push Notification & xử lý trên App)
- `leaderName`: `STRING(120)` (Họ tên Trưởng/Phó phòng phụ trách)
- `leaderEmail`: `STRING(150)` (Email Lãnh đạo nhận cảnh báo quá hạn & giải trình)
- `isPaid`: `BOOLEAN` (Default `false`)
- `feeAmount`: `INTEGER` (Default `0` — Đơn giá lệ phí VNĐ)
- `postalFeeAmount`: `INTEGER` (Default `30000` — Cước chuyển phát bưu điện nếu chọn gửi tận nhà)
- `bankAccountInfo`: `JSONB` (`{ bankId: '970405', bankName: 'Agribank CN Thái Nguyên', accountNo: '888866669999', accountName: 'TRUONG DAI HOC NONG LAM TN' }`)
- `deliveryOptions`: `JSONB` (Default `['digital', 'physical_pickup']` — Các hình thức trả kết quả cho phép: `'digital'`, `'physical_pickup'`, `'postal_delivery'`)
- `formSchema`: `JSONB` (Default `[]` — Danh sách các trường nhập liệu động bổ sung: `[{ key, label, type: 'text'|'select'|'number', required, options }]`)
- `requiresAttachment`: `STRING(20)` (Default `'none'` — `'none' | 'optional' | 'required'`)
- `attachmentGuide`: `TEXT` (Hướng dẫn giấy tờ minh chứng cần chụp)
- `allowAlumni`: `BOOLEAN` (Default `false` — Cho phép Cựu sinh viên nộp qua Web Portal `/onegate`)
- `isActive`: `BOOLEAN` (Default `true` — Công tắc Bật/Tắt hiển thị tức thì trên Mobile App & Web)

### 2.2. Bảng `ServiceRequest` (`backend/models/ServiceRequest.js`)
Lưu trữ từng hồ sơ yêu cầu của Sinh viên / Cựu sinh viên:
- `id`: `INTEGER` (PK, Auto Increment)
- `requestCode`: `STRING(32)` (Unique, Not Null — VD: `MC-2026-0001`)
- `serviceId`: `INTEGER` (Not Null, FK `ServiceCatalog.id`)
- `isAlumni`: `BOOLEAN` (Default `false`)
- `studentUserId`: `UUID` (Nullable, FK `Users.id`)
- `studentUsername`: `STRING(50)` (MSSV — Nullable đối với cựu SV không nhớ MSSV)
- `studentFullName`: `STRING(120)` (Họ tên người yêu cầu)
- `studentClass`: `STRING(80)` (Lớp hành chính / Ngành học)
- `studentPhone`: `STRING(30)` (SĐT liên hệ)
- `studentEmail`: `STRING(150)` (Email nhận kết quả)
- `alumniInfo`: `JSONB` (Nullable — `{ cccd, dob, graduationYear, major, cccdFrontUrl, cccdBackUrl }`)
- `quantity`: `INTEGER` (Default `1` — Số bản đăng ký)
- `formData`: `JSONB` (Default `{}` — Dữ liệu các trường động theo `formSchema` + lý do/ghi chú của SV)
- `attachmentUrls`: `JSONB` (Default `[]` — Danh sách đường dẫn file minh chứng đính kèm)
- `status`: `STRING(32)` (Default `'PENDING'` — `PENDING` | `WAITING_PAYMENT_PROOF` | `WAITING_PAYMENT_CONFIRM` | `PAID` | `PROCESSING` | `APPROVED` | `READY_FOR_PICKUP` | `DELIVERING` | `COMPLETED` | `REJECTED` | `CANCELLED`)
- `deliveryMethod`: `STRING(30)` (Default `'digital'` — `'digital' | 'physical_pickup' | 'postal_delivery'`)
- `postalAddress`: `TEXT` (Địa chỉ nhận bưu phẩm nếu `deliveryMethod === 'postal_delivery'`)
- `postalTrackingNumber`: `STRING(64)` (Mã vận đơn VNPost / Viettel Post)
- `trayLocation`: `STRING(64)` (Số khay/ngăn lưu bản giấy tại Quầy Một cửa — VD: `Khay A2 - P.102`)
- `assignedTo`: `UUID` (Nullable, FK `Users.id` — Cán bộ thụ lý)
- `assignedDepartment`: `STRING(100)`
- `submittedAt`: `DATE` (Not Null)
- `deadlineAt`: `DATE` (Not Null — Tính theo giờ hành chính trừ T7, CN)
- `warningSentAt`: `DATE` (Nullable — Đánh dấu đã gửi cảnh báo sắp hết hạn ≤ 4h)
- `completedAt`: `DATE` (Nullable)
- `pickedUpAt`: `DATE` (Nullable)
- `pickupQrCode`: `STRING(64)` (Mã QR nhận bản giấy tại quầy)
- `isOverdue`: `BOOLEAN` (Default `false`)
- `overdueNotifiedAt`: `DATE` (Nullable)
- `overdueReasonCategory`: `STRING(100)` (Nhóm lý do quá hạn chuẩn hóa)
- `overdueReason`: `TEXT` (Nội dung giải trình chi tiết của cán bộ)
- `overdueExplainedAt`: `DATE` (Nullable)
- `overdueExplainedBy`: `UUID` (Nullable, FK `Users.id`)
- `leaderDirective`: `TEXT` (Ý kiến chỉ đạo của Lãnh đạo trên hồ sơ quá hạn)
- `feeAmount`: `INTEGER` (Default `0` — Tổng lệ phí = Đơn giá × Số bản + Cước bưu điện)
- `paymentStatus`: `STRING(24)` (Default `'UNPAID'` — `'NOT_REQUIRED' | 'UNPAID' | 'PENDING_CONFIRM' | 'PAID' | 'REJECTED_PROOF'`)
- `paymentProofUrl`: `TEXT` (Đường dẫn ảnh biên lai chuyển khoản)
- `paymentConfirmedAt`: `DATE` (Nullable)
- `paymentConfirmedBy`: `UUID` (Nullable, FK `Users.id`)
- `paymentNote`: `TEXT` (Lý do từ chối biên lai nếu có)
- `staffNote`: `TEXT` (Phản hồi/hướng dẫn của cán bộ gửi sinh viên hoặc lý do từ chối đơn)
- `resultPdfUrl`: `TEXT` (Đường dẫn file PDF kết quả điện tử)
- `verifyQrCode`: `STRING(64)` (Unique — Mã định danh xác thực văn bản công khai `/verify/:code`)
- `rating`: `INTEGER` (Nullable, 1–5 sao)
- `ratingCriteria`: `JSONB` (Nullable — `{ speed, attitude, quality }`)
- `ratingComment`: `TEXT` (Nullable)
- `ratedAt`: `DATE` (Nullable)

### 2.3. Bảng `ServiceRequestLog` (`backend/models/ServiceRequestLog.js`)
Nhật ký kiểm toán (Audit Trail) toàn bộ vòng đời hồ sơ:
- `id`: `INTEGER` (PK, Auto Increment)
- `requestId`: `INTEGER` (Not Null, FK `ServiceRequest.id`)
- `actorId`: `UUID` (Nullable, FK `Users.id`)
- `actorName`: `STRING(120)`
- `actorRole`: `STRING(40)` (`student` | `alumni` | `staff` | `admin` | `system`)
- `action`: `STRING(40)` (`SUBMIT` | `UPLOAD_RECEIPT` | `PAYMENT_CONFIRMED` | `PAYMENT_REJECTED` | `START_PROCESS` | `OVERDUE_FLAGGED` | `OVERDUE_EXPLAIN` | `LEADER_DIRECTIVE` | `APPROVE_DIGITAL` | `READY_PICKUP` | `POSTAL_DISPATCH` | `HANDOVER_COMPLETE` | `REJECT` | `CANCEL` | `RATE`)
- `fromStatus`: `STRING(32)`
- `toStatus`: `STRING(32)`
- `note`: `TEXT`
- `createdAt`: `DATE`

---

## 3. Thiết kế Chi tiết các Phân hệ & Luồng Nghiệp vụ

### Giai đoạn 1: Nền tảng Backend, Công cụ Tính SLA, VietQR & Tự sinh PDF Xác thực
1. **Bộ tính thời hạn SLA giờ hành chính (`backend/utils/slaCalculator.js`)**:
   - Hàm `calculateBusinessDeadline(submittedAt, slaHours)`: Cộng số giờ làm việc (bỏ qua Thứ 7 và Chủ Nhật) để ra `deadlineAt`.
   - Hàm `evaluateSlaStatus(request, now)`: Trả về trạng thái `in_sla` (🟢), `near_due` (🟡 còn ≤ 4h), hoặc `overdue` (🔴 `now > deadlineAt`), kèm số giờ còn lại / số giờ trễ.
2. **Bộ sinh mã VietQR & Mã Hồ sơ (`backend/utils/oneStopHelpers.js`)**:
   - Sinh mã hồ sơ tuần tự `MC-YYYY-XXXX` và mã xác thực `verifyQrCode` ngẫu nhiên an toàn (`crypto.randomBytes`).
   - Sinh URL ảnh VietQR chuẩn Napas247 (`https://img.vietqr.io/image/<bankId>-<accountNo>-compact2.png?amount=<feeAmount>&addInfo=<syntax>&accountName=<accountName>`).
3. **Bộ sinh Văn bản Điện tử & Cổng Xác thực QR Công khai (`backend/services/oneStopPdfService.js`)**:
   - Hỗ trợ cán bộ tải lên file PDF kết quả HOẶC tự động sinh văn bản xác nhận điện tử chuẩn mẫu Trường ĐH Nông Lâm Thái Nguyên có nhúng mã QR trỏ tới `https://scheduler.tuaf.edu.vn/verify/<verifyQrCode>`.
4. **Seeder 10 Thủ tục Mẫu (`backend/services/oneStopSeeder.js`)**:
   - Tự động khởi tạo 10 thủ tục thuộc 2 giai đoạn (trong đó bật sẵn `isActive = true` cho 4 thủ tục Giai đoạn 1: *Giấy xác nhận sinh viên*, *Giấy giới thiệu thực tập*, *Cấp lại thẻ sinh viên*, *Cấp bản sao bằng tốt nghiệp*; 6 thủ tục Giai đoạn 2 để `isActive = false` chờ Admin bật cuốn chiếu).

### Giai đoạn 2: Hệ thống API Một cửa & Cron Giám sát SLA (`backend/routes/oneStopRoutes.js` & `backend/jobs/oneStopSlaJob.js`)
1. **Nhóm API Quản trị viên (`/api/admin/services/*`)**:
   - `GET /api/admin/services`: Danh sách toàn bộ thủ tục (lọc theo phòng ban, trạng thái).
   - `POST /api/admin/services`: Thêm mới thủ tục động.
   - `PUT /api/admin/services/:id`: Cập nhật cấu hình thủ tục (nhân sự, SLA, lệ phí, formSchema, deliveryOptions).
   - `PATCH /api/admin/services/:id/toggle`: Bật/Tắt nhanh `isActive` 1 chạm.
   - `DELETE /api/admin/services/:id`: Xóa/lưu trữ thủ tục.
   - `GET /api/admin/services/overview`: Thống kê KPI toàn trường, theo phòng ban, theo cán bộ, doanh thu lệ phí, điểm CSAT và danh sách hồ sơ quá hạn + giải trình.
   - `POST /api/admin/services/requests/:id/directive`: Lãnh đạo ghi ý kiến chỉ đạo vào hồ sơ quá hạn.
2. **Nhóm API Sinh viên & Cựu sinh viên (`/api/services/*`)**:
   - `GET /api/services`: Lấy danh mục thủ tục đang mở (`isActive = true`, hỗ trợ lọc `alumni = true` cho cổng cựu SV).
   - `POST /api/services/requests`: Nộp hồ sơ mới (tự động lấy thông tin SV từ token hoặc nhận `alumniInfo` cho cựu SV).
   - `POST /api/services/requests/:id/upload-receipt`: Tải ảnh biên lai chuyển khoản lệ phí.
   - `GET /api/services/my-requests`: Danh sách hồ sơ của sinh viên đang đăng nhập.
   - `GET /api/services/requests/:id`: Chi tiết hồ sơ, lịch sử `ServiceRequestLog`, link VietQR, file PDF kết quả, mã Pickup QR.
   - `POST /api/services/requests/:id/cancel`: Hủy yêu cầu khi còn ở trạng thái `PENDING` / `WAITING_PAYMENT_PROOF`.
   - `POST /api/services/requests/:id/rate`: Đánh giá mức độ hài lòng CSAT (1–5 sao + nhận xét).
   - `GET /api/services/public/track`: Tra cứu tiến độ công khai bằng `requestCode` + `MSSV/CCCD`.
   - `GET /api/services/verify/:verifyQrCode`: API & Trang HTML công khai (`/verify/:code`) xác thực tính pháp lý của giấy tờ.
3. **Nhóm API Cán bộ Thụ lý & Tiếp tân Một cửa (`/api/services/staff/*`)**:
   - `GET /api/services/staff/requests`: Danh sách hồ sơ cần xử lý (lọc theo tab: `waiting_payment`, `processing`, `overdue`, `ready_pickup`, `completed`).
   - `POST /api/services/staff/requests/:id/confirm-payment`: Duyệt biên lai chuyển khoản 1 chạm $\rightarrow$ `PAID` / `PROCESSING`.
   - `POST /api/services/staff/requests/:id/reject-payment`: Từ chối biên lai (ảnh mờ/thiếu tiền) $\rightarrow$ yêu cầu SV tải lại.
   - `POST /api/services/staff/requests/:id/explain-overdue`: Nộp báo cáo giải trình khi hồ sơ bị quá hạn SLA (bắt buộc trước khi được phép duyệt hoàn thành hồ sơ quá hạn).
   - `PATCH /api/services/staff/requests/:id/process`: Cập nhật trạng thái xử lý, phê duyệt xuất PDF (Nhánh A), xếp khay hẹn nhận bản giấy tại quầy (Nhánh B), hoặc nhập mã vận đơn bưu điện (Nhánh C).
   - `POST /api/services/staff/requests/:id/handover`: Quét/nhập mã `pickupQrCode` hoặc `requestCode` tại quầy để xác nhận bàn giao bản giấy $\rightarrow$ `COMPLETED`.
4. **Cron Job Giám sát SLA & Báo cáo Tuần (`backend/jobs/oneStopSlaJob.js`)**:
   - Chạy định kỳ mỗi 15 phút trong giờ hành chính:
     - Quét các đơn sắp đến hạn (≤ 4h, chưa gửi cảnh báo) $\rightarrow$ bắn Push nhắc cán bộ.
     - Quét các đơn quá hạn (`now > deadlineAt`, `isOverdue = false`) $\rightarrow$ bật cờ `isOverdue = true`, gửi cảnh báo cho Cán bộ + Email CC Lãnh đạo phòng, gửi thông báo xin lỗi gia hạn cho Sinh viên.
   - Chạy lúc 17:00 Thứ Sáu hàng tuần: Gửi Email Weekly Executive Digest cho Ban Giám hiệu (chỉ gửi khi trong tuần có hồ sơ phát sinh).

### Giai đoạn 3: Giao diện Quản trị Admin, Bàn làm việc Cán bộ & Cổng Web Cựu Sinh viên
1. **Trang Admin (`backend/public/admin/index.html`)**:
   - Thêm mục Sidebar **"📋 Dịch vụ Một cửa"** gồm 3 sub-tabs:
     1. **Quản lý Danh mục Thủ tục Động**: Bảng danh sách thủ tục, nút gạt Bật/Tắt `isActive` tức thì, Modal Thêm/Sửa thủ tục đầy đủ 5 nhóm cấu hình (Thông tin chung, Nhân sự & Lãnh đạo, SLA & Lệ phí + STK ngân hàng, Hình thức trả & Minh chứng, Cấu hình trường nhập liệu động `formSchema`).
     2. **Xử lý Hồ sơ & Duyệt Lệ phí (Bàn làm việc Một cửa trên Web)**: Lọc đơn theo trạng thái, Lightbox phóng to ảnh biên lai để duyệt tiền 1 chạm, Modal bắt buộc nhập giải trình khi đơn quá hạn, Xuất PDF xác thực / Nhập số khay bản giấy / Nhập mã vận đơn bưu điện, Ô quét mã Pickup QR bàn giao tại quầy.
     3. **Dashboard Giám sát SLA & Giải trình (Dành cho Lãnh đạo)**: Thống kê KPI đúng hạn/quá hạn, doanh thu lệ phí, điểm CSAT 5 sao theo phòng ban, bảng hồ sơ trễ hạn kèm nguyên văn giải trình của cán bộ và nút nhập ý kiến chỉ đạo.
2. **Cổng Web Cựu Sinh viên & Tra cứu Xác thực QR Công khai (`backend/public/onegate/index.html` & `/verify/:code`)**:
   - Trang `/onegate`: Phục vụ Cựu sinh viên nộp hồ sơ trực tuyến không cần tài khoản App (nhập CCCD, thông tin khóa học, tải ảnh CCCD, chọn nhận qua Bưu điện, quét VietQR nộp phí & tải ảnh biên lai) và tra cứu tiến độ bằng Mã hồ sơ.
   - Trang `/verify/:code`: Giao diện xác thực văn bản điện tử chính thức của Trường ĐH Nông Lâm Thái Nguyên khi quét mã QR trên giấy chứng nhận.

### Giai đoạn 4: Giao diện Mobile App cho Sinh viên & Cán bộ (`mobile/`)
1. **Màn hình Dịch vụ Một cửa cho Sinh viên (`mobile/screens/OneStopServiceScreen.js`)**:
   - **Tab 1 — Danh mục Thủ tục**: Tự động tải từ `GET /api/services`, lọc theo phòng ban / từ khóa, hiển thị rõ thời gian SLA, mức phí (`Miễn phí` / `Có thu phí`), nút **"Nộp hồ sơ"**.
   - **Modal Nộp Hồ sơ Động**: Tự động điền sẵn (pre-fill) Họ tên, MSSV, Lớp từ thông tin tài khoản; tự động hiển thị các trường động theo `formSchema`, chọn hình thức nhận kết quả (`Bản điện tử PDF`, `Nhận bản giấy tại Quầy`, `Gửi Bưu điện`), đính kèm ảnh minh chứng (nếu thủ tục yêu cầu).
   - **Tab 2 — Hồ sơ của tôi & Tiến trình (Stepper Timeline)**:
     - Hiển thị đồng hồ đếm ngược SLA (`🟢 Trong hạn`, `🟡 Sắp đến hạn`, `🔴 Quá hạn - Đã gia hạn`).
     - Nếu thủ tục có phí: Hiển thị **Thẻ VietQR tự động điền số tiền & nội dung `MC...`** + nút tải ảnh chụp biên lai chuyển khoản.
     - Khi có kết quả:
       - Nhánh A: Nút **"Xem / Tải Giấy chứng nhận (PDF có QR)"**.
       - Nhánh B: Thẻ **Mã Pickup QR** + vị trí khay/phòng để xuất trình tại Quầy Một cửa.
       - Nhánh C: Hiển thị **Mã vận đơn Bưu điện** để theo dõi giao hàng.
     - **Modal Đánh giá Hài lòng 5 Sao (CSAT)** sau khi nhận kết quả.
2. **Màn hình Xử lý Một cửa trên App cho Cán bộ (`mobile/screens/lecturer/StaffOneStopScreen.js`)**:
   - Tích hợp vào tab **Tiện ích** của Giảng viên/Cán bộ (`LecturerUtilitiesScreen.js`): Cho phép cán bộ phụ trách duyệt biên lai, cập nhật trạng thái đơn, nhập giải trình quá hạn và xác nhận bàn giao hồ sơ ngay trên điện thoại.

---

## 4. Kế hoạch Kiểm chứng Bảo mật (Security Verification Plan)
Tuân thủ nghiêm ngặt `mandatory-secure-web-skills`:
- **Phân quyền & Chống IDOR (Broken Access Control)**:
  - Sinh viên chỉ được xem, tải biên lai, hủy và đánh giá đúng các `ServiceRequest` có `studentUserId === req.user.id` hoặc `studentUsername === req.user.username`.
  - Các API xử lý nghiệp vụ (`/api/services/staff/*`) bắt buộc xác thực JWT (`lecturer` được gán quyền thụ lý hoặc `inspector`/`admin`) hoặc `adminLocalGuard`.
- **An toàn Tải tệp (File Upload Security)**:
  - Chỉ chấp nhận định dạng trong allow-list (`image/jpeg`, `image/png`, `application/pdf`), kiểm tra kích thước tối đa, chuẩn hóa tên file ngẫu nhiên (`crypto.randomUUID()`) và dùng `path.resolve()` kiểm tra đường dẫn nằm trong thư mục `public/uploads/onegate` để chống Path Traversal.
- **Chống XSS / HTML Injection**:
  - Toàn bộ dữ liệu người dùng nhập (`formData`, `overdueReason`, `studentFullName`, `alumniInfo`) khi render lên Admin Dashboard, trang `/verify/:code` và Email thông báo đều phải đi qua hàm `escapeHtml()`.

---

## 5. Danh mục Check-list Thực hiện Chi tiết (Implementation Checklist)

### 📋 Giai đoạn 1: Models, SLA Engine, VietQR, PDF Xác thực & Seeder (`backend/`)
- [x] **1.1. Models PostgreSQL:**
  - [x] Tạo `backend/models/ServiceCatalog.js` (Danh mục thủ tục động, liên kết `assigneeUserId` kiểu `UUID`).
  - [x] Tạo `backend/models/ServiceRequest.js` (Hồ sơ yêu cầu SV/Cựu SV, SLA, thanh toán, QR, giải trình, CSAT).
  - [x] Tạo `backend/models/ServiceRequestLog.js` (Audit trail lịch sử xử lý).
  - [x] Đăng ký 3 models vào `backend/config/db.js`.
- [x] **1.2. Tiện ích Nghiệp vụ Một cửa:**
  - [x] Tạo `backend/utils/slaCalculator.js`: Tính `deadlineAt` theo giờ hành chính (trừ T7, CN) và đánh giá trạng thái SLA (`in_sla`, `near_due`, `overdue`).
  - [x] Tạo `backend/utils/oneStopHelpers.js`: Sinh mã hồ sơ `MC-YYYY-XXXX`, mã `verifyQrCode`, `pickupQrCode`, URL VietQR động chuẩn Napas247 và lưu file upload Base64 an toàn (kiểm tra allow-list định dạng & chống Path Traversal).
  - [x] Tạo `backend/services/oneStopPdfService.js`: Sinh giấy xác nhận điện tử / biên nhận điện tử có mã QR xác thực trực tuyến.
  - [x] Tạo `backend/services/oneStopSeeder.js`: Khởi tạo 10 thủ tục mẫu (bật sẵn 4 thủ tục Giai đoạn 1, ẩn 6 thủ tục Giai đoạn 2 để Admin bật cuốn chiếu).

### 📋 Giai đoạn 2: Hệ thống API Một cửa, Thông báo Đa kênh & Cron Giám sát SLA (`backend/`)
- [x] **2.1. Routes & Controllers (`backend/routes/oneStopRoutes.js`):**
  - [x] Nhóm API Admin (`/api/admin/services/*`): CRUD danh mục thủ tục, Bật/Tắt nhanh 1 chạm (`toggle`), thống kê KPI (`overview`), danh sách quá hạn & giải trình, nhập ý kiến chỉ đạo của Lãnh đạo (`directive`).
  - [x] Nhóm API Sinh viên & Công khai (`/api/services/*`): Lấy danh mục đang mở, nộp đơn mới, tải ảnh biên lai lệ phí, danh sách đơn cá nhân, chi tiết đơn + timeline, hủy đơn, đánh giá CSAT 5 sao, tra cứu công khai (`public/track`) và xác thực QR (`verify/:code`).
  - [x] Nhóm API Cán bộ thụ lý (`/api/services/staff/*`): Danh sách hồ sơ cần xử lý, duyệt/từ chối biên lai lệ phí 1 chạm, nộp báo cáo giải trình quá hạn bắt buộc, phê duyệt xuất kết quả (PDF / Khay bản giấy / Mã vận đơn bưu điện), quét mã Pickup QR bàn giao tại quầy (`handover`).
- [x] **2.2. Thông báo Push + Email & Cron SLA (`backend/jobs/oneStopSlaJob.js`):**
  - [x] Tích hợp gửi Push Notification (qua `NotificationOutbox`) và Email HTML (qua `emailReportService`) cho Cán bộ, Sinh viên và Lãnh đạo phòng.
  - [x] Thiết lập Cron quét SLA định kỳ (cảnh báo sắp hết hạn ≤ 4h, đánh dấu quá hạn + gửi thư xin lỗi gia hạn cho SV + báo cáo Lãnh đạo) và Báo cáo tổng hợp tuần (Weekly Executive Digest - chỉ gửi khi trong tuần có hồ sơ/sự kiện).
  - [x] Đăng ký routes và cron job vào `backend/server.js`.

### 📋 Giai đoạn 3: Giao diện Web Admin, Cổng Cựu Sinh viên (`/onegate`) & Trang Xác thực (`/verify`)
- [x] **3.1. Trang Quản trị Admin (`backend/public/admin/index.html`):**
  - [x] Thêm Tab Sidebar **"📋 Dịch vụ Một cửa"** gồm 3 phân khu:
    1. **Danh mục Thủ tục Động**: Bảng quản lý, nút gạt Bật/Tắt hiển thị trên App tức thì, Modal Thêm/Sửa thủ tục đầy đủ cấu hình.
    2. **Bàn làm việc Xử lý Hồ sơ & Duyệt Lệ phí**: Lọc hồ sơ, Lightbox xem ảnh biên lai duyệt tiền 1 chạm, Modal bắt buộc nhập giải trình khi quá hạn, xuất kết quả & quét mã Pickup QR.
    3. **Dashboard Giám sát SLA & Giải trình Lãnh đạo**: Thống kê tỷ lệ đúng hạn/quá hạn, doanh thu lệ phí, điểm CSAT 5 sao, xem giải trình và ghi ý kiến chỉ đạo.
- [x] **3.2. Cổng Web Cựu Sinh viên & Xác thực Công khai:**
  - [x] Tạo `backend/public/onegate/index.html` (truy cập tại `/onegate`): Nộp hồ sơ dành cho Cựu sinh viên (nhập CCCD, thông tin khóa học, tải ảnh CCCD, chọn nhận Bưu điện, quét VietQR & tải biên lai) + Tra cứu tiến độ hồ sơ không cần đăng nhập.
  - [x] Tạo route & giao diện xác thực văn bản công khai `/verify/:code` hiển thị thông tin gốc của giấy chứng nhận khi quét mã QR.

### 📋 Giai đoạn 4: Giao diện Mobile App cho Sinh viên & Cán bộ (`mobile/`)
- [x] **4.1. API Client (`mobile/services/api.js`) & Navigation (`mobile/navigation/AppNavigator.js`):**
  - [x] Bổ sung các hàm gọi API Một cửa (Sinh viên & Cán bộ) vào `mobile/services/api.js`.
  - [x] Thêm Tab **"Một Cửa"** (`OneStop`) lên thanh Bottom Navigation của Sinh viên trong `mobile/navigation/AppNavigator.js`.
- [x] **4.2. Màn hình Một cửa cho Sinh viên (`mobile/screens/OneStopServiceScreen.js`):**
  - [x] Tab **Thủ tục hành chính**: Hiển thị danh mục động từ server, tìm kiếm, lọc theo phòng ban, mở Modal nộp đơn tự điền sẵn thông tin SV + form động + đính kèm ảnh minh chứng.
  - [x] Tab **Hồ sơ của tôi**: Theo dõi tiến trình Stepper Timeline, đếm ngược SLA, hiển thị mã VietQR & tải ảnh biên lai chuyển khoản, xem/tải file PDF kết quả, hiển thị thẻ **Pickup QR** nhận tại quầy hoặc mã vận đơn bưu điện, và đánh giá **CSAT 5 sao**.
- [x] **4.3. Màn hình Xử lý Một cửa cho Cán bộ (`mobile/screens/lecturer/StaffOneStopScreen.js`):**
  - [x] Tích hợp vào màn hình **Tiện ích** của Giảng viên/Cán bộ (`mobile/screens/lecturer/LecturerUtilitiesScreen.js` & `LecturerNavigator.js`).
  - [x] Cho phép cán bộ xem danh sách đơn được phân công, đối soát & duyệt biên lai lệ phí, nhập báo cáo giải trình khi đơn quá hạn, cập nhật trạng thái trả kết quả và xác nhận bàn giao tại quầy.

### 📋 Giai đoạn 5: Kiểm thử & Nghiệm thu (Validation)
- [x] Viết bộ unit & integration tests tại `backend/tests/oneStopService.test.js` kiểm tra:
  - Tính hạn SLA theo giờ hành chính (bỏ qua Thứ 7, CN) và chuyển trạng thái quá hạn.
  - Quy trình nộp đơn miễn phí vs. có thu phí (VietQR, upload biên lai, duyệt/từ chối biên lai).
  - Ràng buộc bắt buộc giải trình khi cán bộ hoàn tất hồ sơ quá hạn (`isOverdue = true`).
  - Phân quyền truy cập hồ sơ (chống IDOR) và làm sạch dữ liệu chống XSS.
- [x] Chạy `npm test` đảm bảo toàn bộ test suites PASS 100%.

