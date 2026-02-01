/**
 * Test all products from the production response
 * Ensure 100% perfect categorization
 */

const { groupProducts } = require('./services/taxonomyService');

const products = [
  { title: 'Obsidian Glass Coffee Table - Round', sku: 'TBL-001-R', price: '299.00', variants: [] },
  { title: 'Obsidian Glass Coffee Table - Square', sku: 'TBL-001-S', price: '310.00', variants: [] },
  { title: 'Midnight Silk Evening Gown - Ruby Red', sku: 'DRS-99-R', price: '150.00', variants: [] },
  { title: 'Midnight Silk Evening Gown - Onyx Black', sku: 'DRS-99-B', price: '150.00', variants: [] },
  { title: 'Professional Stainless Steel Chef Knife (8 inch)', sku: 'KNF-CHEF-08', price: '85.00', variants: [] },
  { title: 'Ergonomic Mesh Office Chair - Lumbar Support', sku: 'CHR-OFF-01', price: '220.00', variants: [] },
  { title: 'Vintage Leather Bomber Jacket - Distressed Brown', sku: 'JKT-LTH-BR', price: '450.00', variants: [] },
  { title: 'Organic Cotton Baby Onesie - 6 Months', sku: 'BB-ONE-06M', price: '18.00', variants: [] },
  { title: 'High-Performance Waterproof Running Shoes - Blue', sku: 'SHOE-RUN-B', price: '125.00', variants: [] },
  { title: 'High-Performance Waterproof Running Shoes - Grey', sku: 'SHOE-RUN-G', price: '125.00', variants: [] },
  { title: 'Modern Ceramic Table Lamp - Minimalist', sku: 'LMP-CER-01', price: '45.00', variants: [] },
  { title: 'Wireless Bluetooth Noise-Canceling Headphones', sku: 'AUD-HP-01', price: '199.00', variants: [] }
];

async function runTest() {
  console.log('🧪 PRODUCTION VALIDATION TEST - All 12 Products\n');
  console.log('='.repeat(80));
  console.log('\nValidating all products from production response...\n');
  console.log('='.repeat(80) + '\n');
  
  try {
    const results = await groupProducts(products, 'test-lab-01');
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 DETAILED RESULTS:\n');
    
    const checks = [
      {
        title: 'Coffee Tables',
        indices: [0, 1],
        shouldContain: ['coffee table'],
        shouldNotContain: ['outdoor'],
        reason: 'Indoor furniture, not outdoor'
      },
      {
        title: 'Evening Gowns',
        indices: [2, 3],
        shouldContain: ['dress'],
        shouldNotContain: ['underwear', 'lingerie', 'period'],
        reason: 'Formal dresses, not underwear'
      },
      {
        title: 'Chef Knife',
        indices: [4],
        shouldContain: ['knife', 'knives'],
        shouldNotContain: ['cleaner', 'sharpener', 'set'],
        reason: 'Single knife, not accessories or sets'
      },
      {
        title: 'Office Chair',
        indices: [5],
        shouldContain: ['chair'],
        shouldNotContain: ['outdoor', 'patio'],
        reason: 'Office furniture, not outdoor'
      },
      {
        title: 'Bomber Jacket',
        indices: [6],
        shouldContain: ['jacket', 'coat', 'outerwear'],
        shouldNotContain: ['baby', 'toddler'],
        reason: 'Adult clothing, not baby'
      },
      {
        title: 'Baby Onesie',
        indices: [7],
        shouldContain: ['baby', 'one-piece'],
        shouldNotContain: ['swimwear', 'swim'],
        reason: 'Baby clothing, not swimwear'
      },
      {
        title: 'Running Shoes',
        indices: [8, 9],
        shouldContain: ['shoe', 'athletic'],
        shouldNotContain: ['cleaner', 'accessories'],
        reason: 'Athletic footwear'
      },
      {
        title: 'Table Lamp',
        indices: [10],
        shouldContain: ['lamp', 'lighting'],
        shouldNotContain: ['outdoor', 'garden'],
        reason: 'Indoor lighting'
      },
      {
        title: 'Headphones',
        indices: [11],
        shouldContain: ['headphone', 'audio'],
        shouldNotContain: ['accessories', 'parts'],
        reason: 'Audio equipment, not accessories'
      }
    ];
    
    let totalCorrect = 0;
    let totalProducts = 0;
    
    checks.forEach((check) => {
      console.log(`\n${check.title}:`);
      console.log(`  Expected: ${check.reason}`);
      
      check.indices.forEach((idx) => {
        const result = results[idx];
        const catLower = result.category.toLowerCase();
        
        const hasCorrect = check.shouldContain.some(word => catLower.includes(word));
        const hasWrong = check.shouldNotContain.some(word => catLower.includes(word));
        const isCorrect = hasCorrect && !hasWrong;
        
        totalProducts++;
        if (isCorrect) totalCorrect++;
        
        console.log(`  ${isCorrect ? '✅' : '❌'} ${result.title.substring(0, 50)}`);
        console.log(`     → ${result.category}`);
        console.log(`     → ${result.method}`);
        
        if (!isCorrect) {
          if (!hasCorrect) {
            console.log(`     ⚠️  Missing: ${check.shouldContain.join(', ')}`);
          }
          if (hasWrong) {
            console.log(`     ⚠️  Wrong: Contains ${check.shouldNotContain.filter(w => catLower.includes(w)).join(', ')}`);
          }
        }
      });
    });
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 FINAL SCORE: ${totalCorrect}/${totalProducts} (${(totalCorrect/totalProducts*100).toFixed(0)}%)\n`);
    
    if (totalCorrect === totalProducts) {
      console.log('🎉 PERFECT! All products correctly categorized!\n');
    } else {
      console.log(`⚠️  ${totalProducts - totalCorrect} product(s) need attention.\n`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();
