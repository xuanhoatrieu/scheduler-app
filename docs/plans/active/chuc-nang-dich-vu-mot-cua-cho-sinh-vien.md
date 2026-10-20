# Kế hoạch phát triển: Chức năng Dịch vụ Một cửa cho Sinh viên (TUAF One-Stop Service)

## 1. Bối cảnh & Khảo sát thực tiễn (Benchmark Research)
- **Mô hình tại các trường đại học lớn (HUST eHUST, PTIT S-Link, NEU, UEH, OneVNU, UNETI, ASC-Student)**:
  - Chuyển dịch toàn bộ thủ tục hành chính sinh viên từ nộp đơn giấy trực tiếp sang cổng một cửa số hóa (Web Portal + Mobile App).
  - Tự động điền trước (pre-fill) thông tin sinh viên từ CSDL quản lý đào tạo, giảm thiểu sai sót và thao tác gõ lại.
  - Phân loại 2 hình thức trả kết quả:
    + **Bản điện tử (PDF)** có mã QR Code định danh tra cứu tính pháp lý trực tuyến (dành cho giấy xác nhận SV, vay vốn, bảng điểm).
    + **Bản giấy có dấu đỏ**: Đặt lịch hẹn nhận tại quầy tiếp nhận Một cửa hoặc gửi bưu điện.
  - Tracking tiến độ trực quan theo thời gian thực (Stepper timeline), thông báo trạng thái qua Push Notification & Email.
  - Phân luồng đơn tự động tới các phòng ban chức năng: Phòng CTSV, Phòng Đào tạo, Phòng Khảo thí & ĐBCL, Ban KTX...
- **Quy chuẩn Pháp lý & Hành chính nhà nước (Nghị định 61/2018/NĐ-CP & Nghị định 118/2025/NĐ-CP)**:
  - Quy định rõ về thời hạn giải quyết thủ tục (SLA).
  - Bắt buộc có cơ chế thông báo/xin lỗi gia hạn khi quá hạn (chậm nhất trước 01 ngày).
  - Quy định trách nhiệm giải trình của cán bộ thụ lý hồ sơ khi để xảy ra chậm trễ.
  - Báo cáo định kỳ công khai tỷ lệ giải quyết đúng hạn cho Lãnh đạo đơn vị.

## 2. Mục tiêu cốt lõi (Core Outcomes)
- [ ] **Quản lý Danh mục Dịch vụ Động từ Trang Admin**: Toàn bộ dịch vụ Một cửa được Admin tạo mới, chỉnh sửa, gán cán bộ, thiết lập phí, SLA và Bật/Tắt hiển thị trực tiếp từ trang Admin. KHÔNG HARDCODE trên App.
- [ ] **Sinh viên xem & nộp đơn theo danh mục động trên App Mobile**: App tự động fetch danh sách dịch vụ đang kích hoạt (`isActive = true`), form nộp đơn tự động thích ứng với cấu hình dịch vụ đó.
- [ ] **Thông báo đa kênh cho Cán bộ phụ trách**: Ngay khi có đơn mới, cán bộ được phân công theo cấu hình nhận Push Notification trên App và Email thông báo kèm liên kết xử lý nhanh.
- [ ] **Theo dõi tiến độ & Thời hạn SLA tự động**: Đếm ngược thời gian cam kết; cảnh báo sắp đến hạn (trước 4 giờ) và cảnh báo quá hạn.
- [ ] **Quy trình Giải trình Quá hạn bắt buộc**: Khi hồ sơ bị quá hạn, cán bộ phải nhập báo cáo giải trình lý do chậm trễ trước khi hoàn tất hồ sơ; dữ liệu lưu vết vào nhật ký kiểm toán (Audit Trail) và gửi đến Lãnh đạo quản lý được cấu hình.
- [ ] **Báo cáo Giám sát dành cho Lãnh đạo (Dashboard & Executive Digest)**: Cung cấp màn hình thống kê KPI (tỷ lệ đúng hạn, quá hạn, thời gian xử lý trung bình theo phòng ban/cán bộ) và tự động gửi Email báo cáo định kỳ cho Ban Giám hiệu/Trưởng phòng.
- [ ] **Cấp giấy tờ điện tử có mã QR xác thực công khai**: Hỗ trợ quét mã QR để tra cứu tính pháp lý trực tuyến chống làm giả giấy tờ.

