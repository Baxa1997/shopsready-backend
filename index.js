require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const productRoutes = require('./routes/productRoutes');
const stripeRoutes  = require('./routes/stripeRoutes');

const app  = express();
const PORT = process.env.PORT || 5001;

// ── CORS ─────────────────────────────────────────────────────────────────────
// Explicit config so browsers receive correct headers on both the OPTIONS
// preflight and the actual POST/GET requests.
const corsOptions = {
  origin: '*',                                          // allow any origin
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-shop-id'],
  credentials: false,                                   // must be false when origin: '*'
  preflightContinue: false,
};

app.use(cors(corsOptions));

// ⚠️  Stripe webhook route MUST be registered BEFORE express.json().
//     The webhook handler uses express.raw() internally to read the raw body,
//     which is required for Stripe signature verification.
app.use('/api/v1/stripe', stripeRoutes);

// All other routes use JSON body parsing.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/categories', productRoutes);

app.get('/', (req, res) => {
  res.send('🚀 ShopsReady API is RUNNING! (Routes loaded)');
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Increase keep-alive and headers timeout to 10 min so bulk requests
// (200+ products) don't get killed by Node.js before they finish.
server.keepAliveTimeout = 600_000;    // 10 min
server.headersTimeout = 610_000;      // slightly more than keepAliveTimeout