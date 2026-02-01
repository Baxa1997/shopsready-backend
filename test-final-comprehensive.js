/**
 * FINAL COMPREHENSIVE TEST - 100% AI-Driven Categorization
 * Tests the complete system with diverse product types
 */

const { groupProducts } = require('./services/taxonomyService');

const products = [
  // Apparel - Adult
  { title: 'Midnight Silk Evening Gown - Ruby Red', sku: 'DRS-99-R', price: '150.00', variants: [] },
  { title: 'Vintage Leather Bomber Jacket - Distressed Brown', sku: 'JKT-LTH-BR', price: '450.00', variants: [] },
  { title: 'Men\'s Running Sneakers - Size 10', sku: 'SHOE-RUN-10', price: '89.99', variants: [] },
  
  // Apparel - Baby
  { title: 'Organic Cotton Baby Onesie - 6 Months', sku: 'BB-ONE-06M', price: '18.00', variants: [] },
  
  // Kitchen
  { title: 'Professional Stainless Steel Chef Knife (8 inch)', sku: 'KNF-CHEF-08', price: '85.00', variants: [] },
  { title: 'Ceramic Mixing Bowl Set - 3 Piece', sku: 'BOWL-MIX-3', price: '35.00', variants: [] },
  
  // Electronics
  { title: 'Wireless Bluetooth Headphones - Noise Cancelling', sku: 'HP-BT-NC', price: '199.00', variants: [] },
  
  // Beverages
  { title: 'Organic Green Tea Bags - 100 Count', sku: 'TEA-GRN-100', price: '12.99', variants: [] },
  
  // Pet Supplies
  { title: 'Stainless Steel Dog Bowl - Large', sku: 'PET-BOWL-L', price: '24.99', variants: [] },
  
  // Furniture
  { title: 'Modern Coffee Table - Walnut Finish', sku: 'FRN-TBL-CF', price: '299.00', variants: [] }
];

async function runTest() {
  console.log('🧪 FINAL COMPREHENSIVE TEST - 100% AI-Driven Categorization\n');
  console.log('='.repeat(80));
  console.log('\nTesting 10 diverse products across multiple categories...\n');
  console.log('='.repeat(80) + '\n');
  
  try {
    const results = await groupProducts(products, 'test-shop');
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 FINAL RESULTS:\n');
    
    let aiVerified = 0;
    let keywordMatch = 0;
    let fallback = 0;
    
    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.title}`);
      console.log(`   Category: ${result.category}`);
      console.log(`   Method: ${result.method}`);
      
      if (result.method === 'AI_TRANSLATION_VERIFIED') {
        console.log(`   ✅ AI VERIFIED (100% confidence)`);
        aiVerified++;
      } else if (result.method.includes('TRANSLATED_KEYWORD_MATCH')) {
        console.log(`   ✅ KEYWORD MATCH (AI-assisted)`);
        keywordMatch++;
      } else {
        console.log(`   ⚠️  FALLBACK`);
        fallback++;
      }
      console.log('');
    });
    
    console.log('='.repeat(80));
    console.log(`\n📊 PERFORMANCE METRICS:`);
    console.log(`   AI Verified: ${aiVerified}/${results.length} (${(aiVerified/results.length*100).toFixed(0)}%)`);
    console.log(`   Keyword Match: ${keywordMatch}/${results.length} (${(keywordMatch/results.length*100).toFixed(0)}%)`);
    console.log(`   Fallback: ${fallback}/${results.length} (${(fallback/results.length*100).toFixed(0)}%)`);
    console.log(`\n   🎯 Total Success Rate: ${((aiVerified + keywordMatch)/results.length*100).toFixed(0)}%\n`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();