## 3. Danh mục Dịch vụ Động & Các Tiêu chí Cấu hình trong Trang Admin

> [!IMPORTANT]
> **Nguyên tắc triển khai cuốn chiếu (Gradual Rollout)**:
> Không phải tất cả dịch vụ đều được triển khai ngay lập tức. Nhà trường sẽ dùng trang Quản trị Admin để bật trước 2–3 dịch vụ thử nghiệm (Giai đoạn 1: Giấy xác nhận SV, Giấy giới thiệu thực tập). Khi quy trình vận hành trơn tru, Admin chỉ cần bấm công tắc Bật (`isActive = true`) để mở thêm các dịch vụ tiếp theo trên App mà **không cần phải phát hành bản cập nhật mới trên CH Play / App Store**.

### 3.1. Các thông số cấu hình khi Admin thêm/sửa một Dịch vụ
Khi Admin mở modal **"Thêm thủ tục Một cửa mới"** hoặc **"Chỉnh sửa thủ tục"** trên Trang Admin, hệ thống cung cấp các trường cấu hình toàn diện:

1. **Thông tin thủ tục**:
   - **Tên dịch vụ**: (Ví dụ: *Giấy xác nhận sinh viên vay vốn NHCSXH*, *Cấp bản sao bằng tốt nghiệp*...).
   - **Mã thủ tục** (`code`): Mã duy nhất định danh dịch vụ (vd: `XN_VAY_VON`, `CAP_THE_SV`, `BAN_SAO_BANG`...).
   - **Nhóm lĩnh vực** (`department`): Phân loại phòng ban chịu trách nhiệm (*Phòng Công tác Sinh viên*, *Phòng Đào tạo*, *Phòng Khảo thí & ĐBCL*, *Ký túc xá*, *Tài chính kế toán*...).
   - **Biểu tượng (Icon)** & **Mô tả ngắn gọn**: Giúp sinh viên nhận diện nhanh trên app (icon lịch, bảng điểm, thẻ, tiền, chứng nhận...).
   - **Thứ tự hiển thị** (`displayOrder`): Ưu tiên thủ tục nào lên đầu màn hình app.

2. **Cán bộ phụ trách & Lãnh đạo theo dõi**:
   - **Cán bộ thụ lý mặc định** (`assigneeName`, `assigneeEmail`, `assigneePhone`): Cán bộ trực tiếp tiếp nhận hồ sơ, nhận thông báo push trên app và email công vụ mỗi khi có đơn mới.
   - **Lãnh đạo quản lý theo dõi** (`leaderName`, `leaderEmail`): Trưởng phòng / Phó Trưởng phòng phụ trách lĩnh vực đó $\rightarrow$ tự động nhận thông báo cảnh báo khi hồ sơ của phòng mình bị quá hạn SLA và đọc báo cáo giải trình của cán bộ.

3. **Thời hạn cam kết xử lý (SLA)**:
   - **Số giờ hoàn thành** (`slaHours`): Ví dụ `24` giờ (1 ngày làm việc), `48` giờ (2 ngày), `72` giờ (3 ngày).
   - Hệ thống tự động tính hạn chót theo giờ hành chính (trừ T7, CN).

4. **Chính sách Thu lệ phí & Hướng dẫn chuyển khoản**:
   - **Loại phí**: `Miễn phí` HOẶC `Có thu phí`.
   - **Mức thu lệ phí** (`feeAmount`): Số tiền cụ thể (ví dụ: `0đ`, `35.000đ`, `50.000đ`...).
   - **Thông tin tài khoản nhận tiền**: Số tài khoản, Tên tài khoản, Ngân hàng thu sự nghiệp của Nhà trường (nếu thủ tục có thu phí).
   - **Cú pháp chuyển khoản gợi ý**: `MC<MãHồSơ> <MSSV>`.

