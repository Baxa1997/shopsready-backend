const express = require('express');
const router = express.Router();
const { groupProducts, groupProductsStream } = require('../services/taxonomyService');

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /identify — single product
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /group-bulk — classic JSON endpoint (with extended timeout)
// For ≤50 products this works fine.  For 50-200+ use /group-bulk-stream instead.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/group-bulk', async (req, res) => {
  // Extend timeout to 5 minutes for large batches (prevents the "CORS error"
  // that is actually a proxy / socket timeout).
  req.setTimeout(300_000);   // 5 min
  res.setTimeout(300_000);

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /group-bulk-stream — Server-Sent Events (SSE) endpoint
//
// Designed for large product lists (50‑500+).  Streams progress updates
// as SSE `data:` lines so the browser never hits a timeout.
//
// Response format (SSE text/event-stream):
//   data: {"event":"progress","batchNumber":1,"totalBatches":5,"percent":20,
//          "processedProducts":40,"totalProducts":200,"batchData":[...]}
//   data: {"event":"progress", ...}
//   data: {"event":"done","count":200,"shopId":"default","data":[...]}
//
// Frontend usage:
//   fetch('/api/v1/categories/group-bulk-stream', { method:'POST', body, headers })
//     .then(res => {
//       const reader = res.body.getReader();
//       // read chunks → split on "\n\n" → JSON.parse each `data:` line
//     });
// ─────────────────────────────────────────────────────────────────────────────
router.post('/group-bulk-stream', async (req, res) => {
  req.setTimeout(600_000);   // 10 min
  res.setTimeout(600_000);

  const { products, shopId } = req.body;
  const targetShop = shopId || req.headers['x-shop-id'] || 'default';

  if (!products || !Array.isArray(products)) {
    return res.status(400).json({ success: false, message: "An array of products is required" });
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',        // disable Nginx buffering
  });

  // Send an initial "connected" event so the client knows it's wired up
  res.write(`data: ${JSON.stringify({ event: 'connected', totalProducts: products.length })}\n\n`);

  // Keep-alive heartbeat every 15s so proxies don't kill the connection
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15_000);

  try {
    const allResults = await groupProductsStream(products, targetShop, (batchResults, progress) => {
      // Stream each batch's results as progress
      res.write(`data: ${JSON.stringify({
        event: 'progress',
        ...progress,
        batchData: batchResults
      })}\n\n`);
    });

    // Final "done" event with the complete result set
    res.write(`data: ${JSON.stringify({
      event: 'done',
      success: true,
      count: allResults.length,
      shopId: targetShop,
      data: allResults
    })}\n\n`);

  } catch (error) {
    console.error("Stream Error:", error);
    res.write(`data: ${JSON.stringify({
      event: 'error',
      success: false,
      message: error.message
    })}\n\n`);
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

module.exports = router;