// One-off CLI to create an admin account (admin isn't a self-serve signup role —
// see authController.js SELF_SERVE_ROLES — so ops accounts are provisioned here).
//
// Usage: node scripts/createAdminUser.js <email> <password> <fullName> <phone>

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const [, , email, password, fullName, phone] = process.argv;

if (!email || !password || !fullName || !phone) {
  console.error('Usage: node scripts/createAdminUser.js <email> <password> <fullName> <phone>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters');
  process.exit(1);
}

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    console.error('Auth user creation failed:', createErr.message);
    process.exit(1);
  }

  const { data: user, error: userErr } = await supabaseAdmin
    .from('users')
    .insert({ auth_user_id: created.user.id, email, full_name: fullName, phone, role: 'admin' })
    .select()
    .single();

  if (userErr) {
    console.error('users row creation failed, rolling back auth user:', userErr.message);
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    process.exit(1);
  }

  console.log('Admin account created:', { id: user.id, email: user.email });
})();
