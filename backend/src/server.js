require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { stripeWebhookHandler } = require('./stripeWebhook');
const authRoutes = require('./routes/auth');
const producerRoutes = require('./routes/producers');
const shopRoutes = require('./routes/shops');
const productRoutes = require('./routes/products');
const requestRoutes = require('./routes/requests');
const conversationRoutes = require('./routes/conversations');
const orderRoutes = require('./routes/orders');

const app = express();

// CORS_ORIGIN lets you lock the API down to your real frontend domain(s) once deployed
// (comma-separated, e.g. "https://afrolink.com,https://www.afrolink.com"). Left empty,
// any origin is allowed — which is what you want while testing locally by opening the
// HTML files directly (file://) or from a dev server on an unpredictable port.
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    // `origin` is undefined for non-browser requests (curl, server-to-server) and for
    // pages opened as file:// — always allow those. Otherwise check the allow-list.
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Origine non autorisee par CORS.'));
  }
}));

// Stripe requires the raw request body to verify webhook signatures, so this
// route is registered BEFORE the global express.json() parser below.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json({ limit: '10mb' })); // 10mb to comfortably fit a few base64 product/profile photos

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/producers', producerRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/products', productRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/conversations', orderRoutes); // adds :id/order, :id/order/checkout, :id/order/cancel

app.use((req, res) => res.status(404).json({ error: 'Route introuvable.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur.' });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`AfroLink backend listening on http://localhost:${PORT}`));
}

module.exports = app;