5. **Hình thức trả kết quả cho phép** (Checkboxes):
   - `[x] Bản điện tử (PDF có mã QR tải trên App)`
   - `[x] Nhận bản giấy tại Quầy Một cửa (có mã Pickup QR)`
   - `[x] Chuyển phát bưu điện tận nhà (VNPost / Viettel Post)`

6. **Yêu cầu minh chứng đính kèm & Đối tượng**:
   - **Yêu cầu minh chứng** (`requiresAttachment`): Không cần / Tùy chọn / Bắt buộc (kèm hướng dẫn minh chứng cho SV: ví dụ *Ảnh 2 mặt CCCD*, *Hồ sơ y tế*...).
   - **Cho phép Cựu sinh viên** (`allowAlumni`): Bật/Tắt để cho phép thủ tục này hiển thị ngoài cổng Web cho Cựu SV.

7. **Trạng thái kích hoạt**:
   - **Công tắc Hoạt động** (`isActive: true / false`): Chỉ khi bật `true`, dịch vụ mới xuất hiện trên Mobile App và Web. Khi tắt `false`, dịch vụ tạm ẩn khỏi giao diện sinh viên.

## 4. Thiết kế Luồng Phân luồng, Giám sát SLA & Báo cáo Lãnh đạo

### 4.1. Luồng phân phối & Thông báo (Notification Dispatcher)
```
[Sinh viên tạo yêu cầu trên App]
             │
             ▼
[Hệ thống xác định Cán bộ / Phòng ban phụ trách]
     ├──► Gửi PUSH NOTIFICATION trên App tới thiết bị cán bộ ("🔔 Hồ sơ mới #MC-2026-0042...")
     └──► Gửi EMAIL THÔNG BÁO tới hộp thư công vụ cán bộ (kèm SLA, link duyệt trực tiếp)
```

### 4.2. Quản lý Thời hạn (SLA) & Quy trình Bắt buộc Giải trình Quá hạn
- Mỗi dịch vụ gắn với một định mức thời gian xử lý: `slaHours` (ví dụ: Giấy xác nhận = 24h, Bảng điểm = 48h, Hoãn thi = 72h).
- Hệ thống tính `deadlineAt = createdAt + slaHours` (tính theo giờ hành chính, trừ T7, CN).
- **Trạng thái giám sát**:
  - 🟢 **Trong hạn**: Đang xử lý bình thường.
  - 🟡 **Sắp đến hạn (còn ≤ 4h)**: Gửi Push nhắc nhở cán bộ thụ lý.
  - 🔴 **Quá hạn (`now > deadlineAt`)**:
    1. Chuyển trạng thái cờ `isOverdue = true`.
    2. Gửi Cảnh báo vi phạm SLA tới Cán bộ và CC cho Lãnh đạo phòng.
    3. Gửi thông báo gia hạn & xin lỗi tự động cho Sinh viên trên App (chuẩn NĐ 61/2018/NĐ-CP).
    4. **Bắt buộc Giải trình**: Khi cán bộ mở đơn để cập nhật/hoàn thành, hệ thống bắt buộc cán bộ phải chọn lý do và nhập văn bản giải trình (*Chờ SV bổ sung minh chứng gốc*, *Cần xác minh liên phòng ban*, *Lãnh đạo đi công tác*, *Lý do kỹ thuật/khác*). Báo cáo giải trình được lưu vết vĩnh viễn (`overdueReason`, `explainedAt`, `explainedBy`).

### 4.3. Báo cáo Giám sát dành cho Lãnh đạo
- **Executive Dashboard (Web Portal & Mobile View dành cho Ban Giám hiệu / Trưởng phòng)**:
  - Thống kê tỷ lệ hoàn thành đúng hạn toàn trường / từng phòng ban / từng cán bộ (%).
  - Danh sách hồ sơ đang trễ hạn và nội dung cán bộ đã giải trình.
  - Lãnh đạo có thể ghi ý kiến chỉ đạo trực tiếp vào hồ sơ.
- **Weekly Executive Digest Email (Tự động gửi 17:00 thứ Sáu hàng tuần)**:
  - Tổng số hồ sơ tiếp nhận và giải quyết trong tuần.
  - Bảng danh sách các hồ sơ bị trễ hạn kèm theo lý do giải trình của cán bộ phụ trách.

