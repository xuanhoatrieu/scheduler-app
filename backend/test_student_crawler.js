// Test script to run the real student crawler against TUAF Student Portal
require('dotenv').config({ path: __dirname + '/.env' });
const { syncStudentData } = require('./services/studentCrawler');

const testUsername = 'DTN245748004';
const testPassword = 'DTN245748004';

console.log('==================================================');
console.log('🧪 TESTING STUDENT CRAWLER ENGINE');
console.log('==================================================');
console.log(`👤 Student ID: ${testUsername}`);
console.log('⏳ Running crawlers, please wait...');

async function run() {
  try {
    const data = await syncStudentData(testUsername, testPassword, {
      semester: '2',
      schoolYear: '2025' // HocKy 2, NamHoc 2025-2026
    });

    console.log('\n==================================================');
    console.log('🎉 CRAWLER COMPLETED SUCCESSFULLY!');
    console.log('==================================================');
    console.log(`👤 Student Name: ${data.fullName}`);
    console.log(`🏫 Class:        ${data.className}`);
    console.log(`🎓 Department:   ${data.department}`);
    console.log('--------------------------------------------------');
    console.log(`📅 Schedules crawled: ${data.scheduleList.length} classes`);
    if (data.scheduleList.length > 0) {
      console.log('   Sample class:', JSON.stringify(data.scheduleList[0], null, 2));
    }
    console.log(`📝 Exam schedules:    ${data.examList.length} exams`);
    console.log(`🎓 Grades crawled:    ${data.gradeList.length} courses`);
    console.log(`📚 Curriculum (CTĐT): ${data.curriculumList ? data.curriculumList.length : 0} courses`);
    if (data.curriculumList && data.curriculumList.length > 0) {
      console.log('   Sample curriculum course:', JSON.stringify(data.curriculumList[0], null, 2));
    }
    console.log('💰 Tuition Finance:', JSON.stringify(data.financeData, null, 2));
    console.log('==================================================');
  } catch (error) {
    console.error('\n❌ CRAWLER TEST FAILED:', error.message);
  }
}

run();
