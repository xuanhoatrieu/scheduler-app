// Test script to run the real student history crawler
require('dotenv').config({ path: __dirname + '/.env' });
const { syncAllSemesters } = require('./services/studentCrawler');

const testUsername = 'DTN245748004';
const testPassword = 'DTN245748004';

console.log('==================================================');
console.log('🧪 TESTING STUDENT HISTORY CRAWLER ENGINE');
console.log('==================================================');
console.log(`👤 Student ID: ${testUsername}`);
console.log('⏳ Running crawlers, please wait...');

async function run() {
  try {
    const data = await syncAllSemesters(testUsername, testPassword);

    console.log('\n==================================================');
    console.log('🎉 HISTORY CRAWLER COMPLETED SUCCESSFULLY!');
    console.log('==================================================');
    console.log(`👤 Student Name:   ${data.fullName}`);
    console.log(`🏫 Class:          ${data.className}`);
    console.log(`🎓 Department:     ${data.department}`);
    console.log(`📅 Enrollment Year: ${data.enrollmentYear}`);
    console.log('--------------------------------------------------');
    console.log(`🎓 Total Grades Synced:   ${data.allGrades.length} courses`);
    if (data.allGrades.length > 0) {
      console.log('   Sample grade:', JSON.stringify(data.allGrades[0], null, 2));
    }
    console.log(`💰 Total Finance Semesters: ${data.allFinance.length} semesters`);
    if (data.allFinance.length > 0) {
      console.log('   Sample finance:', JSON.stringify(data.allFinance[0], null, 2));
    }
    console.log('==================================================');
  } catch (error) {
    console.error('\n❌ HISTORY CRAWLER TEST FAILED:', error.message);
  }
}

run();
