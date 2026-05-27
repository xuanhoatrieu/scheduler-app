/**
 * Đổi API_BASE_URL sau khi deploy lên Render:
 *   export const API_BASE_URL = 'https://TÊN-APP.onrender.com';
 *
 * Khi test local (Android emulator):
 *   export const API_BASE_URL = 'http://10.0.2.2:3001';
 *
 * Khi test local (điện thoại thật, cùng WiFi):
 *   export const API_BASE_URL = 'http://192.168.x.x:3001';
 */
export const API_BASE_URL = 'https://lichhoc-backend.onrender.com'; // ← thay URL Render của bạn

export const DEMO_DATA = {
  studentInfo: {
    maSV:   'K225520121001',
    hoTen:  'Nguyễn Văn An',
    lop:    'K52 - CNTT',
    khoa:   'Khoa CNTT & Toán',
    nganh:  'Công nghệ thông tin',
    portal: 'TUAF',
  },
  schedule: [
    { thu:'Thứ 2', monHoc:'Lập trình Web',    tiet:'1-3',  start:'06:45', end:'09:15',  phongHoc:'A101', giangVien:'TS. Nguyễn Văn A', nhom:'N01' },
    { thu:'Thứ 2', monHoc:'Cơ sở dữ liệu',   tiet:'4-6',  start:'09:15', end:'11:00',  phongHoc:'B203', giangVien:'ThS. Trần Thị B',  nhom:'N02' },
    { thu:'Thứ 3', monHoc:'Mạng máy tính',   tiet:'7-9',  start:'12:30', end:'15:00',  phongHoc:'C305', giangVien:'TS. Lê Văn C',     nhom:'N01' },
    { thu:'Thứ 4', monHoc:'Lập trình Web',    tiet:'1-3',  start:'06:45', end:'09:15',  phongHoc:'A102', giangVien:'TS. Nguyễn Văn A', nhom:'N01' },
    { thu:'Thứ 4', monHoc:'Trí tuệ nhân tạo',tiet:'4-6',  start:'09:15', end:'11:00',  phongHoc:'D401', giangVien:'PGS. Phạm D',      nhom:'N03' },
    { thu:'Thứ 5', monHoc:'Cơ sở dữ liệu',   tiet:'1-3',  start:'06:45', end:'09:15',  phongHoc:'B204', giangVien:'ThS. Trần Thị B',  nhom:'N02' },
    { thu:'Thứ 6', monHoc:'Mạng máy tính',   tiet:'7-9',  start:'12:30', end:'15:00',  phongHoc:'C306', giangVien:'TS. Lê Văn C',     nhom:'N01' },
    { thu:'Thứ 7', monHoc:'Trí tuệ nhân tạo',tiet:'4-6',  start:'09:15', end:'11:00',  phongHoc:'D402', giangVien:'PGS. Phạm D',      nhom:'N03' },
  ],
};
