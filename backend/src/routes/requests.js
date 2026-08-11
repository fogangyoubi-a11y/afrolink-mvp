const express = require('express');
const { run, get, all } = require('../db');
const { newId, nowIso } = require('../util');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serialize(row) {
  return {
    id: row.id,
    shopId: row.shop_id,
    title: row.title,
    category: row.category,
    quantity: row.quantity,
    desc: row.description,
    status: row.status,
    createdAt: row.created_at
  };
}

// GET /api/requests — public list of purchase requests (demandes d'achat)
router.get('/', (req, res) => {
  const rows = all(`
    SELECT purchase_requests.*, shops.name AS shop_name, shops.email AS shop_email
    FROM purchase_requests JOIN shops ON shops.id = purchase_requests.shop_id
    ORDER BY purchase_requests.created_at DESC
  `);
  res.json(rows.map(r => ({ ...serialize(r), shop: { name: r.shop_name, email: r.shop_email } })));
});

// POST /api/requests — publish a purchase request as the logged-in shop
router.post('/', requireAuth('shop'), (req, res) => {
  const shop = get('SELECT id FROM shops WHERE user_id = ?', [req.user.sub]);
  if (!shop) return res.status(404).json({ error: 'Profil boutique introuvable.' });

  const b = req.body || {};
  const title = String(b.title || '').trim();
  if (!title) return res.status(400).json({ error: "Merci d'indiquer un titre." });

  const id = newId('request');
  run(`INSERT INTO purchase_requests (id, shop_id, title, category, quantity, description, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    [id, shop.id, title, String(b.category || ''), String(b.quantity || ''), String(b.desc || '').trim(), nowIso()]);

  res.status(201).json(serialize(get('SELECT * FROM purchase_requests WHERE id = ?', [id])));
});

module.exports = router;
