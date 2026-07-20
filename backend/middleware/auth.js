// Auth middleware — verifies Supabase-issued session JWTs and enforces role-based access.
//
// IMPORTANT: Supabase Auth session tokens are signed with the Supabase PROJECT's
// own JWT secret (Project Settings > API), which is a different value from our
// app's JWT_SECRET env var. Verifying them with jwt.verify(token, JWT_SECRET)
// would silently fail for every real user. Instead we ask Supabase itself to
// validate the token via supabase.auth.getUser(token) — this is the supported
// approach and works regardless of which signing algorithm/secret the project uses.

const { supabaseAdmin } = require('../config/supabase');
const logger = require('../utils/logger');

/**
 * Verifies the Bearer token on the request, loads the corresponding
 * application user row (from our `users` table, matched on auth_user_id),
 * and attaches both to req.authUser / req.appUser.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization Bearer token' });
    }

    const { data, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.authUser = data.user;

    const { data: appUser, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('auth_user_id', data.user.id)
      .single();

    if (error || !appUser) {
      return res.status(401).json({ error: 'No application user record found for this account' });
    }

    req.appUser = appUser;
    next();
  } catch (err) {
    logger.error('Auth middleware failure', { error: err.message });
    return res.status(500).json({ error: 'Authentication check failed' });
  }
}

/**
 * Restricts a route to one or more roles. Must run after requireAuth.
 * @param {...string} roles - e.g. requireRole('admin') or requireRole('seller', 'buyer')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.appUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.appUser.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
