const crypto = require('crypto');

function newId(prefix) {
  return (prefix ? prefix + '-' : '') + crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function toJson(value) {
  return JSON.stringify(value == null ? [] : value);
}

function fromJson(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

module.exports = { newId, nowIso, toJson, fromJson };
