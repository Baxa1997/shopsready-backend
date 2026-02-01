/**
 * Test the extreme edge cases from production
 */

const { groupProducts } = require('./services/taxonomyService');

const products = [
  { title: 'Lavender Essential Oil for Aromatherapy', sku: 'OIL-12', price: '15.00', variants: [] },
  { title: 'High-Performance Carbon Fiber Road Bike Frame', sku: 'BIKE-FR', price: '1200.00', variants: [] },
  { title: 'Vintage Mid-Century Modern Teak Sideboard', sku: 'FURN-99', price: '1100.00', variants: [] },
  { title: 'Waterproof High-Waisted Running Briefs', sku: 'UND-01', price: '35.00', variants: [] },
  { title: 'Bluetooth Wireless Karaoke Microphone with Speaker', sku: 'KARA-01', price: '65.00', variants: [] }
];

async function runTest() {
  console.log('🧪 EXTREME EDGE CASES TEST\n');
  console.log('='.repeat(80));
  console.log('\nTesting 5 challenging products that previously failed...\n');
  console.log('='.repeat(80) + '\n');
  
  try {
    const results = await groupProducts(products, 'extreme-test');
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 RESULTS:\n');
    
    const expectations = [
      {
        title: 'Essential Oil',
        shouldContain: ['essential', 'oil', 'aromatherapy'],
        shouldNotContain: ['lip', 'makeup', 'cosmetic'],
        reason: 'Aromatherapy product, not cosmetics'
      },
      {
        title: 'Road Bike Frame',
        shouldContain: ['bike', 'bicycle', 'cycling'],
        shouldNotContain: ['exercise', 'cardio', 'fitness'],
        reason: 'Bicycle part, not exercise equipment'
      },
      {
        title: 'Teak Sideboard',
        shouldContain: ['furniture', 'storage', 'sideboard', 'cabinet'],
        shouldNotContain: ['chair', 'table'],
        reason: 'Storage furniture, not seating'
      },
      {
        title: 'Running Briefs',
        shouldContain: ['underwear', 'brief', 'athletic'],
        shouldNotContain: ['boys', 'girls', 'kids', 'children'],
        reason: 'Adult athletic wear, not children\'s'
      },
      {
        title: 'Karaoke Microphone',
        shouldContain: ['microphone', 'karaoke', 'entertainment'],
        shouldNotContain: ['sampler', 'synthesizer', 'studio'],
        reason: 'Entertainment equipment, not professional audio'
      }
    ];
    
    results.forEach((result, index) => {
      const exp = expectations[index];
      const catLower = result.category.toLowerCase();
      
      const hasCorrect = exp.shouldContain.some(word => catLower.includes(word));
      const hasWrong = exp.shouldNotContain.some(word => catLower.includes(word));
      const isCorrect = hasCorrect && !hasWrong;
      
      console.log(`${index + 1}. ${exp.title}`);
      console.log(`   Expected: ${exp.reason}`);
      console.log(`   ${isCorrect ? '✅' : '❌'} ${result.title.substring(0, 50)}`);
      console.log(`      → ${result.category}`);
      console.log(`      → ${result.method}`);
      
      if (!isCorrect) {
        if (!hasCorrect) {
          console.log(`      ⚠️  Missing: ${exp.shouldContain.join(', ')}`);
        }
        if (hasWrong) {
          console.log(`      ⚠️  Wrong: Contains ${exp.shouldNotContain.filter(w => catLower.includes(w)).join(', ')}`);
        }
      }
      console.log('');
    });
    
    const correctCount = results.filter((r, i) => {
      const exp = expectations[i];
      const catLower = r.category.toLowerCase();
      return exp.shouldContain.some(w => catLower.includes(w)) &&
             !exp.shouldNotContain.some(w => catLower.includes(w));
    }).length;
    
    console.log('='.repeat(80));
    console.log(`\n📊 SCORE: ${correctCount}/5 (${(correctCount/5*100).toFixed(0)}%)\n`);
    
    if (correctCount === 5) {
      console.log('🎉 PERFECT! All edge cases handled correctly!\n');
    } else {
      console.log(`⚠️  ${5 - correctCount} edge case(s) still need work.\n`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();
