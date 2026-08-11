const express = require('express');
const { run, get, all } = require('../db');
const { newId, nowIso } = require('../util');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serialize(row) {
  return {
    id: row.id,
    producerId: row.producer_id,
    name: row.name,
    category: row.category,
    country: row.country,
    price: row.price,
    unit: row.unit,
    desc: row.description,
    photo: row.photo || null,
    createdAt: row.created_at
  };
}

// A resized JPEG at 640px/quality 0.7 (the client-side limits used by the upload UI)
// lands well under this — this is just a backstop against oversized/garbage payloads.
const MAX_PHOTO_LENGTH = 2_000_000;

// GET /api/products — the catalogue
router.get('/', (req, res) => {
  const rows = all(`
    SELECT products.*, producers.name AS producer_name, producers.email AS producer_email, producers.verified AS producer_verified
    FROM products JOIN producers ON producers.id = products.producer_id
    ORDER BY products.created_at DESC
  `);
  res.json(rows.map(r => ({
    ...serialize(r),
    producer: { name: r.producer_name, email: r.producer_email, verified: !!r.producer_verified }
  })));
});

// POST /api/products — add a product to the logged-in producer's catalogue
router.post('/', requireAuth('producer'), (req, res) => {
  const producer = get('SELECT id FROM producers WHERE user_id = ?', [req.user.sub]);
  if (!producer) return res.status(404).json({ error: 'Profil producteur introuvable.' });

  const b = req.body || {};
  const name = String(b.name || '').trim();
  const price = Number(b.price);
  if (!name) return res.status(400).json({ error: "Merci d'indiquer un nom de produit." });
  if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'Prix invalide.' });

  let photo = b.photo ? String(b.photo) : null;
  if (photo && (!photo.startsWith('data:image/') || photo.length > MAX_PHOTO_LENGTH)) {
    return res.status(400).json({ error: 'Photo invalide ou trop volumineuse.' });
  }

  const id = newId('product');
  run(`INSERT INTO products (id, producer_id, name, category, country, price, unit, description, photo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, producer.id, name, String(b.category || ''), String(b.country || ''), price, String(b.unit || 'kg'), String(b.desc || '').trim(), photo, nowIso()]);

  res.status(201).json(serialize(get('SELECT * FROM products WHERE id = ?', [id])));
});

module.exports = router;
