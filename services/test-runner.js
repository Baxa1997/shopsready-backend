const { groupProducts } = require('./taxonomyService'); // Adjust path if needed

// 1. Mock Data (The same data that was failing before)
const mockData = [
  { title: "Obsidian Glass Coffee Table", sku: "TBL-001" },
  { title: "Midnight Silk Evening Gown", sku: "DRS-099" },
  { title: "Professional Stainless Steel Chef Knife (8 inch)", sku: "KNF-008" },
  { title: "High-Performance Waterproof Running Shoes", sku: "SHOE-RUN" }
];

// 2. Run the function
console.log("--- STARTING TEST ---");

groupProducts(mockData, 'test-shop')
  .then(results => {
    console.log("\n--- FINAL RESULTS ---");
    console.log(JSON.stringify(results, null, 2));
  })
  .catch(err => {
    console.error("FATAL ERROR:", err);
  });