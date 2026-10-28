# Kế hoạch & Checklist: Nâng cấp Phân hệ Thanh tra (Lịch Giảng Dạy, Theo dõi Lịch Thi & Báo cáo Tổng hợp)

- **Mã kế hoạch:** `PLAN-INSPECTOR-EXAM-202610`
- **Story ID:** `US-INSP-01`
- **Áp dụng cho:** Ứng dụng Quản lý Lịch học & Giảng dạy TUAF (Mobile App & Backend)
- **Phương án điều hướng:** **Phương án A — 4 Bottom Tabs riêng biệt**
- **Trạng thái:** `Hoàn thành (Done)`

---

## 1. Tổng quan & Mục tiêu Cốt lõi (Outcomes)

### 1.1. Màn hình Lịch Giảng Dạy (`AttendanceScreen.js`)
1. **Sắp xếp theo tiến trình thời gian trong ngày**: Các lớp học phần được sắp xếp tăng dần từ **tiết đầu đến tiết cuối** (`startPeriod` từ 1 $\rightarrow$ 14+, `endPeriod`), kết hợp giờ bắt đầu chuẩn (`scheduledStart`) và tên phòng (`room`).
2. **Bộ lọc theo Buổi học (Shift Tabs)**:
   - `Tất cả` (All)
   - `Sáng` (Tiết 1 – 5: 07:00 – 11:40)
   - `Chiều` (Tiết 6 – 10: 13:15 – 17:55)
   - `Tối` (Tiết 11 – 14: 18:00 – 21:15)
   kèm Badge đếm trực quan số lớp trong từng buổi.
3. **Phân nhóm linh hoạt theo Đợt / Khung Tiết (Flexible Period Blocks - Accordion)**:
   - Gom nhóm linh hoạt dựa trên đợt tiết bắt đầu / khung tiết thực tế (`periodText`) của các lớp trong ngày (bao phủ đầy đủ cả các lớp 2, 3, 4 hoặc 5 tiết liên tục như `Tiết 1-3`, `Tiết 1-4`, `Tiết 1-5`, `Tiết 3-5`, `Tiết 4-5`, `Tiết 6-8`, `Tiết 6-9`, `Tiết 6-10`, `Tiết 8-10`, `Tiết 9-10`, `Tiết 11-13`...).
   - Tiêu đề nhóm hiển thị rõ đợt/khung tiết, mốc giờ chuẩn, tổng số lớp và số lớp đã kiểm tra, cho phép thu gọn/mở rộng (Accordion toggle).
4. **Nâng cấp Thẻ Lớp Học (Class Card)**:
   - Làm nổi bật **Phòng học** & **Tòa nhà** (Badge màu nhấn to, dễ quan sát khi di chuyển thực tế).
   - Hiển thị đầy đủ: Môn học, Mã lớp, Giảng viên, **Sĩ số SV**, Giờ học chuẩn.
5. **Tìm kiếm & Lọc trạng thái kiểm tra**:
   - Thanh tìm kiếm tức thì theo: Tên giảng viên, Tên môn học, Mã lớp, Số phòng.
   - Bộ lọc trạng thái: `Tất cả` | `Chưa kiểm tra` | `Đúng giờ` | `Có vấn đề (Vắng / Đi muộn / Về sớm / Đổi giờ / Dạy thay)`.

---

### 1.2. Mở rộng Điều hướng (Navigation — Phương án A)
Cập nhật thanh điều hướng dưới đáy (Bottom Navigation) của Thanh tra thành **4 Tabs riêng biệt**:
1. 🏫 **Giảng Dạy** (`Attendance`): Kiểm tra tiến độ và điểm danh các lớp học phần trong ngày.
2. 📝 **Lịch Thi** (`Exams` - **MỚI**): Theo dõi phòng thi, ca thi, trạng thái cán bộ coi thi, danh sách thí sinh và giám sát vi phạm thi.
3. 📊 **Báo Cáo** (`Dashboard`): Thống kê tổng hợp tình hình giảng dạy & thi cử toàn trường (kèm gửi Email báo cáo BGH).
4. 👤 **Hồ Sơ** (`Profile`): Thông tin thanh tra viên, cài đặt tài khoản và đăng xuất.

---

### 1.3. Màn hình Theo dõi Lịch Thi (`InspectorExamsScreen.js` - MỚI)
1. **Điều hướng theo ngày linh hoạt**:
   - Thanh chọn ngày (Hôm nay, nút chuyển ±1 ngày, nhập/chọn ngày bất kỳ).
   - Hiển thị tổng số phòng thi, số phòng đã kiểm tra, tổng thí sinh và tổng số vi phạm trong ngày.
