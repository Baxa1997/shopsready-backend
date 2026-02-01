/**
 * Test context-aware penalties with the exact products from the user's response
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
    title: 'Vintage Leather Bomber Jacket - Distressed Brown',
    sku: 'JKT-LTH-BR',
    price: '450.00',
    variants: []
  },
  {
    title: 'Organic Cotton Baby Onesie - 6 Months',
    sku: 'BB-ONE-06M',
    price: '18.00',
    variants: []
  },
  {
    title: 'Professional Stainless Steel Chef Knife (8 inch)',
    sku: 'KNF-CHEF-08',
    price: '85.00',
    variants: []
  }
];

async function runTest() {
  console.log('🧪 Testing Context-Aware Penalties\n');
  console.log('='.repeat(80));
  console.log('\nExpected Results:');
  console.log('1. Evening Gown → Should be "Dresses" NOT "Dance Costumes"');
  console.log('2. Bomber Jacket → Should be "Adult Outerwear" NOT "Baby Jackets"');
  console.log('3. Baby Onesie → Should be "Baby One-Pieces" NOT "Swimwear"');
  console.log('4. Chef Knife → Should be "Chef\'s Knives" NOT "Knife Sets"');
  console.log('\n' + '='.repeat(80) + '\n');
  
  try {
    const results = await groupProducts(products, 'test-shop');
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 RESULTS:\n');
    
    const checks = [
      {
        title: 'Evening Gown',
        result: results[0],
        shouldContain: ['dress'],
        shouldNotContain: ['dance', 'costume', 'activewear']
      },
      {
        title: 'Bomber Jacket',
        result: results[1],
        shouldContain: ['jacket', 'coat', 'outerwear'],
        shouldNotContain: ['baby', 'toddler', 'infant']
      },
      {
        title: 'Baby Onesie',
        result: results[2],
        shouldContain: ['baby', 'one-piece'],
        shouldNotContain: ['swimwear', 'swim']
      },
      {
        title: 'Chef Knife',
        result: results[3],
        shouldContain: ['knife', 'knives'],
        shouldNotContain: ['cleaner', 'polish', 'set']
      }
    ];
    
    checks.forEach((check, index) => {
      const catLower = check.result.category.toLowerCase();
      const hasCorrect = check.shouldContain.some(word => catLower.includes(word));
      const hasWrong = check.shouldNotContain.some(word => catLower.includes(word));
      const isCorrect = hasCorrect && !hasWrong;
      
      console.log(`${index + 1}. ${check.title}`);
      console.log(`   Title: ${check.result.title}`);
      console.log(`   Category: ${check.result.category}`);
      console.log(`   Method: ${check.result.method}`);
      console.log(`   ${isCorrect ? '✅ CORRECT' : '❌ WRONG'}`);
      
      if (!isCorrect) {
        if (!hasCorrect) {
          console.log(`   ⚠️  Missing: ${check.shouldContain.join(', ')}`);
        }
        if (hasWrong) {
          console.log(`   ⚠️  Contains wrong: ${check.shouldNotContain.filter(w => catLower.includes(w)).join(', ')}`);
        }
      }
      console.log('');
    });
    
    const correctCount = checks.filter(c => {
      const catLower = c.result.category.toLowerCase();
      return c.shouldContain.some(w => catLower.includes(w)) && 
             !c.shouldNotContain.some(w => catLower.includes(w));
    }).length;
    
    console.log('='.repeat(80));
    console.log(`\n📊 Score: ${correctCount}/${checks.length} correct (${(correctCount/checks.length*100).toFixed(0)}%)\n`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();
