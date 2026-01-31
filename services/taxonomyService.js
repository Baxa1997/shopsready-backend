const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * PRODUCTION-READY CONFIG
 */
const CONFIG = {
  BATCH_SIZE: 30, // Optimized for GPT-4o-mini context window and cost
  AI_MODEL: "gpt-4o-mini",
  TAXONOMY_PATH: path.join(__dirname, '..', 'data', 'categories.json')
};

/**
 * TAXONOMY ENGINE (O(1) Optimization)
 * We store categories in a Map for lightning-fast lookups.
 */
let officialTaxonomyMap = new Map();
let taxonomyMetadata = { total: 0, version: 'unknown' };

try {
  const rawData = fs.readFileSync(CONFIG.TAXONOMY_PATH);
  const parsedData = JSON.parse(rawData);

  let rawList = [];
  if (parsedData.verticals) {
    const flatten = (items) => items.reduce((acc, item) => {
      acc.push(item);
      if (item.children?.length) acc.push(...flatten(item.children));
      return acc;
    }, []);
    rawList = flatten(parsedData.verticals.flatMap(v => v.categories || []));
  } else if (Array.isArray(parsedData)) {
    rawList = parsedData;
  }

  // Optimize: Build a Map for O(1) name-to-category resolution
  rawList.forEach(cat => {
    if (cat.name) {
      officialTaxonomyMap.set(cat.name.toLowerCase(), {
        id: cat.id,
        path: cat.full_name || cat.name
      });
    }
  });

  taxonomyMetadata.total = officialTaxonomyMap.size;
  console.log(`🚀 Production Taxonomy Engine Ready. Indexing ${taxonomyMetadata.total} category nodes.`);
} catch (error) {
  console.error("❌ Critical: Taxonomy Loading Failed:", error.message);
}

/**
 * AI BATCH PROCESSOR
 * Reduces API calls by 95% compared to one-by-one processing.
 */
const batchIdentifyWithAI = async (titles) => {
  if (!titles.length) return {};

  try {
    const response = await openai.chat.completions.create({
      model: CONFIG.AI_MODEL,
      messages: [
        {
          role: "system",
          content: `You are a Shopify Product Architect. Map these product titles to their Shopify "Standard Product Taxonomy" paths. 
          Return ONLY a valid JSON object where Keys are the exact titles and Values are the full category paths (e.g. "Home & Garden > Kitchen > Cookware").`
        },
        {
          role: "user",
          content: JSON.stringify(titles)
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error("⚠️ AI Batch Error:", error.message);
    return {};
  }
};

/**
 * ROBUST HANDLE GENERATOR
 */
const generateHandle = (title, shopId = 'default') => {
  if (!title) return `null-${Date.now()}`;
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  return `${shopId}-${slug || 'gen-' + Math.random().toString(36).substring(7)}`;
};

/**
 * PRODUCT HARMONIZER (BATCHED)
 */
const groupProducts = async (products, shopId = 'default') => {
  if (!Array.isArray(products) || !products.length) return [];

  const grouped = new Map();
  const titlesToProcess = new Set();
  const categoryCache = new Map();

  // Step 1: Normalize titles and identify titles needing AI
  for (const item of products) {
    const rawTitle = item.title || "Untitled Product";
    // Improved baseTitle extraction: split by hyphen, pipe, or slash
    const baseTitle = rawTitle.split(/[|\-/]/)[0].trim();
    const handle = generateHandle(baseTitle, shopId);

    if (!grouped.has(handle)) {
      // O(1) Lookup: Check local Map first
      const localMatch = officialTaxonomyMap.get(baseTitle.toLowerCase());
      
      grouped.set(handle, {
        shopId,
        title: baseTitle,
        handle,
        category: localMatch ? localMatch.path : null,
        method: localMatch ? "JSON_MATCH" : null,
        variants: []
      });

      if (!localMatch) titlesToProcess.add(baseTitle);
    }

    // Step 2: Build B2B-Ready Variants
    grouped.get(handle).variants.push({
      sku: item.sku || `SKU-${Math.random().toString(36).toUpperCase().substring(7)}`,
      title: item.title,
      price: item.price || "0.00",
      inventory_quantity: parseInt(item.quantity) || 0,
      weight: item.weight || 0.0,
      price_tiers: item.price_tiers || [] // Support for B2B volume pricing
    });
  }

  // Step 3: Concurrency-Safe AI Batching
  const uniqueTitles = Array.from(titlesToProcess);
  for (let i = 0; i < uniqueTitles.length; i += CONFIG.BATCH_SIZE) {
    const chunk = uniqueTitles.slice(i, i + CONFIG.BATCH_SIZE);
    console.log(`🤖 Batch Processing [${i}-${Math.min(i + CONFIG.BATCH_SIZE, uniqueTitles.length)}] unique titles...`);
    
    const aiMappings = await batchIdentifyWithAI(chunk);

    // Apply AI results to the grouped map
    grouped.forEach((product) => {
      if (!product.category && aiMappings[product.title]) {
        product.category = aiMappings[product.title];
        product.method = "AI_REASONING";
      } else if (!product.category) {
        product.category = "General Marketplace Category";
        product.method = "FALLBACK";
      }
    });
  }

  return Array.from(grouped.values());
};

module.exports = { groupProducts, taxonomyMetadata };