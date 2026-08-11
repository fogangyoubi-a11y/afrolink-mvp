// Minimal in-memory rate limiter — no extra dependency needed for a single-process
// prototype. Tracks attempts per IP address in a sliding window and blocks once the
// limit is exceeded, to slow down brute-force login/signup attempts.
//
// Note: this resets whenever the server restarts, and only works correctly for a
// single server instance (no shared store across processes). Fine for AfroLink's
// current scale; if you later run multiple backend instances behind a load balancer,
// swap this for a Redis-backed limiter (e.g. `rate-limiter-flexible`).

const buckets = new Map(); // key -> { count, resetAt }

function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Trop de tentatives. Merci de reessayer plus tard.' } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${req.baseUrl}${req.path}:${ip}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

// Periodically drop expired buckets so this Map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

module.exports = { rateLimit };
