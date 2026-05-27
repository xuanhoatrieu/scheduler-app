require('dotenv').config({ path: __dirname + '/.env' });
const { encrypt, decrypt } = require('./utils/security');

const testPassword = 'DTN245748004_tuaf_secret_password';

console.log('==================================================');
console.log('🧪 TESTING SECURITY MODULE: AES-256-CBC');
console.log('==================================================');
console.log(`🔑 Original Password: "${testPassword}"`);

try {
  // 1. Test Encryption
  const encrypted = encrypt(testPassword);
  console.log(`🔒 Encrypted String:  "${encrypted}"`);
  console.log(`   (Format is ivHex:encryptedHex)`);
  
  // 2. Test Decryption
  const decrypted = decrypt(encrypted);
  console.log(`🔓 Decrypted Password: "${decrypted}"`);
  
  // 3. Assert Correctness
  if (testPassword === decrypted) {
    console.log('\n✅ TEST PASSED: Decrypted password exactly matches original!');
  } else {
    console.error('\n❌ TEST FAILED: Password mismatch after decryption!');
  }
} catch (error) {
  console.error('\n❌ TEST ERROR: Encryption or Decryption threw an exception:', error.message);
}
console.log('==================================================');
