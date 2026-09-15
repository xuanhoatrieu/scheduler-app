require('dotenv').config({ path: __dirname + '/.env' });
const { connectDB } = require('./config/db');
const User = require('./models/User');
const Schedule = require('./models/Schedule');
const Attendance = require('./models/Attendance');
const StudentAttendance = require('./models/StudentAttendance');
const HomeroomNotification = require('./models/HomeroomNotification');
const { sendInspectorReportEmail } = require('./services/emailReportService');

async function runTest() {
  console.log('==================================================');
  console.log('🧪 TEST: GIẢNG VIÊN & THANH TRA & GVCN INTEGRATION');
  console.log('==================================================');

  await connectDB();

  // 1. Create/Find a test Lecturer and Schedule
  let testLecturer = await User.findOne({ where: { role: 'lecturer' } });
  if (!testLecturer) {
    testLecturer = await User.create({
      username: 'test_gv',
      encryptedPassword: 'test_hash',
      fullName: 'Giảng Viên Kiểm Thử',
      role: 'lecturer',
      tuafLecturerId: '261b53fe-348b-4f38-9928-27f002efdca2' // ID thật từ STU_GiaoVienChuNghiem
    });
  } else {
    testLecturer.tuafLecturerId = '261b53fe-348b-4f38-9928-27f002efdca2';
    await testLecturer.save();
  }
  console.log('👤 Lecturer:', testLecturer.fullName, `(ID: ${testLecturer.id})`);

  let testSchedule = await Schedule.findOne({ where: { userId: testLecturer.id } });
  if (!testSchedule) {
    testSchedule = await Schedule.create({
      userId: testLecturer.id,
      courseName: 'Lập trình ứng dụng phân tán',
      credits: 3,
      classCode: 'TY 54N01',
      idLopTc: 13510,
      studyTime: '2026-09-01 -> 2026-12-31',
      dayOfWeek: 3,
      room: 'A1-203',
      teacherName: testLecturer.fullName,
      periodText: '1-3',
      semester: 'HocKy1',
      schoolYear: '2026-2027',
      batch: 'Dothoc1'
    });
  }
  console.log('📅 Schedule:', testSchedule.courseName, `(ID: ${testSchedule.id})`);

  // 2. Test saving Student Attendance
  console.log('\n--- 1. Testing Student Attendance Save & Upsert ---');
  const testDate = '2026-09-16';
  const records = [
    { studentCode: 'DTN225305376', studentName: 'Nguyễn Linh Ngọc', studentClass: 'TY 54N01', status: 'present', note: '' },
    { studentCode: 'DTN225305001', studentName: 'Trần Văn Vắng', studentClass: 'TY 54N01', status: 'absent', note: 'Nghỉ không phép' },
    { studentCode: 'DTN225305002', studentName: 'Lê Thị Muộn', studentClass: 'TY 54N01', status: 'late', note: 'Vào muộn 20 phút' }
  ];

  for (const item of records) {
    await StudentAttendance.upsert({
      scheduleId: testSchedule.id,
      date: testDate,
      classCode: testSchedule.classCode,
      courseName: testSchedule.courseName,
      studentCode: item.studentCode,
      studentName: item.studentName,
      studentClass: item.studentClass,
      status: item.status,
      note: item.note,
      lecturerId: testLecturer.id
    });
  }

  const savedList = await StudentAttendance.findAll({
    where: { scheduleId: testSchedule.id, date: testDate }
  });
  console.log(`✅ Saved ${savedList.length} student attendance records!`);

  // 3. Test Homeroom Notification creation
  console.log('\n--- 2. Testing Homeroom Notification Alert ---');
  const abnormal = records.filter(r => ['absent', 'late', 'excused'].includes(r.status));
  const notif = await HomeroomNotification.create({
    homeroomClass: 'TY 54N01',
    homeroomTeacherId: testLecturer.id,
    tuafLecturerId: testLecturer.tuafLecturerId,
    scheduleId: testSchedule.id,
    courseName: testSchedule.courseName,
    sessionDate: testDate,
    periodText: testSchedule.periodText,
    room: testSchedule.room,
    courseTeacherName: testLecturer.fullName,
    absentCount: abnormal.filter(r => r.status === 'absent').length,
    lateCount: abnormal.filter(r => r.status === 'late').length,
    excusedCount: abnormal.filter(r => r.status === 'excused').length,
    studentDetails: JSON.stringify(abnormal),
    isRead: false
  });
  console.log(`✅ Homeroom Notification created! (ID: ${notif.id}, Class: ${notif.homeroomClass}, Absent: ${notif.absentCount}, Late: ${notif.lateCount})`);

  // 4. Test Inspector Attendance with Rescheduled (Có phép / Không phép)
  console.log('\n--- 3. Testing Inspector Rescheduled Status ---');
  await Attendance.destroy({ where: { date: testDate, scheduleId: testSchedule.id } });
  const inspAttendancePermitted = await Attendance.create({
    date: testDate,
    scheduleId: testSchedule.id,
    lecturerId: testLecturer.id,
    inspectorId: testLecturer.id,
    scheduledStart: '07:00',
    scheduledEnd: '09:40',
    status: 'rescheduled',
    hasPermission: true,
    rescheduledDate: '2026-09-20',
    rescheduledReason: 'Bận công tác Hội đồng trường (Đã có đơn duyệt)',
    note: 'Đã báo cáo trước',
    semester: 'HocKy1',
    schoolYear: '2026-2027'
  });
  console.log('✅ Inspector Attendance (Có phép) created:', inspAttendancePermitted.status, 'hasPermission:', inspAttendancePermitted.hasPermission);

  // 5. Test Email Report generation
  console.log('\n--- 4. Testing Email Report Generation & Preview ---');
  const reportResult = await sendInspectorReportEmail({
    from: testDate,
    to: testDate,
    periodType: 'daily'
  });
  console.log('✅ Email Report Summary:', JSON.stringify(reportResult.summary || reportResult.previewSummary, null, 2));

  console.log('\n==================================================');
  console.log('🎉 ALL BACKEND TESTS PASSED SUCCESSFULLY!');
  console.log('==================================================');
  process.exit(0);
}

runTest().catch(e => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
