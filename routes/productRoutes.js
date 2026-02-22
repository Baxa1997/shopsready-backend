const express = require('express');
const router = express.Router();
const { groupProducts } = require('../services/taxonomyService');

// Belt-and-suspenders: set CORS headers on every response from this router.
// This covers cases where cPanel's Apache proxy drops the global middleware headers.
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-shop-id');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);   // respond to preflight immediately
  }
  next();
});

router.post('/identify', async (req, res) => {
  const { title, shopId } = req.body;
  const targetShop = shopId || req.headers['x-shop-id'] || 'default';

  if (!title) {
    return res.status(400).json({ success: false, message: "Product title is required" });
  }

  try {
    const result = await groupProducts([{ title }], targetShop);
    res.json({
      success: true,
      data: result[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * ROUTE: Bulk Process & Harmonize
 * POST /api/v1/categories/group-bulk
 */
router.post('/group-bulk', async (req, res) => {
  const { products, shopId } = req.body;
  const targetShop = shopId || req.headers['x-shop-id'] || 'default';

  if (!products || !Array.isArray(products)) {
    return res.status(400).json({ success: false, message: "An array of products is required" });
  }

  try {
    const finalArray = await groupProducts(products, targetShop);

    res.json({
      success: true,
      count: finalArray.length,
      shopId: targetShop,
      data: finalArray
    });
  } catch (error) {
    console.error("Route Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});
module.exports = router;