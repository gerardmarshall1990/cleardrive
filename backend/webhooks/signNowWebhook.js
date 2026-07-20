// SignNow webhook handler — document_signed / document.complete events.
// When a document tied to a deal is fully signed, marks the corresponding
// doc*_signed flag and, once all required documents for the current stage
// are signed, automatically advances the deal to ESCROW.

const { supabaseAdmin } = require('../config/supabase');
const dealFlowEngine = require('../services/dealFlowEngine');
const logger = require('../utils/logger');

async function handleSignNowWebhook(req, res) {
  const body = req.body || {};
  const eventType = body.event_type || body.meta?.event;
  const documentId = body.document_id || body.content?.document_id || body.meta?.related_document_id;

  const { data: eventRow } = await supabaseAdmin
    .from('webhook_events')
    .insert({ source: 'signnow', event_type: eventType || 'unknown', payload: body })
    .select()
    .single();

  try {
    if (!documentId) {
      logger.warn('SignNow webhook missing document id', { body });
      return res.status(200).json({ received: true, matched: false });
    }

    const { data: deal } = await supabaseAdmin
      .from('deals')
      .select('*')
      .or(`doc001_signnow_id.eq.${documentId},doc002_signnow_id.eq.${documentId},doc003_signnow_id.eq.${documentId}`)
      .single();

    if (!deal) {
      logger.warn('SignNow webhook for unknown document', { documentId });
      return res.status(200).json({ received: true, matched: false });
    }

    const updates = {};
    if (deal.doc001_signnow_id === documentId) updates.doc001_signed = true;
    if (deal.doc002_signnow_id === documentId) updates.doc002_signed = true;
    if (deal.doc003_signnow_id === documentId) updates.doc003_signed = true;

    await supabaseAdmin.from('deals').update(updates).eq('id', deal.id);

    // All required documents signed? Seller+buyer on DOC-001, seller on DOC-002,
    // and partner on DOC-003 only if a referral partner exists on this deal.
    await dealFlowEngine.checkAndAdvanceIfAllSigned(deal.id);

    if (eventRow) await supabaseAdmin.from('webhook_events').update({ processed: true }).eq('id', eventRow.id);
    return res.status(200).json({ received: true, matched: true });
  } catch (err) {
    logger.error('Error processing SignNow webhook', { error: err.message });
    return res.status(200).json({ received: true, error: 'processing_error' });
  }
}

module.exports = { handleSignNowWebhook };
