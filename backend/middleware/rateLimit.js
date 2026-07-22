// Lightweight in-memory rate limiter for auth endpoints — no new dependency
// needed for MVP. Login had zero throttling (unlimited password-guessing
// attempts against any email) and signup had zero throttling (unlimited
// account-creation, an abuse/spam vector) before this. Per-IP + per-route
// buckets, fixed window.
//
// NOTE: in-memory only — fine for a single backend instance. If this scales
// horizontally, swap the Map below for a shared store (e.g. Redis) so limits
// apply across instances.

const buckets = new Map(); // key -> { count, resetAt }

function rateLimit({ windowMs, max, message }) {
  return (req, res, next) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      return res.status(429).json({ error: message || 'Too many requests — please try again later' });
    }

    return next();
  };
}

// Periodically clear expired buckets so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

module.exports = { rateLimit };
