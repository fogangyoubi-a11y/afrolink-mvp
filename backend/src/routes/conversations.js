const express = require('express');
const { run, get, all } = require('../db');
const { newId, nowIso } = require('../util');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function serializeConversation(row) {
  return {
    id: row.id,
    contactType: row.contact_type,
    contactId: row.contact_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeMessage(row) {
  return { id: row.id, sender: row.sender, text: row.text, createdAt: row.created_at };
}

function loadOrder(conversationId) {
  const row = get('SELECT * FROM orders WHERE conversation_id = ?', [conversationId]);
  if (!row) return null;
  return {
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at
  };
}

function fullConversation(row) {
  const messages = all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', [row.id]).map(serializeMessage);
  return { ...serializeConversation(row), messages, order: loadOrder(row.id) };
}

// POST /api/conversations/find-or-create
// { contactType, contactId, contactName, contactEmail, guestName, guestEmail }
// Used by a visitor clicking "Contacter" on a producer/shop card — no login required.
router.post('/find-or-create', (req, res) => {
  const b = req.body || {};
  const contactType = String(b.contactType || '').trim();
  const contactId = String(b.contactId || '').trim();
  if (!contactType || !contactId) return res.status(400).json({ error: 'contactType et contactId sont requis.' });

  const guestEmail = String(b.guestEmail || '').trim().toLowerCase();

  let row = get(
    'SELECT * FROM conversations WHERE contact_type = ? AND contact_id = ? AND guest_email = ?',
    [contactType, contactId, guestEmail]
  );

  if (!row) {
    const id = newId('conv');
    const ts = nowIso();
    run(`INSERT INTO conversations (id, contact_type, contact_id, contact_name, contact_email, guest_name, guest_email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, contactType, contactId, String(b.contactName || '').trim(), String(b.contactEmail || '').trim(),
       String(b.guestName || '').trim(), guestEmail, ts, ts]);
    row = get('SELECT * FROM conversations WHERE id = ?', [id]);
  }

  res.json(fullConversation(row));
});

router.get('/:id', (req, res) => {
  const row = get('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Conversation introuvable.' });
  res.json(fullConversation(row));
});

// POST /api/conversations/:id/messages { text, sender: 'guest' | 'contact' }
router.post('/:id/messages', (req, res) => {
  const conv = get('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });

  const text = String((req.body || {}).text || '').trim();
  const sender = ['guest', 'contact'].includes((req.body || {}).sender) ? req.body.sender : 'guest';
  if (!text) return res.status(400).json({ error: 'Message vide.' });

  const id = newId('msg');
  const ts = nowIso();
  run('INSERT INTO messages (id, conversation_id, sender, text, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, conv.id, sender, text, ts]);
  run('UPDATE conversations SET updated_at = ? WHERE id = ?', [ts, conv.id]);

  res.status(201).json(fullConversation(get('SELECT * FROM conversations WHERE id = ?', [conv.id])));
});

// GET /api/conversations — inbox for the logged-in producer/shop (conversations addressed to them)
router.get('/', requireAuth('producer', 'shop'), (req, res) => {
  const table = req.user.role === 'producer' ? 'producers' : 'shops';
  // Shops are contacted both directly (contactType 'boutique') and via replies to their
  // purchase requests (contactType 'demande') — both belong in the same inbox.
  const contactTypes = req.user.role === 'producer' ? ['producteur'] : ['boutique', 'demande'];
  const profile = get(`SELECT id FROM ${table} WHERE user_id = ?`, [req.user.sub]);
  if (!profile) return res.json([]);

  const placeholders = contactTypes.map(() => '?').join(', ');
  const rows = all(`SELECT * FROM conversations WHERE contact_type IN (${placeholders}) AND contact_id = ? ORDER BY updated_at DESC`,
    [...contactTypes, profile.id]);
  res.json(rows.map(fullConversation));
});

module.exports = router;
