/**
 * Test script for AI-First Reverse Search Architecture
 * Run: node test-ai-first.js
 */

const { groupProducts } = require('./services/taxonomyService');

// Test products with various complexity levels
const testProducts = [
  {
    title: 'Modern Oak Coffee Table with Storage Drawer',
    description: 'Beautiful handcrafted coffee table',
    sku: 'COFFEE-001',
    price: 299.99,
    variants: []
  },
  {
    title: 'Nike Air Max Running Shoes - Men\'s Size 10',
    description: 'High-performance athletic footwear',
    sku: 'SHOES-001',
    price: 129.99,
    variants: []
  },
  {
    title: 'Wireless Bluetooth Headphones with Noise Cancellation',
    description: 'Premium audio experience',
    sku: 'AUDIO-001',
    price: 199.99,
    variants: []
  },
  {
    title: 'Organic Green Tea - 100 Bags',
    description: 'Premium loose leaf tea',
    sku: 'TEA-001',
    price: 24.99,
    variants: []
  },
  {
    title: 'Dog Food Bowl - Stainless Steel',
    description: 'Durable pet feeding bowl',
    sku: 'PET-001',
    price: 15.99,
    variants: []
  }
];

async function runTest() {
  console.log('🧪 Testing AI-First Reverse Search Architecture\n');
  console.log('=' .repeat(80));
  
  try {
    const results = await groupProducts(testProducts, 'test-shop');
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 DETAILED RESULTS:\n');
    
    results.forEach((product, index) => {
      console.log(`${index + 1}. ${product.title}`);
      console.log(`   📁 Category: ${product.category}`);
      console.log(`   🆔 GID: ${product.google_product_category}`);
      console.log(`   ✏️  Refined: ${product.refined_title}`);
      console.log(`   📝 Description: ${product.description.substring(0, 100)}...`);
      console.log(`   🔧 Method: ${product.method}`);
      console.log('');
    });
    
    console.log('=' .repeat(80));
    console.log('✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

runTest();
