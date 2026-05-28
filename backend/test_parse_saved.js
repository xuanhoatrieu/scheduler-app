const fs = require('fs');
const path = require('path');
const { parseGrades } = require('./services/parsers/studentParser');

const html = fs.readFileSync(path.join(__dirname, 'scratch_html', 'grades_sem.html'), 'utf8');
const parsed = parseGrades(html);

console.log(`Parsed ${parsed.length} courses from grades_sem.html`);
console.log('Sample course:', parsed[0]);
console.log('All course names:', parsed.map(c => c.courseName));
