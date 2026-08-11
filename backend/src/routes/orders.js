const express = require('express');
const Stripe = require('stripe');
const { run, get } = require('../db');
const { newId, nowIso } = require('../util');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function ownerProfileId(req) {
  const table = req.user.role === 'producer' ? 'producers' : 'shops';
  const row = get(`SELECT id FROM ${table} WHERE user_id = ?`, [req.user.sub]);
  return row ? row.id : null;
}

function serializeOrder(row) {
  if (!row) return null;
  return {
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at
  };
}

// POST /api/conversations/:id/order { amountCents }
// Only the producer/shop being contacted in this conversation can propose an order amount.
router.post('/:id/order', requireAuth('producer', 'shop'), (req, res) => {
  const conv = get('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });

  const profileId = ownerProfileId(req);
  if (!profileId || conv.contact_id !== profileId) {
    return res.status(403).json({ error: "Tu ne peux pas proposer une commande sur cette conversation." });
  }

  const amountCents = Math.round(Number((req.body || {}).amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return res.status(400).json({ error: 'Montant invalide.' });
  }

  const existing = get('SELECT id FROM orders WHERE conversation_id = ?', [conv.id]);
  const ts = nowIso();
  if (existing) {
    run('UPDATE orders SET amount_cents = ?, status = ?, stripe_session_id = NULL, created_at = ?, paid_at = NULL WHERE id = ?',
      [amountCents, 'pending', ts, existing.id]);
  } else {
    run('INSERT INTO orders (id, conversation_id, amount_cents, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [newId('order'), conv.id, amountCents, 'eur', 'pending', ts]);
  }

  res.status(201).json(serializeOrder(get('SELECT * FROM orders WHERE conversation_id = ?', [conv.id])));
});

// POST /api/conversations/:id/order/cancel — owner cancels/resets the order
router.post('/:id/order/cancel', requireAuth('producer', 'shop'), (req, res) => {
  const conv = get('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });

  const profileId = ownerProfileId(req);
  if (!profileId || conv.contact_id !== profileId) {
    return res.status(403).json({ error: 'Non autorise.' });
  }

  run('DELETE FROM orders WHERE conversation_id = ?', [conv.id]);
  res.json({ ok: true });
});

// POST /api/conversations/:id/order/checkout — the buyer (guest) starts a real Stripe payment.
// No auth required: this is the visitor paying, not the profile owner.
router.post('/:id/order/checkout', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe n\'est pas configure sur ce serveur (STRIPE_SECRET_KEY manquant).' });
  }

  const conv = get('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });

  const order = get('SELECT * FROM orders WHERE conversation_id = ?', [conv.id]);
  if (!order || order.status !== 'pending') {
    return res.status(400).json({ error: 'Aucune commande en attente pour cette conversation.' });
  }

  const successUrl = process.env.STRIPE_SUCCESS_URL || 'http://localhost:5500/messagerie.html?paid=1';
  const cancelUrl = process.env.STRIPE_CANCEL_URL || 'http://localhost:5500/messagerie.html?canceled=1';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: order.currency,
        unit_amount: order.amount_cents,
        product_data: { name: `Commande AfroLink — ${conv.contact_name || 'producteur/boutique'}` }
      },
      quantity: 1
    }],
    metadata: { conversationId: conv.id, orderId: order.id },
    success_url: successUrl,
    cancel_url: cancelUrl
  });

  run('UPDATE orders SET stripe_session_id = ? WHERE id = ?', [session.id, order.id]);
  res.json({ url: session.url });
});

module.exports = router;
