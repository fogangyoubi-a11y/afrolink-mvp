const express = require('express');
const bcrypt = require('bcryptjs');
const { run, get } = require('../db');
const { newId, nowIso } = require('../util');
const { signToken, requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// Slow down credential-stuffing / brute-force attempts: 10 tries per 15 minutes per IP,
// per route. Login is a little tighter than signup since it's the more common target.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Trop de tentatives de connexion. Merci de reessayer dans quelques minutes.' });
const signupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Trop de tentatives. Merci de reessayer dans quelques minutes.' });

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

// POST /api/auth/signup { email, password, role: 'producer'|'shop', name }
router.post('/signup', signupLimiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = req.body.role;
  const name = String(req.body.name || '').trim();

  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email invalide.' });
  if (password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caracteres.' });
  if (!['producer', 'shop'].includes(role)) return res.status(400).json({ error: "Le role doit etre 'producer' ou 'shop'." });
  if (!name) return res.status(400).json({ error: 'Merci d\'indiquer un nom.' });

  const existing = get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(409).json({ error: 'Un compte existe deja avec cet email.' });

  const userId = newId('user');
  const passwordHash = bcrypt.hashSync(password, 10);
  const createdAt = nowIso();

  run('INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, email, passwordHash, role, createdAt]);

  if (role === 'producer') {
    run(`INSERT INTO producers (id, user_id, name, country, city, categories, description, photos, video, email, phone, verified, created_at)
         VALUES (?, ?, ?, '', '', '[]', '', '[]', '', ?, '', 0, ?)`,
      [newId('producer'), userId, name, email, createdAt]);
  } else {
    run(`INSERT INTO shops (id, user_id, name, country, city, categories, description, business_number, email, phone, verified, created_at)
         VALUES (?, ?, ?, '', '', '[]', '', '', ?, '', 0, ?)`,
      [newId('shop'), userId, name, email, createdAt]);
  }

  const user = { id: userId, email, role };
  res.status(201).json({ token: signToken(user), user });
});

// POST /api/auth/login { email, password }
router.post('/login', loginLimiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const row = get('SELECT id, email, password_hash, role FROM users WHERE email = ?', [email]);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  }

  const user = { id: row.id, email: row.email, role: row.role };
  res.json({ token: signToken(user), user });
});

// GET /api/auth/me
router.get('/me', requireAuth(), (req, res) => {
  const row = get('SELECT id, email, role, created_at FROM users WHERE id = ?', [req.user.sub]);
  if (!row) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ id: row.id, email: row.email, role: row.role, createdAt: row.created_at });
});

module.exports = router;
