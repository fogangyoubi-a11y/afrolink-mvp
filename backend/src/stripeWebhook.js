const Stripe = require('stripe');
const { run, get } = require('./db');
const { nowIso } = require('./util');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Mounted with express.raw({type: 'application/json'}) in server.js — Stripe's
// signature check needs the exact raw request body, not the JSON-parsed version.
function stripeWebhookHandler(req, res) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send('Stripe webhook not configured.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata && session.metadata.orderId;
    if (orderId) {
      const order = get('SELECT * FROM orders WHERE id = ?', [orderId]);
      if (order && order.status !== 'paid') {
        run('UPDATE orders SET status = ?, paid_at = ? WHERE id = ?', ['paid', nowIso(), orderId]);
      }
    }
  }

  res.json({ received: true });
}

module.exports = { stripeWebhookHandler };