2. **Lọc nhanh theo Ca thi / Khung giờ thi linh hoạt**:
   - Lọc theo buổi/ca thi thực tế trong ngày (`Tất cả`, `Ca Sáng`, `Ca Chiều`, `Ca Tối` và các chip khung giờ cụ thể xuất hiện trong ngày như `07:30`, `09:00/09:30`, `13:30`, `15:30`...).
   - Lọc theo trạng thái kiểm tra: `Tất cả` | `Chưa kiểm tra` | `Đã kiểm tra` | `Có vi phạm / Bất thường`.
3. **Thẻ Phòng Thi (Exam Room Card) hiển thị đầy đủ thông tin**:
   - **Tên môn thi & Mã học phần**
   - **Phòng thi & Tòa nhà** (Badge nổi bật)
   - **Khung giờ thi & Tiết thi** (Ví dụ: `07:30 - 09:00 (90p) | Tiết 1 - 2`)
   - **Sĩ số thí sinh dự thi** (Ví dụ: `35 SV`)
   - **Hình thức thi** (Thi viết, Trắc nghiệm máy, Vấn đáp, Thực hành...)
   - **Cán bộ coi thi 1 & 2** (Họ tên đầy đủ)
   - **Trạng thái kiểm tra phòng thi & CB coi thi**:
     - `Chưa kiểm tra`
     - `Bình thường (Đúng quy chế)`
     - `CB coi thi đi muộn`
     - `Đổi CB coi thi`
     - `Vắng CB coi thi`
     - `Vấn đề khác`
     kèm hiển thị **Ghi chú phòng thi / CB coi thi** ngay trên thẻ.
   - **Huy hiệu cảnh báo vi phạm thí sinh**: Nếu phòng thi có sinh viên bị ghi nhận vi phạm, hiển thị badge đỏ nổi bật (Ví dụ: `⚠️ 1 SV vi phạm`).
4. **Hai thao tác trực tiếp trên Thẻ Phòng Thi**:
   - Nút **"Kiểm tra Phòng / CBCT"**: Mở modal ghi nhận nhanh trạng thái phòng thi, tình hình Cán bộ coi thi (Đúng giờ, Đi muộn, Coi thi thay, Vắng...) và ô Ghi chú phòng thi.
   - Nút **"Danh sách Thí sinh & Lập biên bản"**: Mở modal danh sách thí sinh của phòng thi để tra cứu SBD và lập biên bản vi phạm quy chế thi.

---

### 1.4. Modal Danh sách Thí sinh Phòng thi & Lập Biên bản Vi phạm (`InspectorExamsScreen.js`)
1. **Danh sách thí sinh đầy đủ**:
   - **Số báo danh (SBD)**: Định dạng to, rõ nét.
   - **Mã sinh viên & Họ và tên**, **Lớp sinh hoạt** & **Ngày sinh**.
   - **Trạng thái thi**: `Bình thường` (Xanh lá) | `Ghi chú / Hoãn` (Xám) | `Vi phạm quy chế` (Đỏ kèm mức xử lý: *Khiển trách*, *Cảnh cáo*, *Đình chỉ*, *Muộn quá 15p*).
2. **Tìm kiếm thí sinh**: Ô tìm kiếm nhanh theo MSSV, Họ tên hoặc SBD.
3. **Biểu mẫu Lập biên bản vi phạm quy chế thi**:
   - **Mức độ vi phạm (`violationLevel`)**:
     - 🟡 `reprimand` (**Khiển trách** — Trừ 25% điểm bài thi)
     - 🟠 `warning` (**Cảnh cáo** — Trừ 50% điểm bài thi)
     - 🔴 `suspension` (**Đình chỉ thi** — Điểm 0 bài thi)
     - ⚪ `late_disqualified` (**Đến muộn quá 15 phút** — Không được dự thi / Vắng thi)
     - 🔘 `other` (**Vi phạm khác**)
   - **Danh mục Hành vi vi phạm có sẵn (Pre-configured Chips)** + Chọn nhiều hành vi.
   - **Tang vật thu giữ (`evidence`)**, **Đề xuất xử lý (`penalty`)**, **Xác nhận bàn giao CB coi thi (`proctorNotified`)**, và **Ghi chú chi tiết (`note`)**.
   - Hỗ trợ **Lưu mới / Cập nhật (Upsert)** và **Xóa biên bản** nếu lập nhầm.

---

### 1.5. Tích hợp Thống kê Thi cử & Vi phạm vào Báo Cáo (`InspectorDashboardScreen.js` & `emailReportService.js`)
1. **API Dashboard (`/api/inspector/dashboard/today` & `/api/inspector/dashboard/report`)**:
   - Trả về thêm khối `examSummary` (Tổng số phòng đã kiểm tra, số phòng bình thường, số phòng có sự vụ CBCT, tổng số thí sinh vi phạm theo từng mức: Khiển trách, Cảnh cáo, Đình chỉ, Vào muộn) và danh sách `examViolations`, `examRoomIssues`.
