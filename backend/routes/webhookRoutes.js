// Webhook routes are deliberately NOT behind requireAuth — TrustIn/SignNow/WhatsApp
// call these directly with their own signature/verification scheme instead of a
// Supabase JWT. (Signature verification per-provider should be added here once
// each provider's real webhook secret is issued.)

const express = require('express');
const router = express.Router();

const { handleTrustInWebhook } = require('../webhooks/trustInWebhook');
const { handleSignNowWebhook } = require('../webhooks/signNowWebhook');
const { handleWhatsAppWebhook, verifyWhatsAppWebhook } = require('../webhooks/whatsAppWebhook');
const { asyncHandler } = require('../middleware/errorHandler');

router.post('/trustin', asyncHandler(handleTrustInWebhook));
router.post('/signnow', asyncHandler(handleSignNowWebhook));

router.get('/whatsapp', verifyWhatsAppWebhook);
router.post('/whatsapp', asyncHandler(handleWhatsAppWebhook));

module.exports = router;
