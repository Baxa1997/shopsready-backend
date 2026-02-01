/**
 * Test the "Translate-Then-Search" architecture with problematic products
 * These are products that would fail with literal keyword matching
 */

const { groupProducts } = require('./services/taxonomyService');

// Problematic products that fail with literal keyword matching
const problematicProducts = [
  {
    title: 'Organic Cotton Baby Onesie',
    description: 'Soft organic cotton onesie for newborns',
    sku: 'ONESIE-001',
    price: 19.99,
    variants: []
  },
  {
    title: 'Stainless Steel Kitchen Knife Set',
    description: 'Professional chef knives',
    sku: 'KNIFE-001',
    price: 89.99,
    variants: []
  },
  {
    title: 'High-Performance Running Shoes',
    description: 'Athletic footwear for serious runners',
    sku: 'SHOES-001',
    price: 129.99,
    variants: []
  }
];

async function runTest() {
  console.log('🧪 Testing "Translate-Then-Search" with Problematic Products\n');
  console.log('=' .repeat(80));
  console.log('\nThese products would FAIL with literal keyword matching:');
  console.log('1. "Organic Cotton Baby Onesie" → Would match "Volatile Organic Compound Meters"');
  console.log('2. "Stainless Steel Kitchen Knife" → Would match "Stainless Steel Cleaners"');
  console.log('3. "High-Performance Running Shoes" → Would match "High Waisted Briefs"');
  console.log('\n' + '='.repeat(80));
  
  try {
    const results = await groupProducts(problematicProducts, 'test-shop');
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 RESULTS:\n');
    
    results.forEach((product, index) => {
      console.log(`${index + 1}. ${product.title}`);
      console.log(`   📁 Category: ${product.category}`);
      console.log(`   🆔 GID: ${product.google_product_category}`);
      console.log(`   🔧 Method: ${product.method}`);
      
      // Check if it's correct
      const isCorrect = 
        (product.title.includes('Onesie') && product.category.includes('Baby')) ||
        (product.title.includes('Knife') && product.category.includes('Knife')) ||
        (product.title.includes('Running Shoes') && product.category.includes('Shoe'));
      
      console.log(`   ${isCorrect ? '✅ CORRECT' : '❌ WRONG'}`);
      console.log('');
    });
    
    console.log('=' .repeat(80));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();
