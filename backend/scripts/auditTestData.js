// Reports (does NOT delete) rows in the production DB that look like leftover
// test/dev artifacts, so a human can decide what's safe to purge before
// onboarding real clients. Run with: node scripts/auditTestData.js
//
// Heuristics used to flag a row as "likely test data" — all conservative,
// pattern-based on how this project's own test/dev sessions name things:
//   - email containing @cleardrive.test, or starting with e2e./test./live./demo.
//   - deal ref used only by seed/smoke-test scripts (none currently known)
// Anything not matching a heuristic is left out of the "likely test" list
// entirely rather than guessed at — false negatives are safer than false
// positives here.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const TEST_EMAIL_PATTERNS = [/@cleardrive\.test$/i, /^e2e\./i, /^test\./i, /^live\.admin\./i, /^demo\./i];

function looksLikeTestEmail(email) {
  return Boolean(email) && TEST_EMAIL_PATTERNS.some((re) => re.test(email));
}

async function main() {
  const { data: users, error: usersErr } = await sb
    .from('users')
    .select('id, email, role, full_name, created_at')
    .order('created_at', { ascending: true });
  if (usersErr) throw usersErr;

  const { data: deals, error: dealsErr } = await sb
    .from('deals')
    .select('id, ref, status, seller_id, buyer_id, sale_price, created_at')
    .order('created_at', { ascending: true });
  if (dealsErr) throw dealsErr;

  const testUsers = users.filter((u) => looksLikeTestEmail(u.email));
  const testUserIds = new Set(testUsers.map((u) => u.id));
  const dealsTouchingTestUsers = deals.filter(
    (d) => testUserIds.has(d.seller_id) || testUserIds.has(d.buyer_id)
  );

  console.log(`\n=== Full counts ===`);
  console.log(`Total users: ${users.length}`);
  console.log(`Total deals: ${deals.length}`);

  console.log(`\n=== Likely-test users (${testUsers.length}) — matched by email pattern ===`);
  testUsers.forEach((u) => console.log(`  ${u.id}  ${u.email}  role=${u.role}  created=${u.created_at}`));

  console.log(`\n=== Admin accounts (review manually — not all flagged above) ===`);
  users
    .filter((u) => u.role === 'admin')
    .forEach((u) => console.log(`  ${u.id}  ${u.email}  created=${u.created_at}${looksLikeTestEmail(u.email) ? '  [flagged as test]' : ''}`));

  console.log(`\n=== Deals touching a flagged test user (${dealsTouchingTestUsers.length}) ===`);
  dealsTouchingTestUsers.forEach((d) => console.log(`  ${d.ref}  status=${d.status}  price=${d.sale_price}  created=${d.created_at}`));

  console.log(`\n=== Deals NOT touching a flagged test user (${deals.length - dealsTouchingTestUsers.length}) — review individually, these are NOT auto-flagged ===`);
  deals
    .filter((d) => !dealsTouchingTestUsers.includes(d))
    .forEach((d) => console.log(`  ${d.ref}  status=${d.status}  price=${d.sale_price}  created=${d.created_at}`));

  console.log(`\nThis script only reports — nothing was deleted. Review the lists above, then decide:\n` +
    `  (a) delete flagged rows individually via Supabase Table Editor, or\n` +
    `  (b) ask for a follow-up script to delete a specific reviewed list, or\n` +
    `  (c) stand up a separate staging Supabase project going forward and leave this one as-is.\n`);
}

main().catch((err) => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
