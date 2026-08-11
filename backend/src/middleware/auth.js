const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and set one before starting the server.');
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

// Populates req.user if a valid token is present, but does not block the request.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) { /* ignore invalid/expired token, treat as anonymous */ }
  }
  next();
}

// Requires a valid token. Optionally restrict to specific roles: requireAuth('producer')
function requireAuth(...roles) {
  return function (req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentification requise.' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: 'Acces non autorise pour ce role.' });
      }
      req.user = payload;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Session invalide ou expiree.' });
    }
  };
}

module.exports = { signToken, optionalAuth, requireAuth };
