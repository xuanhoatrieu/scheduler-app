# API Documentation - TUAF Schedule Backend

Ngày cập nhật: 2026-05-27
Base URL: `http://localhost:5000/api`

---

## 🔐 Authentication

### POST /api/auth/login
Đăng nhập bằng tài khoản cổng trường TUAF, tự động mã hóa AES-256 lưu trữ và khởi tạo tài khoản mới nếu chưa tồn tại trong hệ thống.

* **URL**: `/api/auth/login`
* **Method**: `POST`
* **Headers**: `Content-Type: application/json`
* **Body Parameters**:
  ```json
  {
    "username": "DTN245748004",
    "password": "YOUR_PORTAL_PASSWORD",
    "role": "student"
  }
  ```
  *(Đối với Giảng viên: `role` truyền vào `"lecturer"`)*
  
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "username": "DTN245748004",
      "role": "student",
      "fullName": "CHƯƠNG TRÌNH ĐÀO TẠO",
      "className": "Chưa cập nhật",
      "department": "TUAF",
      "lastSyncedAt": "2026-05-27T13:56:51.000Z"
    }
  }
  ```
  
* **Error Response (401 Unauthorized)**:
  ```json
  {
    "success": false,
    "message": "Đăng nhập không thành công. Vui lòng kiểm tra lại tài khoản và mật khẩu cổng trường!",
    "error": "Error details..."
  }
  ```

---

## 📅 Lịch Học & Lịch Giảng Dạy

### GET /api/schedule
Lấy danh sách thời khóa biểu chi tiết của người dùng từ cache đệm PostgreSQL.

* **URL**: `/api/schedule`
* **Method**: `GET`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`
* **Query Parameters**:
  * `semester` (optional, default: `2`): Học kỳ muốn truy vấn.
  * `schoolYear` (optional, default: `2025`): Năm học muốn truy vấn.
  * `forceSync` (optional, default: `false`): Nếu đặt là `true`, backend sẽ ép buộc cào cổng trường realtime và cập nhật cache PostgreSQL trước khi trả về.

* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "180b62fc-8e47-4934-8c85-7eb786a7ff25",
        "userId": "d74bf561-1250-4824-ad8b-70335759bc43",
        "courseName": "AI trong quản trị doanh nghiệp",
        "credits": 3,
        "classCode": "AI_IT_02",
        "studyTime": "Tiết 1-3",
        "dayOfWeek": 6,
        "room": "D102",
        "teacherName": "Giảng viên TUAF",
        "semester": "HocKy2",
        "schoolYear": "2025-2026",
        "batch": "Dothoc1",
        "createdAt": "2026-05-27T13:56:51.000Z",
        "updatedAt": "2026-05-27T13:56:51.000Z"
      }
    ],
    "lastSyncedAt": "2026-05-27T13:56:51.000Z"
  }
  ```

---

## 📝 Lịch Thi

### GET /api/exams
Lấy lịch thi học kỳ chi tiết của người dùng từ cache đệm PostgreSQL.

* **URL**: `/api/exams`
* **Method**: `GET`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`
* **Query Parameters**: Same as `/api/schedule`

* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "893c52a0-47b8-498c-85a4-129cd8eb4fe1",
        "userId": "d74bf561-1250-4824-ad8b-70335759bc43",
        "courseName": "Cơ sở dữ liệu",
        "examDate": "2026-06-20",
        "examTime": "Ca 2 - 9:30",
        "room": "Phòng thi 101-A1",
        "seatNumber": "045",
        "examFormat": "Trắc nghiệm",
        "semester": "HocKy2",
        "schoolYear": "2025-2026",
        "createdAt": "2026-05-27T13:56:51.000Z",
        "updatedAt": "2026-05-27T13:56:51.000Z"
      }
    ],
    "lastSyncedAt": "2026-05-27T13:56:51.000Z"
  }
  ```

---

## 🏆 Điểm Số & Kết Quả Học Tập

### GET /api/grades
Lấy bảng điểm số học kỳ chi tiết của người dùng từ cache đệm PostgreSQL.

* **URL**: `/api/grades`
* **Method**: `GET`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`
* **Query Parameters**: Same as `/api/schedule`

* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "a93fcfd0-8e47-4934-8c85-12d8a4f6be98",
        "userId": "d74bf561-1250-4824-ad8b-70335759bc43",
        "courseName": "Cơ sở dữ liệu",
        "processGrade": 9,
        "midtermGrade": 8.5,
        "finalGrade": 8,
        "totalGrade10": 8.3,
        "totalGrade4": 3.5,
        "letterGrade": "B+",
        "semester": "HocKy2",
        "schoolYear": "2025-2026",
        "createdAt": "2026-05-27T13:56:51.000Z",
        "updatedAt": "2026-05-27T13:56:51.000Z"
      }
    ],
    "lastSyncedAt": "2026-05-27T13:56:51.000Z"
  }
  ```

---

## 💰 Tài Chính Học Phí

### GET /api/finance
Lấy tổng quan học phí và danh sách biên lai giao dịch hóa đơn chi tiết của người dùng.

* **URL**: `/api/finance`
* **Method**: `GET`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>`
* **Query Parameters**:
  * `semester` (optional, default: `2`): Học kỳ muốn truy vấn.
  * `forceSync` (optional, default: `false`): Ép buộc đồng bộ hóa.

* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "c10fd2f9-9023-45ab-8c9d-1fbc89a7df65",
      "userId": "d74bf561-1250-4824-ad8b-70335759bc43",
      "semester": "HocKy2",
      "totalTuition": 4500000,
      "paidTuition": 4500000,
      "debtTuition": 0,
      "invoiceDetails": [
        {
          "invoiceNo": "HD-92837",
          "amount": 4500000,
          "date": "2026-03-01",
          "description": "Nộp tiền học phí học kỳ 2"
        }
      ],
      "createdAt": "2026-05-27T13:56:51.000Z",
      "updatedAt": "2026-05-27T13:56:51.000Z"
    },
    "lastSyncedAt": "2026-05-27T13:56:51.000Z"
  }
  ```
