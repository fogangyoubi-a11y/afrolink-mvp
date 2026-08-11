const express = require('express');
const { run, get, all } = require('../db');
const { toJson, fromJson } = require('../util');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    city: row.city,
    categories: fromJson(row.categories, []),
    desc: row.description,
    businessNumber: row.business_number,
    email: row.email,
    phone: row.phone,
    verified: !!row.verified,
    createdAt: row.created_at
  };
}

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const rows = all('SELECT * FROM shops ORDER BY created_at DESC');
  let list = rows.map(serialize);
  if (q) {
    list = list.filter(s => {
      const hay = [s.name, s.country, s.city, ...(s.categories || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  res.json(list);
});

router.get('/:id', (req, res) => {
  const row = get('SELECT * FROM shops WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Boutique introuvable.' });
  res.json(serialize(row));
});

// PUT /api/shops/me — update the logged-in shop's own profile
router.put('/me', requireAuth('shop'), (req, res) => {
  const row = get('SELECT * FROM shops WHERE user_id = ?', [req.user.sub]);
  if (!row) return res.status(404).json({ error: 'Profil boutique introuvable.' });

  const b = req.body || {};
  const name = b.name !== undefined ? String(b.name).trim() : row.name;
  const country = b.country !== undefined ? String(b.country).trim() : row.country;
  const city = b.city !== undefined ? String(b.city).trim() : row.city;
  const categories = Array.isArray(b.categories) ? b.categories : fromJson(row.categories, []);
  const description = b.desc !== undefined ? String(b.desc).trim() : row.description;
  const businessNumber = b.businessNumber !== undefined ? String(b.businessNumber).trim() : row.business_number;
  const phone = b.phone !== undefined ? String(b.phone).trim() : row.phone;

  if (!name) return res.status(400).json({ error: "Merci d'indiquer un nom." });

  run(`UPDATE shops SET name=?, country=?, city=?, categories=?, description=?, business_number=?, phone=? WHERE id=?`,
    [name, country, city, toJson(categories), description, businessNumber, phone, row.id]);

  res.json(serialize(get('SELECT * FROM shops WHERE id = ?', [row.id])));
});

module.exports = router;
