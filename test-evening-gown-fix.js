/**
 * Test the exact products from the production response
 * Focus on the Evening Gown issue
 */

const { groupProducts } = require('./services/taxonomyService');

const products = [
  {
    title: 'Midnight Silk Evening Gown - Ruby Red',
    sku: 'DRS-99-R',
    price: '150.00',
    variants: []
  },
  {
    title: 'Midnight Silk Evening Gown - Onyx Black',
    sku: 'DRS-99-B',
    price: '150.00',
    variants: []
  }
];

async function runTest() {
  console.log('🧪 Testing Evening Gown Categorization Fix\n');
  console.log('='.repeat(80));
  console.log('\nExpected: Apparel & Accessories > Clothing > Dresses');
  console.log('Previous (WRONG): Lingerie > Women\'s Underpants > Period Underwear\n');
  console.log('='.repeat(80) + '\n');
  
  try {
    const results = await groupProducts(products, 'test-shop');
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 RESULTS:\n');
    
    results.forEach((result, index) => {
      const isCorrect = result.category.toLowerCase().includes('dress') && 
                       !result.category.toLowerCase().includes('underwear') &&
                       !result.category.toLowerCase().includes('lingerie');
      
      console.log(`${index + 1}. ${result.title}`);
      console.log(`   Category: ${result.category}`);
      console.log(`   Method: ${result.method}`);
      console.log(`   ${isCorrect ? '✅ CORRECT' : '❌ WRONG - Still matching underwear!'}`);
      console.log('');
    });
    
    const allCorrect = results.every(r => 
      r.category.toLowerCase().includes('dress') && 
      !r.category.toLowerCase().includes('underwear') &&
      !r.category.toLowerCase().includes('lingerie')
    );
    
    console.log('='.repeat(80));
    if (allCorrect) {
      console.log('\n✅ SUCCESS! Evening gowns are now correctly categorized as Dresses!\n');
    } else {
      console.log('\n❌ FAILED! Evening gowns are still being miscategorized!\n');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();