### 4.4. Quy trình Trả Kết quả & Đánh giá Mức độ Hài lòng (Result Delivery & Handover)
Quy trình trả kết quả được thiết kế phân luồng triệt để theo 2 phương thức mà sinh viên đã chọn:

#### Nhánh A: Trả Kết quả Bản điện tử (Digital PDF - 80% thủ tục)
1. **Cán bộ ký duyệt / xuất file**:
   - Cán bộ bấm "Phê duyệt & Xuất kết quả".
   - Hệ thống tự động sinh file PDF chính thức (hoặc cán bộ upload file đã có chữ ký số/con dấu số), nhúng **Mã QR Code xác thực duy nhất**.
2. **Thông báo tức thì cho Sinh viên**:
   - Push Notification: `🎉 [Một cửa TUAF] Hồ sơ #MC-2026-0042 đã có kết quả! Chạm để xem và tải về.`
   - Email tự động gửi kèm tệp PDF đính kèm.
3. **Sinh viên xem & tải file trực tiếp trên App**:
   - Mở màn hình chi tiết hồ sơ $\rightarrow$ Nút **"Tải Giấy chứng nhận (PDF)"** / **"Mở xem ngay"**.
   - Có thể lưu vào máy hoặc chia sẻ qua Zalo, Email, in ấn.

#### Nhánh B: Trả Kết quả Bản giấy có Dấu đỏ (Physical Copy tại Quầy Một cửa)
1. **Cán bộ chuẩn bị bản cứng**:
   - In văn bản, xin dấu mộc đỏ của Nhà trường, xếp vào khay tài liệu tại Quầy Một cửa (đánh số khay theo mã hồ sơ).
   - Bấm cập nhật trạng thái: `SẴN_SÀNG_NHẬN_KẾT_QUẢ`.
2. **Sinh viên nhận Giấy hẹn & Mã QR nhận kết quả (Pickup QR)**:
   - Push Notification & Email: `🎉 Kết quả bản giấy hồ sơ #MC-2026-0042 đã sẵn sàng! Vui lòng đến Quầy Một cửa (Phòng 102 - Nhà Hiệu bộ) để nhận.`
   - Màn hình hồ sơ trên App hiển thị thẻ **Mã QR Nhận kết quả** và mã rút gọn (vd: `#MC-0042`), cùng hướng dẫn giờ làm việc và giấy tờ cần mang theo (Thẻ SV/CCCD).
3. **Bàn giao đối soát tại Quầy Một cửa**:
   - Sinh viên đưa màn hình App có Mã QR cho cán bộ Một cửa quét (bằng máy quét mã vạch hoặc camera máy tính bảng/điện thoại cán bộ).
   - Màn hình cán bộ hiển thị ngay thông tin hồ sơ và vị trí khay giấy tờ $\rightarrow$ cán bộ lấy giấy trao cho sinh viên.
   - Sinh viên ký nhận (ký điện tử trên màn hình hoặc ký sổ giao nhận).
   - Cán bộ bấm "Đã bàn giao cho sinh viên" $\rightarrow$ Hồ sơ hoàn tất và đóng lại (`CLOSED`).

#### Đánh giá Mức độ Hài lòng của Sinh viên (CSAT - 5 sao)
- Ngay sau khi sinh viên tải bản PDF thành công hoặc nhận bản giấy tại quầy, App hiển thị pop-up đánh giá 1 chạm:
  - Điểm số: 1 đến 5 sao (⭐ ⭐ ⭐ ⭐ ⭐).
  - Tiêu chí đánh giá nhanh: *Tốc độ xử lý (Nhanh/Đúng hạn/Chậm)*, *Thái độ phục vụ (Tận tình/Bình thường/Chưa tốt)*, *Chất lượng kết quả*.
  - Khung góp ý ngắn gọn (tùy chọn).
- Dữ liệu đánh giá đổ trực tiếp về Dashboard Lãnh đạo để xếp hạng chất lượng phục vụ của từng phòng ban.

