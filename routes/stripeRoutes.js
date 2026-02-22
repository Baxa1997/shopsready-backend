const express = require('express');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// ── Lazy singletons — clients are created on first use, not at module load.
//    This prevents a startup crash when env vars aren't yet set in cPanel.
let _stripe = null;
let _supabase = null;

function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

function getSupabase() {
  if (!_supabase) {
    if (!process.env.SUPABASE_URL)              throw new Error('SUPABASE_URL is not set');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

// ── Map frontend plan names → Stripe Price IDs ──────────────────────────────
function getPriceMap() {
  return {
    pay_per_use: process.env.STRIPE_PRICE_PAY_PER_USE,
    pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  };
}

// ============================================================================
// POST /api/v1/stripe/checkout
// Creates a Stripe Checkout Session and returns the redirect URL.
// Called by the frontend when the user clicks a plan button.
// ============================================================================
router.post('/checkout', express.json(), async (req, res) => {
  try {
    // ── STEP 1: Log what the server received ───────────────────────────────
    console.log('[Stripe /checkout] body received:', JSON.stringify(req.body));

    const { plan, email } = req.body || {};
    console.log('[Stripe /checkout] plan:', plan, '| email:', email);

    // ── STEP 2: Check env vars are set ────────────────────────────────────
    console.log('[Stripe /checkout] STRIPE_SECRET_KEY set?', !!process.env.STRIPE_SECRET_KEY);
    console.log('[Stripe /checkout] STRIPE_PRICE_PAY_PER_USE:', process.env.STRIPE_PRICE_PAY_PER_USE);
    console.log('[Stripe /checkout] STRIPE_PRICE_PRO_MONTHLY:', process.env.STRIPE_PRICE_PRO_MONTHLY);
    console.log('[Stripe /checkout] FRONTEND_URL:', process.env.FRONTEND_URL);

    // ── STEP 3: Resolve price ID ──────────────────────────────────────────
    const priceId = getPriceMap()[plan];
    console.log('[Stripe /checkout] resolved priceId:', priceId);

    if (!plan) {
      return res.status(400).json({ error: 'Missing required field: plan' });
    }
    if (!priceId) {
      return res.status(400).json({ error: `Unknown plan "${plan}". Valid values: "pro_monthly", "pay_per_use"` });
    }

    // ── STEP 4: Call Stripe ───────────────────────────────────────────────
    const stripe = getStripe();
    const isRecurring = plan === 'pro_monthly';

    // Validate FRONTEND_URL
    let frontendUrl = (process.env.FRONTEND_URL || '').trim();
    if (!frontendUrl) {
      throw new Error('FRONTEND_URL is not set in environment variables.');
    }
    if (!frontendUrl.startsWith('http://') && !frontendUrl.startsWith('https://')) {
      throw new Error(`FRONTEND_URL "${frontendUrl}" is missing a protocol (http:// or https://).`);
    }

    const session = await stripe.checkout.sessions.create({
      mode: isRecurring ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/success`,
      cancel_url:  `${frontendUrl}/cancel`,
      metadata: { plan, email: email || '' },
    });

    console.log('[Stripe /checkout] session created:', session.id);
    return res.json({ url: session.url });

  } catch (err) {
    console.error('[Stripe /checkout] ERROR:', err.message);
    
    // Provide diagnostic info in the error response for debugging production
    return res.status(500).json({ 
      error: err.message,
      diagnostics: {
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
        frontendUrl: process.env.FRONTEND_URL || 'MISSING',
        payPerUsePrice: process.env.STRIPE_PRICE_PAY_PER_USE ? 'SET' : 'MISSING',
        proMonthlyPrice: process.env.STRIPE_PRICE_PRO_MONTHLY ? 'SET' : 'MISSING'
      }
    });
  }
});

// ============================================================================
// POST /api/v1/stripe/webhook
// ⚠️  Uses express.raw() — MUST be mounted before express.json() in index.js.
// ============================================================================
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const stripe = getStripe();
    const supabaseAdmin = getSupabase();
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.customer_email || session.metadata?.email;
        const plan  = session.metadata?.plan;

        if (email && plan === 'pay_per_use') {
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
          const user = users.find(u => u.email === email);
          if (user) {
            const { error } = await supabaseAdmin
              .from('profiles')
              .update({ daily_generation_count: 0 })
              .eq('id', user.id);
            if (error) console.error('Supabase update error (pay_per_use):', error.message);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId   = subscription.customer;
        const status       = subscription.status;
        const customer     = await stripe.customers.retrieve(customerId);
        const email        = customer.email;

        if (email) {
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
          const user = users.find(u => u.email === email);
          if (user) {
            const { error } = await supabaseAdmin
              .from('profiles')
              .update({
                plan:                   status === 'active' ? 'pro' : 'free',
                subscription_status:    status,
                stripe_customer_id:     customerId,
                stripe_subscription_id: subscription.id,
              })
              .eq('id', user.id);
            if (error) console.error('Supabase update error (subscription):', error.message);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customer     = await stripe.customers.retrieve(subscription.customer);
        if (customer.email) {
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
          const user = users.find(u => u.email === customer.email);
          if (user) {
            const { error } = await supabaseAdmin
              .from('profiles')
              .update({ plan: 'free', subscription_status: 'canceled' })
              .eq('id', user.id);
            if (error) console.error('Supabase update error (subscription.deleted):', error.message);
          }
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    res.json({ received: true });
  }
);

module.exports = router;
