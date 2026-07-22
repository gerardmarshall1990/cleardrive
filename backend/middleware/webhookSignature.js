// Webhook signature verification — TrustIn/SignNow call their webhook
// endpoints with no Supabase JWT (see routes/webhookRoutes.js), so without
// this, anyone who finds the URL can POST a fake funds_received /
// document_signed event and push a real deal through the flow (e.g. fake
// their way into ESCROW/COMPLETE, or mark documents as signed).
//
// Real TrustIn/SignNow webhook secrets are not yet issued (same situation as
// TRUSTIN_MOCK_MODE / SIGNNOW_CLIENT_ID elsewhere in this codebase), so this
// verifies an HMAC-SHA256 signature ONLY when the matching secret env var is
// configured — until then it logs a warning and lets requests through, so
// local/mock-mode development keeps working. Setting the secret in .env
// (once issued) is the only change needed to enforce it in production.

const crypto = require('crypto');
const logger = require('../utils/logger');

function verifyWebhookSignature({ secretEnvVar, headerName, source }) {
  return (req, res, next) => {
    const secret = process.env[secretEnvVar];
    if (!secret) {
      logger.warn(`${source} webhook signature verification skipped — ${secretEnvVar} not configured`);
      return next();
    }

    const signature = req.get(headerName);
    if (!signature) {
      logger.warn(`${source} webhook rejected — missing ${headerName} header`);
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    const payload = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

    if (!valid) {
      logger.warn(`${source} webhook rejected — signature mismatch`);
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    return next();
  };
}

module.exports = { verifyWebhookSignature };
