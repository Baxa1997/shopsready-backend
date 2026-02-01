const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  BATCH_SIZE: 15,
  AI_MODEL: "gemini-2.5-flash",
  TAXONOMY_PATH: path.join(__dirname, '..', 'data', 'categories.json'),
  MIN_WORD_LENGTH: 3,
  MAX_CANDIDATES: 15,
  AUTO_ACCEPT_SCORE: 20,
  EXACT_MATCH_POINTS: 10,
  SUBSTRING_MATCH_POINTS: 5
};

// Emergency fallback taxonomy (safety net)
const EMERGENCY_TAXONOMY = [
  { id: 'gid://shopify/TaxonomyCategory/emergency-1', path: 'Apparel & Accessories' },
  { id: 'gid://shopify/TaxonomyCategory/emergency-2', path: 'Home & Garden' },
  { id: 'gid://shopify/TaxonomyCategory/emergency-3', path: 'Electronics' },
  { id: 'gid://shopify/TaxonomyCategory/emergency-4', path: 'Health & Beauty' },
  { id: 'gid://shopify/TaxonomyCategory/emergency-5', path: 'Sports & Outdoors' },
  { id: 'gid://shopify/TaxonomyCategory/emergency-6', path: 'Toys & Games' },
  { id: 'gid://shopify/TaxonomyCategory/emergency-7', path: 'Food & Beverages' }
];

// Common stop words to filter out
const STOP_WORDS = new Set([
  'and', 'or', 'the', 'for', 'with', 'from', 'to', 'in', 'on', 'at', 'by', 'of'
]);

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(
  process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY
);

// ============================================================================
// HELPER: ROBUST JSON PARSER
// ============================================================================
/**
 * Extracts and parses JSON from AI responses, even if wrapped in markdown or text
 * @param {string} text - Raw AI response text
 * @returns {Object|null} Parsed JSON object or null if parsing fails
 */
const cleanAndParseJSON = (text) => {
  if (!text) return null;

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch (e) {
    // Attempt 1: Extract from markdown code blocks
    const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
      try {
        return JSON.parse(markdownMatch[1].trim());
      } catch (e2) {
        // Continue to next attempt
      }
    }

    // Attempt 2: Find first { to last }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.substring(start, end + 1));
      } catch (e3) {
        // Continue to next attempt
      }
    }

    // Attempt 3: Find first [ to last ]
    const arrayStart = text.indexOf('[');
    const arrayEnd = text.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(text.substring(arrayStart, arrayEnd + 1));
      } catch (e4) {
        // All attempts failed
      }
    }

    console.error('❌ JSON Parse Failed. Raw text:', text.substring(0, 200));
    return null;
  }
};

// ============================================================================
// HELPER: TEXT TOKENIZATION
// ============================================================================
/**
 * Tokenizes text into searchable keywords
 * @param {string} text - Text to tokenize
 * @returns {Array<string>} Array of valid keywords
 */
const tokenize = (text) => {
  if (!text) return [];
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove special characters
    .split(/\s+/) // Split by whitespace
    .filter(word => 
      word.length >= CONFIG.MIN_WORD_LENGTH && 
      !STOP_WORDS.has(word)
    );
};

// ============================================================================
// STAGE 1: THE INVERTED INDEX (ON STARTUP)
// ============================================================================
let officialTaxonomyMap = new Map(); // Map<lowercase_path, { id, path }>
let keywordIndex = new Map(); // Map<word, Set<category_path>>
let allCategories = []; // Array of all category objects

/**
 * Loads the taxonomy database and builds the inverted index
 * Falls back to EMERGENCY_TAXONOMY if file is missing or corrupt
 */
const loadTaxonomy = () => {
  try {
    if (fs.existsSync(CONFIG.TAXONOMY_PATH)) {
      console.log(`📂 Loading taxonomy from: ${CONFIG.TAXONOMY_PATH}`);
      const rawData = fs.readFileSync(CONFIG.TAXONOMY_PATH, 'utf8');
      const parsedData = JSON.parse(rawData);

      // Extract categories from nested structure
      let rawList = [];
      if (parsedData.verticals && Array.isArray(parsedData.verticals)) {
        rawList = parsedData.verticals.flatMap(v => v.categories || []);
      } else if (Array.isArray(parsedData)) {
        rawList = parsedData;
      } else {
        throw new Error('Invalid taxonomy structure');
      }

      // Build the taxonomy map and inverted index
      rawList.forEach(cat => {
        const name = cat.full_name || cat.name;
        if (name && cat.id) {
          const key = name.toLowerCase().trim();
          
          // Store in taxonomy map
          officialTaxonomyMap.set(key, {
            id: cat.id,
            path: name
          });

          // Store in categories array
          allCategories.push({
            id: cat.id,
            path: name,
            pathLower: key
          });

          // Build inverted index
          const keywords = tokenize(name);
          keywords.forEach(keyword => {
            if (!keywordIndex.has(keyword)) {
              keywordIndex.set(keyword, new Set());
            }
            keywordIndex.get(keyword).add(name);
          });
        }
      });

      
    } else {
      throw new Error(`File not found: ${CONFIG.TAXONOMY_PATH}`);
    }
  } catch (error) {
    console.error(`❌ TAXONOMY LOAD ERROR: ${error.message}`);
    console.warn('⚠️  ACTIVATING EMERGENCY TAXONOMY (7 categories)');

    // Load emergency taxonomy
    EMERGENCY_TAXONOMY.forEach(cat => {
      const key = cat.path.toLowerCase().trim();
      
      officialTaxonomyMap.set(key, {
        id: cat.id,
        path: cat.path
      });

      allCategories.push({
        id: cat.id,
        path: cat.path,
        pathLower: key
      });

      const keywords = tokenize(cat.path);
      keywords.forEach(keyword => {
        if (!keywordIndex.has(keyword)) {
          keywordIndex.set(keyword, new Set());
        }
        keywordIndex.get(keyword).add(cat.path);
      });
    });

    console.log(`🆘 Emergency taxonomy loaded: ${officialTaxonomyMap.size} categories`);
  }
};