### 4.5. Cơ chế Nộp Lệ phí: Chuyển khoản & Đính kèm Minh chứng (Proof of Payment)
Nhằm đơn giản hóa quy trình kỹ thuật, không phụ thuộc vào thủ tục tích hợp Webhook ngân hàng phức tạp của khối trường công lập, hệ thống áp dụng cơ chế **Chuyển khoản trực tiếp kèm Đính kèm ảnh biên lai giao dịch**:

1. **Hiển thị Bảng tính tiền & Thông tin Tài khoản (kèm VietQR tiện ích)**:
   - Hệ thống tự động tính tổng tiền: `Tổng = (Đơn giá x Số lượng) + Cước chuyển phát (nếu có)`.
   - Màn hình App / Web hiển thị rõ:
     - **Tên đơn vị thụ hưởng**: Trường Đại học Nông Lâm Thái Nguyên (hoặc Trung tâm Một cửa TUAF).
     - **Số tài khoản & Ngân hàng**: (Ví dụ: BIDV / Agribank / VietinBank...).
     - **Số tiền cần nộp**: (Ví dụ: `70.000 VNĐ`).
     - **Nội dung chuyển khoản chuẩn**: `MC<MãHồSơ> <MSSV>` (Ví dụ: `MC20260042 2051010001`).
     - **Ảnh mã VietQR tĩnh/động**: Sinh sẵn để người nộp chỉ cần quét bằng app ngân hàng là tự điền đúng số tiền và nội dung, tránh gõ nhầm.
2. **Sinh viên chuyển khoản & Tải ảnh biên lai (Receipt Upload)**:
   - Người nộp thực hiện chuyển khoản trên app ngân hàng của mình và chụp màn hình biên lai giao dịch thành công.
   - Nhấn nút **"Tải lên minh chứng chuyển khoản"** $\rightarrow$ chọn ảnh từ thư viện hoặc chụp trực tiếp.
   - Bấm **"Gửi minh chứng"** $\rightarrow$ Hồ sơ chuyển sang trạng thái: `CHỜ_XÁC_NHẬN_THANH_TOÁN`.
3. **Cán bộ / Kế toán Một cửa duyệt tiền 1 chạm**:
   - Trên giao diện xử lý của cán bộ, hồ sơ hiển thị tab riêng **"Chờ duyệt lệ phí"**.
   - Cán bộ bấm vào hồ sơ $\rightarrow$ xem ảnh chụp biên lai giao dịch (có thể phóng to xem rõ mã GD, số tiền, ngày giờ).
   - Hai thao tác nhanh:
     - 🟢 **Nút "Xác nhận đã nhận tiền"**: Hồ sơ tự động chuyển sang `ĐÃ_THANH_TOÁN_CHỜ_XỬ_LÝ`, chuyển giao tiếp cho cán bộ chuyên môn in ấn/làm bằng.
     - 🔴 **Nút "Yêu cầu nộp lại minh chứng"**: Nhập lý do (ví dụ: *"Số tiền nộp thiếu 25.000đ cước bưu điện"*, *"Biên lai mờ không thấy mã giao dịch"*) $\rightarrow$ Hệ thống tự động bắn Push Notification & Email yêu cầu sinh viên tải lại ảnh biên lai đúng.

### 4.6. Cổng Dịch vụ dành cho Cựu Sinh viên (Alumni Web Portal)
Cựu sinh viên thường đã tốt nghiệp nhiều năm, không còn cài app hoặc tài khoản đào tạo đã hết hạn. Do đó, hệ thống cung cấp cổng Web chuyên dụng:

1. **Cổng nộp hồ sơ trực tuyến (Web One-Gate)**:
   - Truy cập công khai tại: `https://scheduler.tuaf.edu.vn/onegate` (hoặc `motcua.tuaf.edu.vn`).
   - **Xác thực danh tính**: Nhập Họ tên, Ngày sinh, Số CCCD, Ngành học, Khóa/Năm tốt nghiệp + Số điện thoại nhận OTP xác nhận.
   - **Tải minh chứng nhân thân**: Tải ảnh 2 mặt thẻ CCCD (bắt buộc theo quy định cấp bản sao văn bằng từ sổ gốc để chống mạo danh).
