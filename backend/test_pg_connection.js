const { Client } = require('pg');

const passwords = [
  'vitts',
  'vítt',
  'vit',
  'postgres',
  'tuaf',
  'vitts-postgres',
];

const host = '172.17.0.2'; // Docker IP

async function testPasswords() {
  console.log('📡 Brute-forcing postgres connection with potential passwords on ' + host + '...');
  
  for (const pass of passwords) {
    const connectionString = `postgresql://vitts:${encodeURIComponent(pass)}@${host}:5432/vitts`;
    const client = new Client({ connectionString });
    
    try {
      await client.connect();
      console.log(`\n🎉 SUCCESS: Connected successfully with password: "${pass}"!`);
      const res = await client.query('SELECT version();');
      console.log('📊 PostgreSQL Version:', res.rows[0].version);
      await client.end();
      process.exit(0);
    } catch (err) {
      console.log(`❌ FAILED for "${pass}": ${err.message}`);
    }
  }
  
  console.log('\n❌ All passwords failed.');
  process.exit(1);
}

testPasswords();