// Load taxonomy on module initialization
loadTaxonomy();

// ============================================================================
// STAGE 2: THE SEARCH FUNCTION (SMART CANDIDATES)
// ============================================================================
/**
 * Gets smart candidates using keyword-based search with scoring
 * @param {string} title - Product title to search for
 * @returns {Array} Top 15 candidates with scores
 */
const getSmartCandidates = (title) => {
  if (!title || allCategories.length === 0) {
    return [];
  }

  const keywords = tokenize(title);
  if (keywords.length === 0) {
    return [];
  }

  console.log(`  🔎 Keywords extracted: ${keywords.join(', ')}`);

  // Score map: category_path -> score
  const scoreMap = new Map();

  // PHASE 1: Phrase matching (15 points for consecutive words)
  // Look for 2-3 word phrases in the title
  const titleLower = title.toLowerCase();
  for (let i = 0; i < keywords.length - 1; i++) {
    const twoWordPhrase = `${keywords[i]} ${keywords[i + 1]}`;
    const threeWordPhrase = i < keywords.length - 2 
      ? `${keywords[i]} ${keywords[i + 1]} ${keywords[i + 2]}`
      : null;

    // Check three-word phrases first
    if (threeWordPhrase) {
      allCategories.forEach(cat => {
        if (cat.pathLower.includes(threeWordPhrase)) {
          const currentScore = scoreMap.get(cat.path) || 0;
          scoreMap.set(cat.path, currentScore + 15);
        }
      });
    }

    // Check two-word phrases
    allCategories.forEach(cat => {
      if (cat.pathLower.includes(twoWordPhrase)) {
        const currentScore = scoreMap.get(cat.path) || 0;
        scoreMap.set(cat.path, currentScore + 12);
      }
    });
  }

  // PHASE 2: Individual keyword matches
  keywords.forEach(keyword => {
    // Exact keyword matches (10 points)
    if (keywordIndex.has(keyword)) {
      const matchingCategories = keywordIndex.get(keyword);
      matchingCategories.forEach(categoryPath => {
        const currentScore = scoreMap.get(categoryPath) || 0;
        scoreMap.set(categoryPath, currentScore + CONFIG.EXACT_MATCH_POINTS);
      });
    }

    // Substring matches (5 points)
    allCategories.forEach(cat => {
      if (cat.pathLower.includes(keyword)) {
        const currentScore = scoreMap.get(cat.path) || 0;
        // Only add substring points if we haven't already added exact match points
        if (!keywordIndex.has(keyword) || !keywordIndex.get(keyword).has(cat.path)) {
          scoreMap.set(cat.path, currentScore + CONFIG.SUBSTRING_MATCH_POINTS);
        }
      }
    });
  });

  // PHASE 3: Universal AI-Driven Penalties
  // Instead of hardcoding specific product types (shoes, knives, tea, etc.),
  // we apply universal penalties for categories that are commonly false matches.
  // The AI translation layer handles product-type understanding.
  
  const productTitleLower = title.toLowerCase(); // Use this consistently to avoid shadowing
  
  scoreMap.forEach((score, categoryPath) => {
    const catLower = categoryPath.toLowerCase();
    
    // UNIVERSAL PENALTY 1: Cleaning & Maintenance Products
    // Almost never the actual product - they're for maintaining/cleaning the product
    // Examples: "Stainless Steel Cleaners" when searching for "Steel Knife"
    if (catLower.includes('cleaner') || 
        catLower.includes('polish') || 
        catLower.includes('cleaning supplies') ||
        catLower.includes('maintenance') ||
        catLower.includes('care products')) {
      scoreMap.set(categoryPath, score * 0.03); // Extreme penalty
    }
    
    
    // UNIVERSAL PENALTY 2: Accessories & Parts
    // Unless the product title explicitly mentions accessories/parts
    const isAccessoryProduct = productTitleLower.includes('accessory') ||
                                productTitleLower.includes('accessories') ||
                                productTitleLower.includes('part') ||
                                productTitleLower.includes('replacement') ||
                                productTitleLower.includes('spare') ||
                                productTitleLower.includes('adapter') ||
                                productTitleLower.includes('cable') ||
                                productTitleLower.includes('cord');
    
    if (!isAccessoryProduct) {
      if (catLower.includes('accessories') && 
          !catLower.startsWith('apparel & accessories')) { // Allow main apparel category
        scoreMap.set(categoryPath, score * 0.25); // Heavy penalty
      }
      if (catLower.includes('replacement parts') ||
          catLower.includes('spare parts')) {
        scoreMap.set(categoryPath, score * 0.15); // Very heavy penalty
      }
      // Penalize adapters, cables, and couplers for non-cable products
      if (catLower.includes('adapter') ||
          catLower.includes('cable') ||
          catLower.includes('coupler') ||
          catLower.includes('cord')) {
        scoreMap.set(categoryPath, score * 0.1); // Very heavy penalty
      }
    }
    
    // UNIVERSAL PENALTY 3: Measuring & Testing Equipment
    // Unless the product is actually a meter/sensor/tester
    const isMeasuringDevice = productTitleLower.includes('meter') || 
                               productTitleLower.includes('sensor') ||
                               productTitleLower.includes('tester') ||
                               productTitleLower.includes('gauge') ||
                               productTitleLower.includes('detector');
    
    if (!isMeasuringDevice) {
      if (catLower.includes('meters') || 
          catLower.includes('sensors') ||
          catLower.includes('measuring tools') ||
          catLower.includes('test equipment')) {
        scoreMap.set(categoryPath, score * 0.02); // Extreme penalty
      }
    }
    
    // UNIVERSAL PENALTY 4: Storage & Organization
    // Unless the product is actually for storage/organization
    const isStorageProduct = productTitleLower.includes('storage') || 
                              productTitleLower.includes('organizer') ||
                              productTitleLower.includes('holder') ||
                              productTitleLower.includes('rack') ||
                              productTitleLower.includes('stand') ||
                              productTitleLower.includes('case') ||
                              productTitleLower.includes('box');
    
    if (!isStorageProduct) {
      if ((catLower.includes('storage') || 
           catLower.includes('organizers') ||
           catLower.includes('holders') ||
           catLower.includes('racks')) &&
          !catLower.includes('with storage')) { // Allow "table with storage"
        scoreMap.set(categoryPath, score * 0.3); // Heavy penalty
      }
    }
    
    // UNIVERSAL PENALTY 5: Bags & Packaging
    // Unless the product is actually a bag/pouch
    const isBagProduct = productTitleLower.includes('bag') || 
                         productTitleLower.includes('pouch') ||
                         productTitleLower.includes('sack') ||
                         productTitleLower.includes('tote');
    
    if (!isBagProduct) {
      if (catLower.includes('bags') && 
          (catLower.includes('steaming') || 
           catLower.includes('disposable') ||
           catLower.includes('trash') ||
           catLower.includes('garbage'))) {
        scoreMap.set(categoryPath, score * 0.08); // Very heavy penalty
      }
    }
    
    // UNIVERSAL PENALTY 6: Cases & Covers
    // Unless the product is actually a case/cover
    const isCaseProduct = productTitleLower.includes('case') || 
                          productTitleLower.includes('cover') ||
                          productTitleLower.includes('sleeve') ||
                          productTitleLower.includes('skin');
    
    if (!isCaseProduct) {
      if (catLower.includes('cases') || catLower.includes('covers')) {
        scoreMap.set(categoryPath, score * 0.35); // Heavy penalty
      }
    }
    
    // UNIVERSAL PENALTY 7: Sets & Collections
    // Penalize "sets" unless the product explicitly mentions "set"
    const isSetProduct = productTitleLower.includes('set') || 
                         productTitleLower.includes('collection') ||
                         productTitleLower.includes('kit');
    
    if (!isSetProduct) {
      if (catLower.includes('sets') && 
          !catLower.includes('headsets')) { // Allow headsets
        scoreMap.set(categoryPath, score * 0.5); // Heavy penalty
      }
    }
    
    // UNIVERSAL PENALTY 8: Age/Size Context (Baby/Toddler vs Adult)
    // Penalize baby/toddler categories for adult products
    const isBabyProduct = productTitleLower.includes('baby') || 
                          productTitleLower.includes('infant') ||
                          productTitleLower.includes('toddler') ||
                          productTitleLower.includes('newborn') ||
                          /\b\d+\s*(months?|mo)\b/i.test(title); // "6 months", "12 mo"
    
    const isAdultProduct = productTitleLower.includes('men') ||
                           productTitleLower.includes('women') ||
                           productTitleLower.includes('adult') ||
                           productTitleLower.includes('vintage') ||
                           productTitleLower.includes('professional') ||
                           productTitleLower.includes('evening') ||  // Formal wear
                           productTitleLower.includes('cocktail') ||
                           productTitleLower.includes('gown') ||
                           productTitleLower.includes('tuxedo') ||
                           /\b(small|medium|large|xl|xxl)\b/i.test(productTitleLower);
    
    // If not explicitly a baby product, penalize baby categories heavily
    if (!isBabyProduct) {
      if (catLower.includes('baby') || 
          catLower.includes('toddler') ||
          catLower.includes('infant')) {
        scoreMap.set(categoryPath, score * 0.005); // EXTREME penalty - almost eliminate baby categories
      }
    }
    
    // If explicitly a baby product, penalize adult categories
    if (isBabyProduct && !isAdultProduct) {
      if (!catLower.includes('baby') && 
          !catLower.includes('toddler') &&
          !catLower.includes('infant') &&
          !catLower.includes('kids') &&
          !catLower.includes('children')) {
        scoreMap.set(categoryPath, score * 0.4); // Heavy penalty for non-baby categories
      }
    }
    
    // UNIVERSAL PENALTY 9: Usage Context (Swimwear, Activewear, Dance)
    // Penalize specialized usage categories unless explicitly mentioned
    const isSwimwear = productTitleLower.includes('swim') ||
                       productTitleLower.includes('beach') ||
                       productTitleLower.includes('pool') ||
                       productTitleLower.includes('bikini') ||
                       productTitleLower.includes('bathing');
    
    const isActivewear = productTitleLower.includes('sport') ||
                         productTitleLower.includes('athletic') ||
                         productTitleLower.includes('gym') ||
                         productTitleLower.includes('workout') ||
                         productTitleLower.includes('running') ||
                         productTitleLower.includes('training');
    
    const isDanceWear = productTitleLower.includes('dance') ||
                        productTitleLower.includes('ballet') ||
                        productTitleLower.includes('tutu') ||
                        productTitleLower.includes('leotard');
    
    if (!isSwimwear && catLower.includes('swimwear')) {
      scoreMap.set(categoryPath, score * 0.1); // Heavy penalty
    }
    
    if (!isActivewear && catLower.includes('activewear')) {
      scoreMap.set(categoryPath, score * 0.3); // Moderate penalty
    }
    
    if (!isDanceWear && (catLower.includes('dance') || catLower.includes('costume'))) {
      scoreMap.set(categoryPath, score * 0.2); // Heavy penalty
    }
    
    // UNIVERSAL PENALTY 10: Lingerie & Underwear
    // CRITICAL: Prevent non-underwear items from matching underwear categories
    // This is a VERY common false match (e.g., "Evening Gown" → "Period Underwear")
    const isUnderwear = productTitleLower.includes('underwear') ||
                        productTitleLower.includes('panties') ||
                        productTitleLower.includes('bra') ||
                        productTitleLower.includes('lingerie') ||
                        productTitleLower.includes('briefs') ||
                        productTitleLower.includes('boxers') ||
                        productTitleLower.includes('thong') ||
                        productTitleLower.includes('camisole');
    
    if (!isUnderwear) {
      if (catLower.includes('lingerie') || 
          catLower.includes('underwear') ||
          catLower.includes('underpants') ||
          catLower.includes('bras') ||
          catLower.includes('panties') ||
          catLower.includes('briefs')) {
        scoreMap.set(categoryPath, score * 0.001); // EXTREME penalty - almost eliminate
      }
    }
    
    // UNIVERSAL PENALTY 11: Indoor vs Outdoor Context
    // Penalize outdoor categories unless explicitly outdoor
    // This prevents indoor furniture from matching outdoor categories
    const isOutdoor = productTitleLower.includes('outdoor') ||
                      productTitleLower.includes('patio') ||
                      productTitleLower.includes('garden') ||
                      productTitleLower.includes('deck') ||
                      productTitleLower.includes('weatherproof') ||
                      productTitleLower.includes('weather-resistant') ||
                      productTitleLower.includes('all-weather');
    
    if (!isOutdoor && catLower.includes('outdoor')) {
      scoreMap.set(categoryPath, score * 0.3); // Heavy penalty - prefer indoor by default
    }
    
    // UNIVERSAL PENALTY 12: Therapeutic/Wellness Oils vs Food/Cosmetic Oils
    // CRITICAL: Prevent essential oils, massage oils, aromatherapy oils from matching food or cosmetics
    // Examples: "Lavender Essential Oil", "Massage Oil", "Aromatherapy Oil"
    const isTherapeuticOil = productTitleLower.includes('essential oil') ||
                             productTitleLower.includes('aromatherapy') ||
                             productTitleLower.includes('diffuser oil') ||
                             productTitleLower.includes('massage oil') ||
                             productTitleLower.includes('carrier oil') ||
                             productTitleLower.includes('therapeutic oil') ||
                             (productTitleLower.includes('oil') && 
                              (productTitleLower.includes('lavender') ||
                               productTitleLower.includes('eucalyptus') ||
                               productTitleLower.includes('peppermint') ||
                               productTitleLower.includes('tea tree') ||
                               productTitleLower.includes('rosemary') ||
                               productTitleLower.includes('chamomile')));
    
    const isCosmeticOil = productTitleLower.includes('lip oil') ||
                          productTitleLower.includes('face oil') ||
                          productTitleLower.includes('hair oil') ||
                          productTitleLower.includes('body oil') ||
                          productTitleLower.includes('skin oil');
    
    const isCookingOil = productTitleLower.includes('cooking oil') ||
                         productTitleLower.includes('olive oil') ||
                         productTitleLower.includes('vegetable oil') ||
                         productTitleLower.includes('canola oil');
    
    if (isTherapeuticOil && !isCosmeticOil && !isCookingOil) {
      // Extreme penalty for food categories
      if (catLower.includes('cooking oil') ||
          catLower.includes('food') ||
          catLower.includes('baking') ||
          catLower.includes('beverage') ||
          catLower.includes('edible')) {
        scoreMap.set(categoryPath, score * 0.001); // Extreme penalty
      }
      // Extreme penalty for cosmetic categories
      if (catLower.includes('lip oil') ||
          catLower.includes('face oil') ||
          catLower.includes('makeup') ||
          catLower.includes('cosmetic') ||
          catLower.includes('nail')) {
        scoreMap.set(categoryPath, score * 0.001); // Extreme penalty
      }
    }
    
    // UNIVERSAL PENALTY 13: Bicycles vs Exercise Bikes & Electronics
    // CRITICAL: Prevent road/mountain bikes from matching exercise bikes OR computer/tablet frames
    // Examples: "Road Bike Frame", "Mountain Bike", "Bicycle Parts"
    const isRealBike = productTitleLower.includes('road bike') ||
                       productTitleLower.includes('mountain bike') ||
                       productTitleLower.includes('bicycle') ||
                       productTitleLower.includes('bike frame') ||
                       productTitleLower.includes('cycling');
    
    const isExerciseBike = productTitleLower.includes('exercise bike') ||
                           productTitleLower.includes('stationary bike') ||
                           productTitleLower.includes('spin bike');
    
    if (isRealBike && !isExerciseBike) {
      // Prevent matching exercise equipment
      if (catLower.includes('exercise bike') ||
          catLower.includes('cardio machine') ||
          catLower.includes('cardio >') ||
          catLower.includes('fitness equipment')) {
        scoreMap.set(categoryPath, score * 0.001); // Extreme penalty
      }
      // CRITICAL: Prevent matching computer/tablet/electronics
      if (catLower.includes('computer') ||
          catLower.includes('tablet') ||
          catLower.includes('electronics') ||
          catLower.includes('phone') ||
          catLower.includes('laptop')) {
        scoreMap.set(categoryPath, score * 0.0001); // Ultra extreme penalty
      }
    }
    
    // UNIVERSAL PENALTY 14: Furniture Types
    // Prevent sideboards/cabinets from matching chairs/tables
    const isFurnitureStorage = productTitleLower.includes('sideboard') ||
                               productTitleLower.includes('cabinet') ||
                               productTitleLower.includes('dresser') ||
                               productTitleLower.includes('armoire') ||
                               productTitleLower.includes('buffet');
    
    if (isFurnitureStorage) {
      if (catLower.includes('chair') ||
          catLower.includes('table') ||
          catLower.includes('desk')) {
        scoreMap.set(categoryPath, score * 0.1); // Heavy penalty
      }
    }
    
    // UNIVERSAL PENALTY 15: Adult vs Children's Athletic Wear
    // Enhance age detection for athletic/performance wear
    const isAdultAthletic = (productTitleLower.includes('running') ||
                             productTitleLower.includes('athletic') ||
                             productTitleLower.includes('performance') ||
                             productTitleLower.includes('training')) &&
                            (productTitleLower.includes('men') ||
                             productTitleLower.includes('women') ||
                             productTitleLower.includes('adult') ||
                             productTitleLower.includes('high-waisted'));
    
    if (isAdultAthletic) {
      if (catLower.includes('boys') ||
          catLower.includes('girls') ||
          catLower.includes('kids') ||
          catLower.includes('children')) {
        scoreMap.set(categoryPath, score * 0.001); // Extreme penalty
      }
    }
    
    // UNIVERSAL PENALTY 15B: Adult Athletic Underwear
    // CRITICAL: Prevent adult performance underwear from matching children's underwear
    // Examples: "Waterproof Running Briefs", "High-Waisted Athletic Shorts"
    const isAdultUnderwear = (productTitleLower.includes('waterproof') || 
                              productTitleLower.includes('high-waisted') ||
                              productTitleLower.includes('performance') ||
                              productTitleLower.includes('athletic')) &&
                             (productTitleLower.includes('brief') || 
                              productTitleLower.includes('underwear') ||
                              productTitleLower.includes('boxer') ||
                              productTitleLower.includes('short')) &&
                             (productTitleLower.includes('running') || 
                              productTitleLower.includes('training') ||
                              productTitleLower.includes('sport'));
    
    if (isAdultUnderwear) {
      if (catLower.includes('boys') ||
          catLower.includes('girls') ||
          catLower.includes('kids') ||
          catLower.includes('children') ||
          catLower.includes('toddler') ||
          catLower.includes('infant')) {
        scoreMap.set(categoryPath, score * 0.00001); // Ultra extreme penalty
      }
    }
    
    // UNIVERSAL PENALTY 16: Entertainment Equipment
    // CRITICAL: Prevent karaoke/party equipment from matching professional audio
    // Examples: "Karaoke Microphone", "Party Speaker"
    const isEntertainment = productTitleLower.includes('karaoke') ||
                            productTitleLower.includes('party') ||
                            productTitleLower.includes('toy') ||
                            productTitleLower.includes('game');
    
    if (isEntertainment) {
      if (catLower.includes('professional audio') ||
          catLower.includes('studio equipment') ||
          catLower.includes('sampler') ||
          catLower.includes('synthesizer') ||
          catLower.includes('musical instrument') ||
          catLower.includes('electronic musical')) {
        scoreMap.set(categoryPath, score * 0.001); // Extreme penalty (was 0.01)
      }
    }
    
    // UNIVERSAL PENALTY 17: Bicycles vs Motorcycles
    // CRITICAL: Prevent bicycles from matching motorcycles
    const isBicycle = productTitleLower.includes('bicycle') ||
                      productTitleLower.includes('bike frame') ||
                      productTitleLower.includes('road bike') ||
                      productTitleLower.includes('mountain bike') ||
                      productTitleLower.includes('cycling');
    
    const isMotorcycle = productTitleLower.includes('motorcycle') ||
                         productTitleLower.includes('motorbike') ||
                         productTitleLower.includes('motor bike');
    
    if (isBicycle && !isMotorcycle) {
      if (catLower.includes('motorcycle') ||
          catLower.includes('motor vehicle') ||
          catLower.includes('motorbike')) {
        scoreMap.set(categoryPath, score * 0.001); // Extreme penalty
      }
    }
    
    // UNIVERSAL PENALTY 18: Plumbing Fixtures vs Appliances
    // Prevent sinks from matching appliances
    const isPlumbingFixture = productTitleLower.includes('sink') ||
                              productTitleLower.includes('faucet') ||
                              productTitleLower.includes('toilet') ||
                              productTitleLower.includes('bathtub');
    
    if (isPlumbingFixture) {
      if (catLower.includes('appliance') && !catLower.includes('plumbing')) {
        scoreMap.set(categoryPath, score * 0.2); // Heavy penalty
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL STRICT RULES - Ultra-Extreme Penalties for Specific Edge Cases
    // ═══════════════════════════════════════════════════════════════════════════
    
    // CRITICAL: Bike frames must ONLY match cycling/bicycle categories
    // Enhanced detection to catch various title formats
    const isRoadBikeFrame = ((productTitleLower.includes('bike frame') ||
                              productTitleLower.includes('bicycle frame') ||
                              productTitleLower.includes('road bike') ||
                              productTitleLower.includes('mountain bike') ||
                              (productTitleLower.includes('carbon fiber') && productTitleLower.includes('bike')) ||
                              (productTitleLower.includes('bike') && productTitleLower.includes('frame'))) &&
                             !productTitleLower.includes('exercise') &&
                             !productTitleLower.includes('stationary') &&
                             !productTitleLower.includes('phone case'));
    
    if (isRoadBikeFrame) {
      // NUCLEAR penalty for ANY non-cycling category
      if (!catLower.includes('cycling') &&
          !catLower.includes('bicycle') &&
          !catLower.includes('bike parts') &&
          !catLower.includes('bikes') &&
          !catLower.includes('road bike')) {
        scoreMap.set(categoryPath, score * 0.000001); // Nuclear penalty
      }
      
      // MASSIVE BOOST for cycling categories
      if (catLower.includes('cycling') || 
          catLower.includes('bicycle') ||
          catLower.includes('bike parts') ||
          catLower.includes('bikes') ||
          catLower.includes('road bike')) {
        scoreMap.set(categoryPath, score * 100); // 100x boost (was 10x)
      }
    }
    
    // STRICT RULE #2: Essential Oils - NUCLEAR PENALTY for food/cosmetics + BOOST health
    // CRITICAL: Essential oils must avoid food and cosmetics, prefer health & beauty
    const isEssentialOilProduct = (productTitleLower.includes('essential oil') ||
                                   (productTitleLower.includes('oil') && 
                                    productTitleLower.includes('aromatherapy'))) &&
                                  !productTitleLower.includes('cooking') &&
                                  !productTitleLower.includes('olive') &&
                                  !productTitleLower.includes('lip') &&
                                  !productTitleLower.includes('face');
    
    if (isEssentialOilProduct) {
      // NUCLEAR penalty for food categories
      if (catLower.includes('food') ||
          catLower.includes('cooking') ||
          catLower.includes('baking') ||
          catLower.includes('beverage') ||
          catLower.includes('edible') ||
          catLower.includes('tobacco')) {
        scoreMap.set(categoryPath, score * 0.000001); // Nuclear penalty
      }
      
      // NUCLEAR penalty for ALL cosmetic categories (including lip oils!)
      if (catLower.includes('makeup') ||
          catLower.includes('cosmetic') ||
          catLower.includes('lip') ||
          catLower.includes('nail') ||
          catLower.includes('face oil') ||
          catLower.includes('hair oil') ||
          catLower.includes('skin care')) {
        scoreMap.set(categoryPath, score * 0.000001); // Nuclear penalty
      }
      
      // NO BOOST - let natural scoring work
      // (Boost was causing lip oils to win because they're in "Health & Beauty")
    }
    
    // STRICT RULE #3: Adult Athletic Underwear - NUCLEAR PENALTY for children's
    // CRITICAL: Waterproof/performance underwear is NEVER for children
    const isAdultPerformanceUnderwear = (productTitleLower.includes('waterproof') ||
                                         productTitleLower.includes('performance') ||
                                         productTitleLower.includes('high-waisted')) &&
                                        (productTitleLower.includes('brief') ||
                                         productTitleLower.includes('underwear') ||
                                         productTitleLower.includes('boxer')) &&
                                        (productTitleLower.includes('running') ||
                                         productTitleLower.includes('athletic') ||
                                         productTitleLower.includes('sport') ||
                                         productTitleLower.includes('training'));
    
    if (isAdultPerformanceUnderwear) {
      // NUCLEAR penalty for ANY children's category
      if (catLower.includes('boys') ||
          catLower.includes('girls') ||
          catLower.includes('kids') ||
          catLower.includes('children') ||
          catLower.includes('toddler') ||
          catLower.includes('infant') ||
          catLower.includes('baby')) {
        scoreMap.set(categoryPath, score * 0.000001); // Nuclear penalty
      }
      
      // BOOST adult underwear categories
      if ((catLower.includes('men') || catLower.includes('women')) &&
          (catLower.includes('underwear') || catLower.includes('undergarment'))) {
        scoreMap.set(categoryPath, score * 10); // 10x boost
      }
    }
    
    // STRICT RULE #4: Microphone Accessories - NUCLEAR PENALTY for exercise equipment
    // CRITICAL: Microphone foam covers are AUDIO accessories, not fitness equipment
    const isMicrophoneAccessory = productTitleLower.includes('microphone') &&
                                   (productTitleLower.includes('foam') ||
                                    productTitleLower.includes('cover') ||
                                    productTitleLower.includes('windscreen'));
    
    if (isMicrophoneAccessory) {
      // NUCLEAR penalty for sporting goods/fitness categories
      if (catLower.includes('sporting') ||
          catLower.includes('fitness') ||
          catLower.includes('exercise') ||
          catLower.includes('foam roller') ||
          catLower.includes('yoga') ||
          catLower.includes('gym')) {
        scoreMap.set(categoryPath, score * 0.000001); // Nuclear penalty
      }
      
      // BOOST audio/microphone categories
      if (catLower.includes('audio') ||
          catLower.includes('microphone') ||
          catLower.includes('electronics')) {
        scoreMap.set(categoryPath, score * 10); // 10x boost
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // END CRITICAL STRICT RULES
    // ═══════════════════════════════════════════════════════════════════════════
    
    // UNIVERSAL PENALTY 19: Essential Oils vs Cooking Oils (DEPRECATED - merged into #12)
    // This penalty is now handled by UNIVERSAL PENALTY 12 and STRICT RULE #2
    // Keeping this comment for reference
  });

  // Convert to array and sort by score
  const scoredCandidates = Array.from(scoreMap.entries())
    .map(([categoryPath, score]) => {
      const data = officialTaxonomyMap.get(categoryPath.toLowerCase());
      return {
        path: categoryPath,
        id: data?.id,
        score: Math.round(score * 10) / 10 // Round to 1 decimal
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.MAX_CANDIDATES);

  if (scoredCandidates.length > 0) {
    console.log(`  📊 Top candidate: ${scoredCandidates[0].path} (score: ${scoredCandidates[0].score})`);
  }

  return scoredCandidates;
};

// ============================================================================
// STAGE 3: THE AI TRANSLATION & SUGGESTION LAYER (Hybrid Approach)
// ============================================================================
/**
 * AI translates product titles into taxonomy terms AND suggests categories
 * This prevents false matches on adjectives (e.g., "organic" matching "Volatile Organic Compounds")
 * @param {Array} products - Array of { title, description }
 * @returns {Object} Map of PROD_X to AI translations and suggestions
 */
const translateAndSuggest = async (products) => {
  if (!products || products.length === 0) {
    return {};
  }

  // Prepare payload for AI
  const payload = products.map((product, index) => ({
    uid: `PROD_${index}`,
    title: product.title,
    description: product.description || ''
  }));

  const systemPrompt = `You are a Lead Taxonomy Architect for ShopsReady, an e-commerce categorization platform.

MISSION: Translate product titles into standard taxonomy terms and suggest the best category.

WHY THIS MATTERS:
- Product titles use colloquial terms (e.g., "onesie", "sneakers", "tee")
- Taxonomies use formal terms (e.g., "baby one-pieces", "athletic shoes", "t-shirts")
- We must translate colloquial → formal to find the right category
- We must ignore irrelevant adjectives (e.g., "organic", "premium", "luxury")

CRITICAL RULES:
1. OUTPUT FORMAT: JSON object with keys "PROD_0", "PROD_1", etc.

2. For each product, return:
   - "product_type": The CORE product type (ignore adjectives like "organic", "cotton", "premium")
   - "taxonomy_keywords": Array of 3-5 formal taxonomy terms that describe this product
   - "suggested_category": Your best guess at the full category path
   - "refined_title": Clean, professional product title
   - "description": Compelling product description (minimum 15 words)

3. TRANSLATION EXAMPLES:
   - "Organic Cotton Baby Onesie" → product_type: "Baby One-Pieces", keywords: ["baby", "clothing", "bodysuit", "infant", "one-piece"]
   - "Men's Running Sneakers" → product_type: "Athletic Shoes", keywords: ["shoes", "athletic", "footwear", "running", "sneakers"]
   - "Stainless Steel Dog Bowl" → product_type: "Pet Bowls", keywords: ["pet", "bowls", "feeders", "dog", "dishes"]
   - "Organic Green Tea Bags" → product_type: "Tea", keywords: ["tea", "beverages", "infusions", "drinks"]

4. FOCUS ON NOUNS, NOT ADJECTIVES:
   - ✓ GOOD: "onesie" → "baby one-pieces"
   - ✗ BAD: "organic" → "organic compounds" (irrelevant!)
   - ✓ GOOD: "bowl" + "dog" → "pet bowls"
   - ✗ BAD: "stainless steel" → "stainless steel cleaners" (irrelevant!)

5. USE PLURAL FORMS:
   - Taxonomies typically use PLURAL forms ("dresses", "shoes", "knives")
   - ✓ GOOD: "evening gown" → ["dresses", "gowns", "formal wear", "women's clothing"]
   - ✗ BAD: "evening gown" → ["dress", "gown"] (singular won't match!)
   - ✓ GOOD: "chef knife" → ["knives", "cutlery", "kitchen tools", "chef knives"]
   - ✗ BAD: "chef knife" → ["knife", "blade"] (singular won't match!)

6. QUALITY STANDARDS:
   - product_type: The main product category (1-3 words)
   - taxonomy_keywords: Formal PLURAL terms that would appear in a product taxonomy
   - suggested_category: Full path like "Apparel & Accessories > Baby Clothing > Baby One-Pieces"
   - refined_title: Clean, professional, proper capitalization
   - description: Engaging, informative, highlights features and benefits

EXAMPLE OUTPUT:
{
  "PROD_0": {
    "product_type": "Baby One-Pieces",
    "taxonomy_keywords": ["baby", "clothing", "bodysuits", "infants", "one-pieces", "apparel"],
    "suggested_category": "Apparel & Accessories > Baby & Toddler Clothing > Baby One-Pieces",
    "refined_title": "Organic Cotton Baby Onesie",
    "description": "Soft and comfortable organic cotton onesie perfect for newborns and infants, featuring snap closures for easy diaper changes and gentle fabric that's kind to delicate skin."
  },
  "PROD_1": {
    "product_type": "Athletic Shoes",
    "taxonomy_keywords": ["shoes", "athletic", "footwear", "running", "sneakers", "sports"],
    "suggested_category": "Apparel & Accessories > Shoes > Athletic Shoes",
    "refined_title": "Men's Running Sneakers",
    "description": "High-performance running sneakers designed for serious athletes, featuring advanced cushioning technology, breathable mesh upper, and durable rubber outsole for maximum comfort and support during intense training sessions."
  },
  "PROD_2": {
    "product_type": "Evening Dresses",
    "taxonomy_keywords": ["dresses", "gowns", "formal wear", "evening wear", "women's clothing"],
    "suggested_category": "Apparel & Accessories > Clothing > Dresses",
    "refined_title": "Silk Evening Gown",
    "description": "Elegant silk evening gown perfect for formal events and special occasions, featuring a flattering silhouette and luxurious fabric that drapes beautifully."
  },
  "PROD_3": {
    "product_type": "Chef Knives",
    "taxonomy_keywords": ["knives", "chef knives", "cutlery", "kitchen tools", "cooking utensils"],
    "suggested_category": "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Kitchen Knives > Chef's Knives",
    "refined_title": "Professional Chef Knife",
    "description": "Professional-grade chef knife crafted from high-quality stainless steel, designed for precision cutting, slicing, and dicing with superior balance and edge retention."
  }
}

CRITICAL: The suggested_category MUST be a category that exists in the Google Product Taxonomy.
- ✓ GOOD: "Apparel & Accessories > Clothing > Dresses" (exists!)
- ✗ BAD: "Apparel & Accessories > Clothing > Dresses > Evening Dresses" (doesn't exist!)
- ✓ GOOD: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets" (exists!)
- ✗ BAD: "Apparel & Accessories > Clothing > Outerwear > Jackets > Bomber Jackets" (doesn't exist!)

When in doubt, suggest a BROADER category rather than inventing specific subcategories.

Now translate and suggest categories for these products:`;

  try {
    const model = genAI.getGenerativeModel({
      model: CONFIG.AI_MODEL,
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const result = await model.generateContent([
      systemPrompt,
      JSON.stringify(payload, null, 2)
    ]);

    const responseText = result.response.text();
    const parsed = cleanAndParseJSON(responseText);

    if (!parsed) {
      console.error('❌ AI returned invalid JSON');
      return {};
    }

    return parsed;
  } catch (error) {
    console.error('❌ AI API Error:', error.message);
    return {};
  }
};

// ============================================================================
// MAIN EXPORT: GROUP PRODUCTS (Translate-Then-Search Hybrid)
// ============================================================================
/**
 * Main function: Translates product titles with AI, then validates with keyword search
 * @param {Array} products - Array of product objects with title, sku, price, etc.
 * @param {string} shopId - Shop identifier for handle generation
 * @returns {Array} Array of grouped products with categories
 */
const groupProducts = async (products, shopId = 'default') => {
  if (!Array.isArray(products) || products.length === 0) {
    console.warn('⚠️  No products to process');
    return [];
  }

  console.log(`\n🚀 Starting Translate-Then-Search categorization for ${products.length} products...`);
  const startTime = Date.now();

  const results = [];

  // Process in batches
  for (let i = 0; i < products.length; i += CONFIG.BATCH_SIZE) {
    const batch = products.slice(i, i + CONFIG.BATCH_SIZE);
    console.log(`\n📦 Processing batch ${Math.floor(i / CONFIG.BATCH_SIZE) + 1} (${batch.length} products)...`);

    // STEP 1: AI Translation & Suggestion (1 call for entire batch)
    const aiTranslations = await translateAndSuggest(batch);

    // STEP 2: Process each product in the batch
    batch.forEach((product, batchIndex) => {
      const uid = `PROD_${batchIndex}`;
      const aiData = aiTranslations[uid];

      const result = {
        title: product.title || 'Untitled Product',
        refined_title: product.title || 'Untitled Product',
        category: 'General Marketplace',
        google_product_category: null,
        description: product.description || '',
        method: 'UNKNOWN',
        variants: product.variants || [],
        sku: product.sku,
        price: product.price
      };

      // Apply AI enrichment if available
      if (aiData) {
        result.refined_title = aiData.refined_title || result.title;
        result.description = aiData.description || result.description;

        // STEP 3: Validate AI suggestion with keyword search
        // Search using AI's translated taxonomy keywords
        const translatedKeywords = aiData.taxonomy_keywords || [];
        const searchQuery = translatedKeywords.join(' ');
        
        console.log(`  🔍 AI Translation: "${aiData.product_type}" → [${translatedKeywords.join(', ')}]`);
        if (aiData.suggested_category) {
          console.log(`  🎯 AI Suggested Category: "${aiData.suggested_category}"`);
        }
        
        // Get keyword candidates using AI's translated terms
        const keywordCandidates = getSmartCandidates(searchQuery);
        
        // Also get candidates from original title for fallback
        const originalCandidates = getSmartCandidates(product.title);

        // STEP 4: 100% AI-First Decision Logic
        // Trust the AI's suggestion completely if it exists in taxonomy
        const aiSuggestion = aiData.suggested_category;
        
        // Try matching strategies for AI's suggestion
        let aiSuggestionMatch = null;
        
        if (aiSuggestion) {
          const suggestionLower = aiSuggestion.toLowerCase().trim();
          
          // Strategy 1: Exact match
          aiSuggestionMatch = officialTaxonomyMap.get(suggestionLower);
          
          // Strategy 2: Normalize & to "and" (common variation)
          if (!aiSuggestionMatch) {
            const normalized = suggestionLower.replace(/\s*&\s*/g, ' & ');
            aiSuggestionMatch = officialTaxonomyMap.get(normalized);
          }
        }
        
        if (aiSuggestionMatch) {
          // ✅ AI suggested a valid category - TRUST IT COMPLETELY!
          result.category = aiSuggestionMatch.path;
          result.google_product_category = aiSuggestionMatch.id;
          result.method = 'AI_TRANSLATION_VERIFIED';
          console.log(`  ✓ ${result.title.substring(0, 40)} → ${aiSuggestionMatch.path} (AI verified)`);
          
        } else if (keywordCandidates.length > 0) {
          // AI suggestion not found or invalid, use keyword search with translated terms
          const topCandidate = keywordCandidates[0];
          
          if (topCandidate.score >= CONFIG.AUTO_ACCEPT_SCORE) {
            result.category = topCandidate.path;
            result.google_product_category = topCandidate.id;
            result.method = `TRANSLATED_KEYWORD_MATCH (score: ${topCandidate.score})`;
            console.log(`  ✓ ${result.title.substring(0, 40)} → ${topCandidate.path} (translated keywords)`);
          } else {
            result.category = topCandidate.path;
            result.google_product_category = topCandidate.id;
            result.method = `TRANSLATED_KEYWORD_FALLBACK (score: ${topCandidate.score})`;
            console.log(`  ⚠ ${result.title.substring(0, 40)} → ${topCandidate.path} (low confidence)`);
          }
          
        } else if (originalCandidates.length > 0) {
          // Fallback to original title search
          const topCandidate = originalCandidates[0];
          
          if (topCandidate.score >= CONFIG.AUTO_ACCEPT_SCORE) {
            result.category = topCandidate.path;
            result.google_product_category = topCandidate.id;
            result.method = `ORIGINAL_KEYWORD_MATCH (score: ${topCandidate.score})`;
            console.log(`  ✓ ${result.title.substring(0, 40)} → ${topCandidate.path} (original keywords)`);
          } else {
            result.category = topCandidate.path;
            result.google_product_category = topCandidate.id;
            result.method = `ORIGINAL_KEYWORD_FALLBACK (score: ${topCandidate.score})`;
            console.log(`  ⚠ ${result.title.substring(0, 40)} → ${topCandidate.path} (original fallback)`);
          }
          
        } else {
          // Complete failure - no candidates found
          result.method = 'NO_CANDIDATES_FOUND';
          console.log(`  ✗ ${result.title.substring(0, 40)} → No candidates`);
        }
        
      } else {
        // AI failed completely - fallback to original keyword search
        const originalCandidates = getSmartCandidates(product.title);
        
        if (originalCandidates.length > 0) {
          const topCandidate = originalCandidates[0];
          result.category = topCandidate.path;
          result.google_product_category = topCandidate.id;
          result.method = `AI_FAILED_KEYWORD_FALLBACK (score: ${topCandidate.score})`;
          console.log(`  ⚠ ${result.title.substring(0, 40)} → ${topCandidate.path} (AI failed)`);
        } else {
          result.method = 'COMPLETE_FAILURE';
          console.log(`  ✗ ${result.title.substring(0, 40)} → Complete failure`);
        }
      }

      results.push(result);
    });
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Summary statistics
  const stats = {
    total: results.length,
    aiTranslated: results.filter(r => r.method.startsWith('AI_TRANSLATION')).length,
    translatedKeyword: results.filter(r => r.method.startsWith('TRANSLATED_KEYWORD')).length,
    originalKeyword: results.filter(r => r.method.startsWith('ORIGINAL_KEYWORD')).length,
    failed: results.filter(r => r.method.includes('FAILURE') || r.method.includes('NO_CANDIDATES')).length
  };

  console.log(`\n✅ CATEGORIZATION COMPLETE`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log(`📊 Results:`);
  console.log(`   - AI Translation Verified: ${stats.aiTranslated} (${((stats.aiTranslated / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   - Translated Keyword Match: ${stats.translatedKeyword} (${((stats.translatedKeyword / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   - Original Keyword Match: ${stats.originalKeyword} (${((stats.originalKeyword / stats.total) * 100).toFixed(1)}%)`);
  console.log(`   - Failed: ${stats.failed} (${((stats.failed / stats.total) * 100).toFixed(1)}%)`);

  return results;
};

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  groupProducts,
  cleanAndParseJSON,
  // Export for testing
  _internal: {
    loadTaxonomy,
    getSmartCandidates,
    translateAndSuggest,
    tokenize,
    keywordIndex,
    officialTaxonomyMap,
    allCategories
  }
};