2. **Tùy chọn nhận kết quả từ xa qua Bưu điện (Postal Delivery)**:
   - Do cựu sinh viên đa số đã đi làm xa trường, cổng web hỗ trợ nhập Địa chỉ nhận thư, Số điện thoại người nhận.
   - Tự động tính cước vận chuyển bưu điện (khoảng 25.000đ - 35.000đ) cộng gộp vào tổng lệ phí cần chuyển khoản.
   - Cựu sinh viên chuyển khoản và tải ảnh biên lai ngay trên web.
   - Sau khi hoàn thành, cán bộ dán mã vận đơn (VNPost / Viettel Post) $\rightarrow$ Cựu sinh viên nhận mã vận đơn để theo dõi hành trình chuyển phát bưu phẩm về tận nhà.
3. **Tra cứu tiến độ không cần đăng nhập**:
   - Cựu sinh viên tra cứu trạng thái hồ sơ bất kỳ lúc nào bằng cách nhập `Mã hồ sơ` + `Số CCCD`.

## 5. Kiến trúc kỹ thuật & Mô hình dữ liệu

### 5.1. Mô hình Database (PostgreSQL / SQLite via Sequelize)
- `ServiceCatalog` (Quản lý Danh mục Dịch vụ động do Admin cấu hình):
  - `id`: Khóa chính
  - `code`: Mã duy nhất (vd: `XN_VAY_VON`, `CAP_THE_SV`...)
  - `name`: Tên dịch vụ hiển thị
  - `department`: Phòng ban chịu trách nhiệm (`CTSV`, `DAO_TAO`, `KHAO_THI`, `KTX`, `KHTC`...)
  - `icon`: Tên biểu tượng (vd: `document-text`, `school`, `wallet`, `ribbon`, `card`...)
  - `description`: Mô tả tóm tắt dịch vụ & hướng dẫn sinh viên
  - `displayOrder`: Thứ tự hiển thị (số nguyên tăng dần)
  - `slaHours`: Thời hạn hoàn thành chuẩn (giờ hành chính)
  - `assigneeName`: Họ tên cán bộ thụ lý
  - `assigneeEmail`: Email cán bộ nhận thông báo đơn mới
  - `assigneePhone`: Số điện thoại cán bộ
  - `assigneeUserId`: FK User (nếu cán bộ có tài khoản app để nhận push)
  - `leaderName`: Họ tên Lãnh đạo phòng/Trưởng bộ phận theo dõi
  - `leaderEmail`: Email Lãnh đạo nhận cảnh báo quá hạn & báo cáo giải trình
  - `isPaid`: Có thu phí hay không (BOOL)
  - `feeAmount`: Mức thu lệ phí (DECIMAL)
  - `bankAccountInfo`: Thông tin tài khoản ngân hàng nhà trường nhận tiền (JSON: STK, Chủ TK, Ngân hàng)
  - `deliveryOptions`: Các hình thức nhận kết quả cho phép (JSON: `["digital", "physical_pickup", "postal_delivery"]`)
  - `formSchema`: Cấu hình các trường form động bổ sung (JSON: các trường tùy biến theo từng thủ tục)
  - `requiresAttachment`: Yêu cầu minh chứng đính kèm (`none`, `optional`, `required`)
  - `attachmentGuide`: Lời dặn sinh viên về tài liệu cần tải lên
  - `allowAlumni`: Cho phép Cựu sinh viên đăng ký qua Web hay không (BOOL)
  - `isActive`: Trạng thái Bật/Tắt hiển thị trên App & Web (BOOL, mặc định `true`)

