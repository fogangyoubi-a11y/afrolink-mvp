// End-to-end smoke test: boots the API in-process (no real network port needed
// for the app itself) and exercises auth, profiles, catalogue, purchase
// requests, messaging and the order flow. Stripe network calls are skipped
// automatically when STRIPE_SECRET_KEY isn't set (checked explicitly below).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
process.env.DATABASE_FILE = ':memory:';

const path = require('path');
const fs = require('fs');
const os = require('os');

// Use a throwaway DB file per run so repeated test runs don't collide.
const tmpDb = path.join(os.tmpdir(), `afrolink-test-${Date.now()}.db`);
process.env.DATABASE_FILE = tmpDb;

const app = require('../src/server');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS -', label); }
  else { fail++; console.log('FAIL -', label); }
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function req(base, method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, body: json };
}

async function run() {
  const server = await listen(app);
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  // Health check
  const health = await req(base, 'GET', '/api/health');
  check('health check ok', health.status === 200 && health.body.ok === true);

  // Signup a producer
  const signup = await req(base, 'POST', '/api/auth/signup', {
    email: 'producteur@test.cm', password: 'motdepasse123', role: 'producer', name: 'Ferme Test'
  });
  check('producer signup returns token', signup.status === 201 && !!signup.body.token);
  const producerToken = signup.body.token;

  // Duplicate signup should fail
  const dup = await req(base, 'POST', '/api/auth/signup', {
    email: 'producteur@test.cm', password: 'motdepasse123', role: 'producer', name: 'Ferme Test'
  });
  check('duplicate signup rejected (409)', dup.status === 409);

  // Wrong password login fails
  const badLogin = await req(base, 'POST', '/api/auth/login', { email: 'producteur@test.cm', password: 'wrong' });
  check('wrong password rejected (401)', badLogin.status === 401);

  // Correct login works
  const login = await req(base, 'POST', '/api/auth/login', { email: 'producteur@test.cm', password: 'motdepasse123' });
  check('login returns token', login.status === 200 && !!login.body.token);

  // /me works with token
  const me = await req(base, 'GET', '/api/auth/me', null, producerToken);
  check('/auth/me returns correct role', me.status === 200 && me.body.role === 'producer');

  // /me fails without token
  const meNoAuth = await req(base, 'GET', '/api/auth/me');
  check('/auth/me without token is 401', meNoAuth.status === 401);

  // Producer profile appears in public list
  const producersList1 = await req(base, 'GET', '/api/producers');
  check('new producer appears in public list', producersList1.body.some(p => p.name === 'Ferme Test'));

  // Update own producer profile with photos + video (the bug we fixed earlier, now server-side)
  const update = await req(base, 'PUT', '/api/producers/me', {
    name: 'Ferme Test', country: 'Cameroun', city: 'Douala',
    categories: ['Cacao & café'], desc: 'Test description',
    photos: ['data:image/jpeg;base64,AAAA'], video: 'youtube.com/watch?v=xyz', phone: ''
  }, producerToken);
  check('profile update succeeds', update.status === 200);
  check('photos persisted', update.body.photos.length === 1);
  check('video URL normalized (https:// prepended)', update.body.video === 'https://youtube.com/watch?v=xyz');

  const producersList2 = await req(base, 'GET', '/api/producers');
  const savedProducer = producersList2.body.find(p => p.name === 'Ferme Test');
  check('photo now visible in public directory listing', savedProducer && savedProducer.photos.length === 1);
  check('video link now visible in public directory listing', savedProducer && savedProducer.video === 'https://youtube.com/watch?v=xyz');

  // A shop can't edit a producer profile
  const shopSignup = await req(base, 'POST', '/api/auth/signup', {
    email: 'boutique@test.fr', password: 'motdepasse123', role: 'shop', name: 'Epicerie Test'
  });
  const shopToken = shopSignup.body.token;
  const crossRoleEdit = await req(base, 'PUT', '/api/producers/me', { name: 'Hack' }, shopToken);
  check('shop cannot edit producer profile (403)', crossRoleEdit.status === 403);

  // Shop publishes a purchase request
  const reqCreate = await req(base, 'POST', '/api/requests', {
    title: 'Recherche poivre de Penja', category: 'Épices', quantity: '200kg', desc: 'Pour boutique Paris'
  }, shopToken);
  check('purchase request created', reqCreate.status === 201);
  const reqList = await req(base, 'GET', '/api/requests');
  check('purchase request visible publicly', reqList.body.some(r => r.title === 'Recherche poivre de Penja'));

  // Producer adds a catalogue product
  const productCreate = await req(base, 'POST', '/api/products', {
    name: 'Cacao séché', category: 'Cacao & café', country: 'Cameroun', price: 3.8, unit: 'kg', desc: 'Fèves séchées'
  }, producerToken);
  check('product created', productCreate.status === 201);
  const productList = await req(base, 'GET', '/api/products');
  check('product visible in catalogue', productList.body.some(p => p.name === 'Cacao séché'));

  // Guest (unauthenticated visitor) contacts the producer
  const convCreate = await req(base, 'POST', '/api/conversations/find-or-create', {
    contactType: 'producteur', contactId: savedProducer.id, contactName: savedProducer.name, contactEmail: savedProducer.email,
    guestName: 'Boutique Paris', guestEmail: 'contact@boutiqueparis.fr'
  });
  check('conversation created for guest', convCreate.status === 200 && !!convCreate.body.id);
  const convId = convCreate.body.id;

  // Same guest contacting again reuses the same conversation (dedupe)
  const convAgain = await req(base, 'POST', '/api/conversations/find-or-create', {
    contactType: 'producteur', contactId: savedProducer.id, contactName: savedProducer.name, contactEmail: savedProducer.email,
    guestName: 'Boutique Paris', guestEmail: 'contact@boutiqueparis.fr'
  });
  check('repeat contact reuses same conversation id', convAgain.body.id === convId);

  // Guest sends a message
  const msgSend = await req(base, 'POST', `/api/conversations/${convId}/messages`, { text: 'Bonjour, avez-vous du cacao dispo ?', sender: 'guest' });
  check('guest message saved', msgSend.status === 201 && msgSend.body.messages.length === 1);

  // Producer sees the conversation in their inbox
  const inbox = await req(base, 'GET', '/api/conversations', null, producerToken);
  check('conversation appears in producer inbox', inbox.status === 200 && inbox.body.some(c => c.id === convId));

  // A shop (not the contact) cannot propose an order on this conversation
  const wrongOwnerOrder = await req(base, 'POST', `/api/conversations/${convId}/order`, { amountCents: 5000 }, shopToken);
  check('non-owner cannot propose order (403)', wrongOwnerOrder.status === 403);

  // Producer proposes an order amount
  const orderPropose = await req(base, 'POST', `/api/conversations/${convId}/order`, { amountCents: 15050 }, producerToken);
  check('order proposed', orderPropose.status === 201 && orderPropose.body.status === 'pending');

  const convWithOrder = await req(base, 'GET', `/api/conversations/${convId}`);
  check('order visible when fetching conversation', convWithOrder.body.order && convWithOrder.body.order.amountCents === 15050);

  // Checkout without Stripe configured returns a clear 503, not a crash
  const checkoutNoStripe = await req(base, 'POST', `/api/conversations/${convId}/order/checkout`, {});
  check('checkout without Stripe key returns 503 (not a crash)', checkoutNoStripe.status === 503);

  // Producer cancels the order
  const cancel = await req(base, 'POST', `/api/conversations/${convId}/order/cancel`, {}, producerToken);
  check('order canceled', cancel.status === 200);
  const convAfterCancel = await req(base, 'GET', `/api/conversations/${convId}`);
  check('order is null after cancel', convAfterCancel.body.order === null);

  server.close();
  fs.rmSync(tmpDb, { force: true });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });
