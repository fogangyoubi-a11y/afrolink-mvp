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
    photos: fromJson(row.photos, []),
    video: row.video,
    email: row.email,
    phone: row.phone,
    verified: !!row.verified,
    createdAt: row.created_at
  };
}

// GET /api/producers?q=search
router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const rows = all('SELECT * FROM producers ORDER BY created_at DESC');
  let list = rows.map(serialize);
  if (q) {
    list = list.filter(p => {
      const hay = [p.name, p.country, p.city, ...(p.categories || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  res.json(list);
});

router.get('/:id', (req, res) => {
  const row = get('SELECT * FROM producers WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Producteur introuvable.' });
  res.json(serialize(row));
});

// PUT /api/producers/me — update the logged-in producer's own profile
router.put('/me', requireAuth('producer'), (req, res) => {
  const row = get('SELECT * FROM producers WHERE user_id = ?', [req.user.sub]);
  if (!row) return res.status(404).json({ error: 'Profil producteur introuvable.' });

  const b = req.body || {};
  const name = b.name !== undefined ? String(b.name).trim() : row.name;
  const country = b.country !== undefined ? String(b.country).trim() : row.country;
  const city = b.city !== undefined ? String(b.city).trim() : row.city;
  const categories = Array.isArray(b.categories) ? b.categories : fromJson(row.categories, []);
  const description = b.desc !== undefined ? String(b.desc).trim() : row.description;
  const photos = Array.isArray(b.photos) ? b.photos.slice(0, 3) : fromJson(row.photos, []);
  let video = b.video !== undefined ? String(b.video).trim() : row.video;
  if (video && !/^https?:\/\//i.test(video)) video = 'https://' + video;
  const phone = b.phone !== undefined ? String(b.phone).trim() : row.phone;

  if (!name) return res.status(400).json({ error: "Merci d'indiquer un nom." });

  run(`UPDATE producers SET name=?, country=?, city=?, categories=?, description=?, photos=?, video=?, phone=? WHERE id=?`,
    [name, country, city, toJson(categories), description, toJson(photos), video, phone, row.id]);

  res.json(serialize(get('SELECT * FROM producers WHERE id = ?', [row.id])));
});

module.exports = router;
