// Auth controller — self-serve signup/login for individuals (who act as
// seller or buyer on a per-deal basis), dealers, and brokers. Admins are
// created manually in Supabase (not self-serve, per spec).
//
// Signup creates a Supabase Auth user (email/password) AND the matching row in
// our `users` table (role, name, phone, etc.) that requireAuth looks up on
// every subsequent request. We immediately sign the user in and return a
// session so the frontend doesn't need a second round trip.

const { supabaseAdmin, supabaseAuth } = require('../config/supabase');
const logger = require('../utils/logger');

const SELF_SERVE_ROLES = ['individual', 'dealer', 'broker'];

/** POST /api/auth/signup */
async function signup(req, res) {
  const { email, password, fullName, phone, role, nationality, emiratesId } = req.body;

  if (!email || !password || !fullName || !phone || !SELF_SERVE_ROLES.includes(role)) {
    return res.status(400).json({ error: `email, password, fullName, phone, and role (${SELF_SERVE_ROLES.join('/')}) are required` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no transactional email service configured — auto-confirm
  });

  if (createErr || !created?.user) {
    const msg = createErr?.message?.includes('already been registered') ? 'An account with this email already exists' : 'Could not create account — please try again';
    return res.status(400).json({ error: msg });
  }

  const { data: appUser, error: userErr } = await supabaseAdmin
    .from('users')
    .insert({
      auth_user_id: created.user.id,
      email,
      full_name: fullName,
      phone,
      role,
      nationality: nationality || null,
      emirates_id: emiratesId || null,
    })
    .select()
    .single();

  if (userErr) {
    logger.error('Failed to create app user row after auth signup', { error: userErr.message });
    await supabaseAdmin.auth.admin.deleteUser(created.user.id); // roll back orphaned auth user
    return res.status(500).json({ error: 'Could not complete signup — please try again' });
  }

  // Dealers/brokers also need a `partners` row (deals reference referral_partner_id,
  // not users.id, and earnings/tier tracking lives on that table). There's no
  // partners.user_id column, so we link the two by phone number — the same
  // pattern used to attach a buyer to a deal by phone (see dealController.resolveBuyerId).
  if (role === 'dealer' || role === 'broker') {
    const { error: partnerErr } = await supabaseAdmin.from('partners').insert({ name: fullName, phone, email, type: role });
    if (partnerErr) {
      logger.error('Failed to create partner row after auth signup', { error: partnerErr.message });
      await supabaseAdmin.from('users').delete().eq('id', appUser.id);
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({ error: 'Could not complete signup — please try again' });
    }
  }

  const { data: session, error: signInErr } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (signInErr || !session?.session) {
    logger.error('Signup succeeded but auto sign-in failed', { error: signInErr?.message });
    return res.status(201).json({ user: appUser, session: null });
  }

  return res.status(201).json({ user: appUser, session: session.session });
}

/** POST /api/auth/login */
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const { data: appUser, error: userErr } = await supabaseAdmin.from('users').select('*').eq('auth_user_id', data.user.id).single();
  if (userErr || !appUser) {
    return res.status(401).json({ error: 'No application account found for this login' });
  }

  return res.json({ user: appUser, session: data.session });
}

/** GET /api/auth/me — returns the calling user's own profile (requireAuth attaches req.appUser). */
async function me(req, res) {
  return res.json({ user: req.appUser });
}

module.exports = { signup, login, me };