- `ServiceRequest` (Hồ sơ yêu cầu của Sinh viên / Cựu sinh viên):
  - `id`, `requestCode` (MC-2026-XXXX), `isAlumni` (BOOL), `studentUsername` (MSSV - nullable cho cựu sinh viên), `alumniInfo` (JSONB: họ tên, CCCD, ngày sinh, năm tốt nghiệp, SĐT, email), `serviceId` (FK ServiceCatalog), `formData` (JSONB), `status` (`PENDING`, `WAITING_PAYMENT_PROOF`, `WAITING_PAYMENT_CONFIRM`, `PAID`, `PROCESSING`, `APPROVED`, `READY_FOR_PICKUP`, `DELIVERING`, `COMPLETED`, `REJECTED`, `CANCELLED`), `deliveryMethod` (`digital`, `physical_pickup`, `postal_delivery`), `postalAddress` (TEXT), `postalTrackingNumber` (STRING), `assignedTo` (FK User cán bộ), `assignedDepartment` (STRING), `submittedAt`, `deadlineAt`, `completedAt`, `pickedUpAt`, `pickupQrCode` (STRING), `isOverdue` (BOOL), `overdueReason` (TEXT), `overdueExplainedAt` (DATE), `overdueExplainedBy` (FK User), `feeAmount` (DECIMAL), `paymentStatus` (`UNPAID`, `PENDING_CONFIRM`, `PAID`, `REJECTED_PROOF`), `paymentProofUrl` (STRING - đường dẫn ảnh biên lai chuyển khoản), `paymentConfirmedAt` (DATE), `paymentConfirmedBy` (FK User cán bộ xác nhận), `paymentNote` (TEXT - lý do nếu từ chối biên lai), `resultPdfUrl` (STRING), `verifyQrCode` (STRING, unique), `rating` (INT 1-5), `ratingComment` (TEXT), `ratedAt` (DATE).

- `ServiceRequestLog` (Nhật ký xử lý & Kiểm toán):
  - `id`, `requestId` (FK), `actorId` (FK User), `action` (`SUBMIT`, `UPLOAD_RECEIPT`, `PAYMENT_CONFIRMED`, `PAYMENT_REJECTED`, `NOTIFY_STAFF`, `ASSIGN`, `START_PROCESS`, `REQUEST_INFO`, `APPROVE`, `READY_PICKUP`, `POSTAL_DISPATCH`, `HANDOVER`, `OVERDUE_EXPLAIN`, `COMPLETE`, `RATING`), `note` (TEXT), `createdAt`.

### 5.2. Backend APIs

#### 🛠️ Nhóm API Dành cho Quản trị viên (Admin Portal):
- `GET /api/admin/services`: Lấy danh sách toàn bộ thủ tục (kèm bộ lọc theo phòng ban, trạng thái active/inactive).
- `POST /api/admin/services`: **Thêm mới thủ tục dịch vụ** (với đầy đủ các cấu hình: phòng ban, cán bộ, lãnh đạo, SLA, lệ phí, hình thức nhận, Bật/Tắt...).
- `PUT /api/admin/services/:id`: Chỉnh sửa toàn bộ cấu hình của một thủ tục.
- `PATCH /api/admin/services/:id/toggle`: **Bật/Tắt trạng thái hoạt động** nhanh 1 chạm (`isActive: true <-> false`).
- `DELETE /api/admin/services/:id`: Xóa hoặc lưu trữ dịch vụ.
- `GET /api/admin/overview`: Thống kê KPI toàn trường, tỷ lệ đúng hạn/quá hạn, tổng thu lệ phí và điểm hài lòng (CSAT).
- `GET /api/admin/overdue-reports`: Báo cáo chi tiết các vụ việc quá hạn và giải trình của cán bộ.
- `POST /api/admin/send-digest`: Kích hoạt gửi email báo cáo tuần cho Ban Giám hiệu.

#### 📱 Nhóm API Dành cho Sinh viên & Cựu sinh viên (App & Web):
- `GET /api/services`: **Lấy danh mục dịch vụ đang hoạt động** (`where: { isActive: true }`, sắp xếp theo `displayOrder`). Dùng để render giao diện động trên App và Web.
- `POST /api/services/requests`: Tạo yêu cầu mới (chọn nhận `digital` hoặc `physical`, kèm minh chứng nếu có).
- `POST /api/services/requests/:id/upload-receipt`: Tải ảnh biên lai minh chứng chuyển khoản (dùng Multer).
- `GET /api/services/my-requests`: Danh sách yêu cầu của sinh viên kèm trạng thái, đếm ngược SLA và mã nhận kết quả.
- `GET /api/services/requests/:id`: Chi tiết tiến trình hồ sơ, file PDF kết quả, thông tin tài khoản chuyển khoản hoặc mã vận đơn.
- `GET /api/services/public/track`: Tra cứu hồ sơ dành riêng cho cựu sinh viên (bằng mã hồ sơ + CCCD).
- `POST /api/services/requests/:id/rate`: Sinh viên đánh giá chất lượng dịch vụ (1-5 sao).

#### 👨‍💼 Nhóm API Dành cho Cán bộ thụ lý & Tiếp tân Một cửa:
- `POST /api/services/staff/requests/:id/confirm-payment`: Cán bộ Một cửa / Kế toán xác nhận biên lai hợp lệ $\rightarrow$ chuyển trạng thái đã nộp tiền.
- `POST /api/services/staff/requests/:id/reject-payment`: Cán bộ từ chối biên lai kèm lý do (thiếu tiền, ảnh mờ) $\rightarrow$ yêu cầu nộp lại.
- `GET /api/services/staff/requests`: Danh sách hồ sơ được phân công (lọc: Chờ duyệt tiền, Mới, Đang xử lý, Quá hạn, Chờ trả).
- `PATCH /api/services/staff/requests/:id/status`: Cập nhật trạng thái (Tiếp nhận, Duyệt, Sẵn sàng nhận, Bàn giao bưu điện).
- `POST /api/services/staff/requests/:id/handover`: Quét mã Pickup QR của sinh viên tại quầy để xác nhận đã trả kết quả.
- `POST /api/services/staff/requests/:id/dispatch-postal`: Cập nhật mã vận đơn bưu điện (VNPost / Viettel Post).
- `POST /api/services/staff/requests/:id/explain-overdue`: Gửi báo cáo giải trình lý do quá hạn.
- `POST /api/services/staff/requests/:id/generate-pdf`: Tự động sinh PDF có mã QR xác thực.

#### 🌐 Công khai:
- `GET /api/services/verify/:documentCode`: Trang web công khai xác thực giấy tờ gốc qua mã QR.

## 6. Kế hoạch triển khai kỹ thuật (Implementation Steps)
1. **Bước 1 (Backend Foundation & Data Models)**: Tạo các models `ServiceCatalog`, `ServiceRequest`, `ServiceRequestLog`, viết seeder danh mục dịch vụ mẫu.
2. **Bước 2 (Admin Portal Catalog Management)**: Thêm tab "Dịch vụ Một cửa" trong `backend/public/admin/index.html` với giao diện Thêm/Sửa/Bật-Tắt dịch vụ động, thiết lập phòng ban, cán bộ, lãnh đạo, SLA và phí.
3. **Bước 3 (Dispatch & Notification Engine)**: Mở rộng `emailReportService.js` và `notificationCenter.js` để tự động gửi Push + Email cho đúng cán bộ và lãnh đạo theo cấu hình của từng dịch vụ.
4. **Bước 4 (Payment & Receipt Upload Engine)**: Tích hợp module hiển thị VietQR và upload ảnh biên lai minh chứng, màn hình duyệt tiền 1 chạm cho cán bộ.
5. **Bước 5 (SLA Monitor & Overdue Escalation Cron)**: Thiết lập cronjob kiểm tra deadline, tự động đánh dấu quá hạn, gửi email cảnh báo và ép buộc giải trình.
6. **Bước 6 (Mobile Student Interface - Dynamic UI)**: Xây dựng màn hình Một cửa cho sinh viên trên App lấy dữ liệu động từ API `GET /api/services`: render danh mục đang active, form nộp đơn pre-fill, theo dõi tiến trình (stepper), tải PDF, mã Pickup QR và modal đánh giá 5 sao.
7. **Bước 7 (Alumni Web Portal & Staff View)**: Xây dựng cổng web nộp đơn cho Cựu sinh viên, giao diện xử lý đơn cho cán bộ (duyệt, gán mã bưu điện, quét mã giao kết quả, modal giải trình) và dashboard báo cáo cho lãnh đạo.
8. **Bước 8 (Verification Portal & Testing)**: Hoàn thiện trang web tra cứu QR code công khai và bộ kiểm thử tự động (Unit test, Integration test).
