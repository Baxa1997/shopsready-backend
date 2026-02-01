/**
 * Test single knife product to debug the issue
 */

const { groupProducts } = require('./services/taxonomyService');

const products = [
  {
    title: 'Professional Stainless Steel Chef Knife (8 inch)',
    description: 'High-quality chef knife for professional cooking',
    sku: 'KNIFE-001',
    price: 49.99,
    variants: []
  }
];

async function runTest() {
  console.log('🧪 Testing: Professional Stainless Steel Chef Knife\n');
  console.log('Expected: Kitchen Knives');
  console.log('Problem: Matching "Stainless Steel Cleaners" instead\n');
  console.log('='.repeat(80));
  
  try {
    const results = await groupProducts(products, 'test-shop');
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 RESULT:\n');
    
    const product = results[0];
    console.log(`Title: ${product.title}`);
    console.log(`Category: ${product.category}`);
    console.log(`GID: ${product.google_product_category}`);
    console.log(`Method: ${product.method}`);
    console.log(`Refined Title: ${product.refined_title}`);
    console.log(`Description: ${product.description.substring(0, 100)}...`);
    
    const isCorrect = product.category.toLowerCase().includes('knife');
    console.log(`\n${isCorrect ? '✅ CORRECT - Contains "knife"' : '❌ WRONG - Does NOT contain "knife"'}`);
    
    if (!isCorrect) {
      console.log('\n⚠️  This confirms the translation layer is NOT working correctly!');
      console.log('The AI should translate "Chef Knife" to prevent matching on "Stainless Steel"');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();
