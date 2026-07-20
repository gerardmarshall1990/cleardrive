// WhatsApp webhook handler — message_delivered / message_read delivery receipts.
// Currently informational only (mock mode never receives real callbacks) but
// wired up now so the switch to the live Meta Cloud API requires no route changes.

const { supabaseAdmin } = require('../config/supabase');
const logger = require('../utils/logger');

async function handleWhatsAppWebhook(req, res) {
  const body = req.body || {};

  // Meta's webhook verification handshake (GET) is handled separately in the route file.
  const eventType = body.event_type || 'message_status';

  await supabaseAdmin.from('webhook_events').insert({ source: 'whatsapp', event_type: eventType, payload: body, processed: true });
  logger.info('WhatsApp webhook received', { eventType });

  return res.status(200).json({ received: true });
}

/** Meta requires a GET challenge-response handshake to verify the webhook URL. */
function verifyWhatsAppWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: 'verification_failed' });
}

module.exports = { handleWhatsAppWebhook, verifyWhatsAppWebhook };
