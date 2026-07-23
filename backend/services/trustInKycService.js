// TrustIn identity-verification (KYC via UAE Pass) service — MOCKED.
//
// TrustIn (ADGM/FSRA-regulated escrow partner) cannot white-label identity
// verification: both seller and buyer must verify directly with TrustIn via
// UAE Pass before TrustIn will hold escrow funds for a deal. This is
// separate from — and does not touch — ClearDrive's own Claude Vision
// document extraction (Mulkiya / settlement letter / fines screenshot,
// see documentVisionService.js), which stays exactly as-is.
//
// No real TrustIn KYC credentials exist yet, so this runs in mock mode by
// default (mirrors the mock/real split already used in trustInService.js
// for escrow). Every TrustIn-specific detail — base URL, auth header,
// endpoint paths, response field names — lives in the CONFIG block below.
// Swapping to the real integration later should only require filling in
// env vars and, if TrustIn's actual field names differ, adjusting the
// RESPONSE_FIELDS map here — no calling code should need to change.
//
// Flow (mirrors the standard identity-verification API pattern, and TrustIn's
// expected real shape):
//   1. initiateVerification(deal, party) -> { verificationUrl, sessionId }
//        Mock: creates/reuses a trustin_kyc_sessions row, returns a URL to
//              our own mock UAE Pass popup page (mockTrustInKycController.js).
//        Real: POST {BASE_URL}{INITIATE_PATH} with the API key; TrustIn
//              returns a UAE Pass redirect URL + their own session id.
//   2. The party completes verification in the popup (mock: our page;
//      real: TrustIn/UAE Pass's own hosted page).
//   3. TrustIn calls our webhook (POST /webhooks/trustin, event_type
//      'kyc_verified') with the session id + identity data — see
//      webhooks/trustInWebhook.js. The mock page simulates this exact call.
//   4. The frontend confirms completion by re-fetching the deal
//      (seller_kyc_complete / buyer_kyc_complete), which the webhook flips.

const { supabaseAdmin } = require('../config/supabase');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// CONFIG — every TrustIn-KYC-specific detail lives here.
// ---------------------------------------------------------------------------
const MOCK_MODE = process.env.TRUSTIN_MOCK_MODE !== 'false';
const BASE_URL = process.env.TRUSTIN_API_BASE_URL || process.env.TRUSTIN_BASE_URL;
const API_KEY = process.env.TRUSTIN_API_KEY;
const AUTH_HEADER = 'Authorization';
const AUTH_SCHEME = 'Bearer';
const INITIATE_PATH = '/v1/kyc/initiate'; // placeholder — real TrustIn endpoint path, TBD once creds exist
const TIMEOUT_MS = 15000;
// Field names TrustIn is expected to use in its real initiate response /
// webhook payload — adjust here if the real integration differs.
const RESPONSE_FIELDS = {
  verificationUrl: 'verification_url',
  providerSessionId: 'provider_session_id',
};

async function logMockCall(dealId, action, payload) {
  logger.mock('TrustIn-KYC', action, payload);
  await supabaseAdmin.from('automation_log').insert({
    deal_id: dealId,
    action: `trustin_kyc_${action}`,
    status: 'sent',
    payload: { mock: true, ...payload },
  });
}

/**
 * Starts identity verification for one party on one deal. In mock mode this
 * creates (or reuses, if one is already pending) a trustin_kyc_sessions row
 * and returns a link to our own mock UAE Pass popup page — the mock page's
 * id in the URL doubles as the session id used to correlate the eventual
 * webhook callback.
 */
async function initiateVerification({ deal, party, backendBaseUrl }) {
  if (MOCK_MODE) {
    const { data: existing } = await supabaseAdmin
      .from('trustin_kyc_sessions')
      .select('*')
      .eq('deal_id', deal.id)
      .eq('party', party)
      .maybeSingle();

    let session = existing;
    if (!session) {
      const { data: created, error } = await supabaseAdmin
        .from('trustin_kyc_sessions')
        .insert({ deal_id: deal.id, party, status: 'pending' })
        .select()
        .single();
      if (error) throw new Error('Could not start identity verification — please try again');
      session = created;
    } else if (session.status !== 'verified') {
      await supabaseAdmin.from('trustin_kyc_sessions').update({ status: 'pending' }).eq('id', session.id);
    }

    await logMockCall(deal.id, 'initiate', { party, sessionId: session.id });

    return {
      verificationUrl: `${backendBaseUrl}/mock/trustin-kyc/${session.id}`,
      sessionId: session.id,
    };
  }

  // Real TrustIn call — not exercised until real credentials exist.
  const axios = require('axios');
  const response = await axios.post(
    `${BASE_URL}${INITIATE_PATH}`,
    { deal_reference: deal.ref, party },
    { headers: { [AUTH_HEADER]: `${AUTH_SCHEME} ${API_KEY}` }, timeout: TIMEOUT_MS }
  );
  return {
    verificationUrl: response.data[RESPONSE_FIELDS.verificationUrl],
    sessionId: response.data[RESPONSE_FIELDS.providerSessionId],
  };
}

module.exports = { initiateVerification, MOCK_MODE };
