/**
 * Comprehensive test for Keyword-Based Search Engine
 */

const { _internal } = require('./services/taxonomyService');
const { getSmartCandidates } = _internal;

console.log('🧪 Testing Keyword-Based Search Engine\n');
console.log('='.repeat(80));

// Test 1: Running Shoes
console.log('\n📌 TEST 1: Nike Air Max Running Shoes');
const candidates1 = getSmartCandidates('Nike Air Max Running Shoes - Men\'s Size 10');
console.log('\nTop 5 Candidates:');
candidates1.slice(0, 5).forEach((c, i) => {
  console.log(`  ${i + 1}. [Score: ${c.score}] ${c.path}`);
});

// Test 2: Coffee Table
console.log('\n\n📌 TEST 2: Modern Oak Coffee Table');
const candidates2 = getSmartCandidates('Modern Oak Coffee Table with Storage Drawer');
console.log('\nTop 5 Candidates:');
candidates2.slice(0, 5).forEach((c, i) => {
  console.log(`  ${i + 1}. [Score: ${c.score}] ${c.path}`);
});

// Test 3: Green Tea
console.log('\n\n📌 TEST 3: Organic Green Tea');
const candidates3 = getSmartCandidates('Organic Green Tea - 100 Bags');
console.log('\nTop 5 Candidates:');
candidates3.slice(0, 5).forEach((c, i) => {
  console.log(`  ${i + 1}. [Score: ${c.score}] ${c.path}`);
});

// Test 4: Dog Bowl
console.log('\n\n📌 TEST 4: Dog Food Bowl');
const candidates4 = getSmartCandidates('Dog Food Bowl - Stainless Steel');
console.log('\nTop 5 Candidates:');
candidates4.slice(0, 5).forEach((c, i) => {
  console.log(`  ${i + 1}. [Score: ${c.score}] ${c.path}`);
});

// Test 5: Headphones
console.log('\n\n📌 TEST 5: Wireless Bluetooth Headphones');
const candidates5 = getSmartCandidates('Wireless Bluetooth Headphones with Noise Cancellation');
console.log('\nTop 5 Candidates:');
candidates5.slice(0, 5).forEach((c, i) => {
  console.log(`  ${i + 1}. [Score: ${c.score}] ${c.path}`);
});

console.log('\n' + '='.repeat(80));
console.log('✅ Test completed!\n');
