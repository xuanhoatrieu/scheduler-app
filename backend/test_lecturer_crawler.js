// Test script to run the lecturer crawler against TUAF Lecturer Portal
require('dotenv').config({ path: __dirname + '/.env' });
const { syncLecturerData } = require('./services/lecturerCrawler');

const testUsername = 'xuanhoatrieu';
const testPassword = 'xuanhoatrieu';

console.log('==================================================');
console.log('🧪 TESTING LECTURER CRAWLER ENGINE (SSO)');
console.log('==================================================');
console.log(`👤 Lecturer Username: ${testUsername}`);
console.log('⏳ Running crawlers, please wait...');

async function run() {
  try {
    const data = await syncLecturerData(testUsername, testPassword, {
      semester: '2',
      schoolYear: '2025' // HocKy 2, NamHoc 2025-2026
    });

    console.log('\n==================================================');
    console.log('🎉 LECTURER CRAWLER COMPLETED SUCCESSFULLY!');
    console.log('==================================================');
    console.log(`👤 Lecturer Name: ${data.fullName}`);
    console.log(`🏫 Title/Class:  ${data.className}`);
    console.log(`🎓 Department:   ${data.department}`);
    console.log('--------------------------------------------------');
    console.log(`📅 Lecture schedules crawled: ${data.scheduleList.length} classes`);
    if (data.scheduleList.length > 0) {
      console.log('   Sample lecture:', JSON.stringify(data.scheduleList[0], null, 2));
    }
    console.log('==================================================');
  } catch (error) {
    console.error('\n❌ CRAWLER TEST FAILED:', error.message);
  }
}

run();
