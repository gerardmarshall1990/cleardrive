// Renders the MOCK TrustIn/UAE Pass identity-verification popup page.
//
// This stands in for TrustIn's own hosted UAE Pass verification page until
// real credentials exist. It is opened via window.open() from the web/mobile
// Identity Check screen using the verificationUrl returned by
// trustInKycService.initiateVerification. The session id in the URL acts as
// the page's only "auth" — exactly like a real hosted-redirect KYC flow,
// where the URL itself is the capability token.
//
// On load it simulates the UAE Pass sign-in + verification steps, then POSTs
// to our OWN webhook endpoint (POST /webhooks/trustin, event_type
// 'kyc_verified') exactly as the real TrustIn would call it — proving the
// webhook handling works end to end — then shows a checkmark and closes
// itself.
const { supabaseAdmin } = require('../config/supabase');

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function randomEidNumber() {
  const digits = () => Math.floor(Math.random() * 9000000000) + 1000000000;
  return `784-${1980 + Math.floor(Math.random() * 30)}-${digits()}-${Math.floor(Math.random() * 9) + 1}`;
}

async function renderVerificationPage(req, res) {
  const { sessionId } = req.params;

  const { data: session, error } = await supabaseAdmin
    .from('trustin_kyc_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    return res.status(404).send('<h1>Verification link not found or expired.</h1>');
  }

  const { data: deal } = await supabaseAdmin.from('deals').select('id, seller_id, buyer_id').eq('id', session.deal_id).single();
  const partyUserId = session.party === 'seller' ? deal?.seller_id : deal?.buyer_id;
  const { data: user } = partyUserId
    ? await supabaseAdmin.from('users').select('full_name, emirates_id, nationality').eq('id', partyUserId).single()
    : { data: null };

  const identity = {
    full_name: user?.full_name || (session.party === 'seller' ? 'Test Seller' : 'Test Buyer'),
    emirates_id_number: user?.emirates_id || randomEidNumber(),
    nationality: user?.nationality || 'United Arab Emirates',
  };

  const payload = JSON.stringify({
    event_type: 'kyc_verified',
    session_id: session.id,
    ...identity,
  }).replace(/</g, '\\u003c');

  res.set('Content-Type', 'text/html');
  return res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>UAE Pass — Identity Verification (Mock)</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #0b0b0e; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { text-align: center; padding: 32px; max-width: 320px; }
  .spinner { width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #d4af37; border-radius: 50%; margin: 0 auto 20px; animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  h2 { font-size: 16px; font-weight: 600; margin: 0 0 8px; }
  p { font-size: 13px; color: rgba(255,255,255,0.5); margin: 0; }
  .check { font-size: 40px; margin-bottom: 12px; }
</style>
</head>
<body>
  <div class="card" id="card">
    <div class="spinner"></div>
    <h2>Signing in with UAE Pass…</h2>
    <p>${escapeHtml(session.party === 'seller' ? 'Seller' : 'Buyer')} identity verification — mock</p>
  </div>
  <script>
    (function () {
      var payload = ${payload};
      setTimeout(function () {
        document.getElementById('card').innerHTML = '<div class="spinner"></div><h2>Verifying identity…</h2><p>Please wait</p>';
        fetch('/webhooks/trustin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).finally(function () {
          document.getElementById('card').innerHTML = '<div class="check">✅</div><h2>Verified</h2><p>This window will close automatically…</p>';
          setTimeout(function () { window.close(); }, 1200);
        });
      }, 1500);
    })();
  </script>
</body>
</html>`);
}

module.exports = { renderVerificationPage };
