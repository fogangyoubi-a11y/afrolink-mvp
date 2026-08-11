// Data layer. Uses SQLite (Node's built-in node:sqlite) by default — zero config,
// a single file on disk, and enough for an early-stage marketplace. If you outgrow
// it, this is the one file to swap for a `pg` (Postgres) connection pool; every
// route talks to the small run/get/all interface below, not to SQLite directly.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DATABASE_FILE || path.join(DATA_DIR, 'afrolink.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}
function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}
function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

module.exports = { db, run, get, all };