2. **Giao diện `InspectorDashboardScreen.js`**:
   - Hiển thị thống kê nhanh công tác Thanh tra Thi cử & Danh sách biên bản vi phạm quy chế thi / bất thường phòng thi ngay trong cả tab **Hôm nay** và tab **Báo cáo kỳ (Tuần / Tháng / Kỳ học)**.
3. **Email Báo cáo Ban Giám hiệu (`emailReportService.js`)**:
   - Bổ sung bảng tổng hợp **Tình hình Thanh tra Coi thi & Sinh viên vi phạm quy chế thi** vào mẫu HTML Email gửi Ban Giám hiệu.

---

## 2. Kiến trúc Kỹ thuật & Bảo mật (Technical & Security Design)

### 2.1. CSDL PostgreSQL — 2 Models mới
1. **`ExamViolation` (`backend/models/ExamViolation.js`)**:
   - Lưu biên bản vi phạm của thí sinh trong ca thi (`idDotThiPhong`, `examDate`, `courseCode`, `courseName`, `room`, `examTime`, `studentCode`, `studentName`, `studentClass`, `seatNumber`, `violationLevel`, `violationActions`, `evidence`, `penalty`, `inspectorId`, `inspectorName`, `proctorNotified`, `note`).
2. **`ExamRoomInspection` (`backend/models/ExamRoomInspection.js`)**:
   - Lưu trạng thái thanh tra phòng thi & cán bộ coi thi (`idDotThiPhong`, `roomKey`, `examDate`, `courseCode`, `courseName`, `room`, `examTime`, `proctors`, `status` [`normal`, `proctor_late`, `proctor_changed`, `proctor_absent`, `other_issue`], `lateMinutes`, `substituteProctor`, `note`, `inspectorId`, `inspectorName`).

### 2.2. Kế hoạch Kiểm chứng Bảo mật (Security Verification Plan)
Tuân thủ nghiêm ngặt `mandatory-secure-web-skills`:
- **SQL Injection Prevention**: Toàn bộ truy vấn SQL Server TUAF trong `tuafQueries.js` bắt buộc đi qua `safeQuery()` với tham số `@targetDate`, `@idDotThiPhong` kiểu `sql.Date` / `sql.Int` và chặn tuyệt đối từ khóa ghi (`assertReadOnly`). Toàn bộ truy vấn PostgreSQL đi qua Sequelize ORM parameterized queries.
- **Authentication & RBAC Authorization**: Tất cả các endpoints `/api/inspector/*` đều bắt buộc đi qua `authMiddleware` (kiểm tra JWT hợp lệ) và `requireRole('inspector', 'admin')` (Principle of Least Privilege).
- **Input Validation & Output Encoding**: Kiểm tra định dạng ngày `YYYY-MM-DD`, giới hạn danh sách `violationLevel` và `status` theo allow-list hợp lệ, escape HTML an toàn (`escapeHtml`) cho mọi trường dữ liệu động khi render vào template Email báo cáo Ban Giám hiệu (`emailReportService.js`) nhằm chống XSS/HTML Injection.

---

## 3. Danh mục Check-list Thực hiện Chi tiết (Implementation Checklist)

### 📋 Giai đoạn 1: Nâng cấp Backend (Models, Queries, Routes, Email Report)
- [x] **1.1. Models PostgreSQL:**
  - [x] Tạo `backend/models/ExamViolation.js` và `backend/models/ExamRoomInspection.js`.
  - [x] Đăng ký vào `backend/config/db.js`.
- [x] **1.2. Tiện ích Giờ học & Giờ thi (`backend/utils/periodMapping.js`):**
  - [x] Bổ sung hàm quy đổi giờ thi chuẩn (`getExamStartTime`, `calculateExamEndTime`, `formatExamTime`, `classifyExamShift`, `formatExamFormat`) và hàm gom nhóm tiết học linh hoạt (`classifySchedulePeriodBlock`).
- [x] **1.3. Truy vấn SQL Server (`backend/services/tuafQueries.js`):**
  - [x] Cập nhật `getInspectorClassesByDate`: Bổ sung đếm sĩ số `studentCount` cho lớp học phần.
  - [x] Thêm hàm `getInspectorExamRoomsByDate(pool, dateStr)`: Kết hợp `TCT_DotThi_Phong` và `MARK_ToChucThiPhong_TC` để lấy đầy đủ phòng thi, môn thi, giờ thi, hình thức thi, sĩ số, CB coi thi 1 & 2.
  - [x] Nâng cấp `getExamRoomCandidates(pool, idDotThiPhong, idPhongThi)`: Hỗ trợ fallback sang `MARK_TochucThiChiTiet_TC` và `STU_DanhSachLopTinChi` nếu phòng thi chưa có trong `TCT_DotThi_ThiSinh`.
