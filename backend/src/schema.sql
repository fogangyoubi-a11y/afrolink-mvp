-- AfroLink backend schema (SQLite by default; see README for swapping to Postgres)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('producer','shop')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS producers (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE REFERENCES users(id),
  name TEXT NOT NULL,
  country TEXT,
  city TEXT,
  categories TEXT,      -- JSON array
  description TEXT,
  photos TEXT,           -- JSON array of data URLs
  video TEXT,
  email TEXT,
  phone TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE REFERENCES users(id),
  name TEXT NOT NULL,
  country TEXT,
  city TEXT,
  categories TEXT,      -- JSON array
  description TEXT,
  business_number TEXT,
  email TEXT,
  phone TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  producer_id TEXT REFERENCES producers(id),
  name TEXT NOT NULL,
  category TEXT,
  country TEXT,
  price REAL,
  unit TEXT,
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_requests (
  id TEXT PRIMARY KEY,
  shop_id TEXT REFERENCES shops(id),
  title TEXT NOT NULL,
  category TEXT,
  quantity TEXT,
  description TEXT,
  status TEXT DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  contact_type TEXT NOT NULL,   -- 'producteur' | 'boutique'
  contact_id TEXT NOT NULL,     -- producers.id or shops.id
  contact_name TEXT,
  contact_email TEXT,
  guest_name TEXT,
  guest_email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender TEXT NOT NULL,   -- 'guest' | 'contact'
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  conversation_id TEXT UNIQUE NOT NULL REFERENCES conversations(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'eur',
  status TEXT DEFAULT 'pending',  -- pending | paid | canceled
  stripe_session_id TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_type, contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_products_producer ON products(producer_id);
