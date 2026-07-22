// Webhook routes are deliberately NOT behind requireAuth — TrustIn/SignNow/WhatsApp
// call these directly with their own signature/verification scheme instead of a
// Supabase JWT. HMAC signature verification (middleware/webhookSignature.js) is
// applied per-provider; it self-disables (with a logged warning) until each
// provider's real webhook secret is issued and set in .env.

const express = require('express');
const router = express.Router();

const { handleTrustInWebhook } = require('../webhooks/trustInWebhook');
const { handleSignNowWebhook } = require('../webhooks/signNowWebhook');
const { handleWhatsAppWebhook, verifyWhatsAppWebhook } = require('../webhooks/whatsAppWebhook');
const { asyncHandler } = require('../middleware/errorHandler');
const { verifyWebhookSignature } = require('../middleware/webhookSignature');

router.post(
  '/trustin',
  verifyWebhookSignature({ secretEnvVar: 'TRUSTIN_WEBHOOK_SECRET', headerName: 'X-TrustIn-Signature', source: 'TrustIn' }),
  asyncHandler(handleTrustInWebhook)
);
router.post(
  '/signnow',
  verifyWebhookSignature({ secretEnvVar: 'SIGNNOW_WEBHOOK_SECRET', headerName: 'X-SignNow-Signature', source: 'SignNow' }),
  asyncHandler(handleSignNowWebhook)
);

router.get('/whatsapp', verifyWhatsAppWebhook);
router.post('/whatsapp', asyncHandler(handleWhatsAppWebhook));

module.exports = router;