- [x] **1.4. Routes Thanh tra (`backend/routes/inspector.js`) & Email (`backend/services/emailReportService.js`):**
  - [x] Nâng cấp `GET /api/inspector/attendance/classes`: Trả thêm `startPeriod`, `endPeriod`, `studentCount`, `periodBlock` và sắp xếp tăng dần theo tiết $\rightarrow$ giờ $\rightarrow$ phòng.
  - [x] Thêm `GET /api/inspector/exams` (danh sách phòng thi trong ngày + trạng thái kiểm tra phòng/CBCT + số lượng thí sinh vi phạm).
  - [x] Thêm `POST /api/inspector/exams/room-status` (ghi nhận trạng thái phòng thi, CB coi thi & ghi chú).
  - [x] Thêm `GET /api/inspector/exams/candidates` (danh sách thí sinh + biên bản vi phạm tương ứng).
  - [x] Thêm `POST /api/inspector/exams/violation` (tạo mới / cập nhật biên bản vi phạm thí sinh).
  - [x] Thêm `DELETE /api/inspector/exams/violation/:id` (xóa biên bản vi phạm).
  - [x] Nâng cấp `GET /api/inspector/dashboard/today`, `GET /api/inspector/dashboard/report` và `emailReportService.js`: Tích hợp thống kê kiểm tra phòng thi & danh sách vi phạm quy chế thi.

### 📋 Giai đoạn 2: Nâng cấp Giao diện Mobile App
- [x] **2.1. API Service (`mobile/services/api.js`) & Navigation (`mobile/navigation/InspectorNavigator.js`):**
  - [x] Bổ sung các hàm gọi API lịch thi thanh tra vào `mobile/services/api.js`.
  - [x] Nâng cấp `InspectorNavigator.js` lên 4 Bottom Tabs: `Giảng Dạy` | `Lịch Thi` | `Báo Cáo` | `Hồ Sơ`.
- [x] **2.2. Màn hình Lịch Giảng Dạy (`mobile/screens/inspector/AttendanceScreen.js`):**
  - [x] Bộ lọc Buổi học (`Tất cả`, `Sáng`, `Chiều`, `Tối`) kèm badge đếm số lớp.
  - [x] Bộ lọc Trạng thái kiểm tra & Thanh tìm kiếm nhanh (GV, môn, mã lớp, phòng).
  - [x] Phân nhóm linh hoạt theo Khung/Đợt tiết học (Accordion đóng/mở).
  - [x] Thiết kế lại thẻ lớp học: Làm nổi bật Badge Phòng học & Tòa nhà, hiển thị Sĩ số SV.
- [x] **2.3. Màn hình Theo dõi Lịch Thi (`mobile/screens/inspector/InspectorExamsScreen.js`):**
  - [x] Thanh chọn ngày linh hoạt + Thống kê nhanh trong ngày (Phòng thi, Đã KT, Thí sinh, Vi phạm).
  - [x] Bộ lọc Ca thi / Khung giờ linh hoạt + Bộ lọc trạng thái + Thanh tìm kiếm.
  - [x] Thẻ phòng thi hiển thị đầy đủ môn, phòng, giờ, sĩ số, hình thức thi, CB coi thi 1 & 2, trạng thái phòng/CBCT, ghi chú và badge cảnh báo SV vi phạm.
  - [x] Modal **Kiểm tra Phòng thi & Cán bộ coi thi** (chọn trạng thái: Bình thường, CBCT đi muộn, Đổi CBCT, Vắng CBCT, Khác + nhập ghi chú).
  - [x] Modal **Danh sách Thí sinh Phòng thi** + Modal **Lập / Sửa / Xóa Biên bản Vi phạm Quy chế Thi**.
- [x] **2.4. Màn hình Báo Cáo (`mobile/screens/inspector/InspectorDashboardScreen.js`):**
  - [x] Hiển thị thẻ thống kê Thanh tra Thi cử & Danh sách vi phạm quy chế thi / bất thường phòng thi ở cả tab Hôm nay và tab Báo cáo kỳ.

### 📋 Giai đoạn 3: Kiểm thử & Nghiệm thu (Validation Proof)
- [x] Viết bộ unit & integration tests tại `backend/tests/inspectorExams.test.js` kiểm tra:
  - Sắp xếp và gom nhóm linh hoạt lịch giảng dạy.
  - Quy đổi giờ thi, lấy phòng thi và fallback danh sách thí sinh.
  - Lập/cập nhật/xóa biên bản vi phạm thi và trạng thái phòng thi/CBCT.
  - Tổng hợp thống kê vi phạm thi vào báo cáo.
- [x] Chạy `npm test` đảm bảo toàn bộ test suites PASS 100%.
