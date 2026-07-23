// TrustIn webhook handler — funds_received, loan_cleared, fines_cleared, transfer_complete.
// Each event advances the deal flow automatically with zero human touchpoints.

const { supabaseAdmin } = require('../config/supabase');
const { STAGES } = require('../utils/dealStages');
const dealFlowEngine = require('../services/dealFlowEngine');
const whatsApp = require('../services/whatsAppService');
const trustIn = require('../services/trustInService');
const logger = require('../utils/logger');

async function handleTrustInWebhook(req, res) {
  const { event_type: eventType, deal_id: trustinDealId, amount, payload } = req.body || {};

  // Persist raw event first — even if downstream processing fails, we keep the audit trail.
  const { data: eventRow, error: insertErr } = await supabaseAdmin
    .from('webhook_events')
    .insert({ source: 'trustin', event_type: eventType, payload: req.body })
    .select()
    .single();

  if (insertErr) {
    logger.error('Failed to persist TrustIn webhook event', { error: insertErr.message });
  }

  try {
    // kyc_verified fires before a deal ever reaches ESCROW, so it has no
    // trustin_deal_id to correlate against — it's looked up via its own
    // trustin_kyc_sessions row instead (see trustInKycService.js).
    if (eventType === 'kyc_verified') {
      const matched = await handleKycVerified(req.body);
      if (eventRow) await supabaseAdmin.from('webhook_events').update({ processed: true }).eq('id', eventRow.id);
      return res.status(200).json({ received: true, matched });
    }

    const { data: deal } = await supabaseAdmin.from('deals').select('*').eq('trustin_deal_id', trustinDealId).single();

    if (!deal) {
      logger.warn('TrustIn webhook for unknown deal', { trustinDealId, eventType });
      return res.status(200).json({ received: true, matched: false });
    }

    switch (eventType) {
      case 'funds_received':
        await handleFundsReceived(deal, amount);
        break;
      case 'loan_cleared':
        await handleLoanCleared(deal);
        break;
      case 'fines_cleared':
        await handleFinesCleared(deal);
        break;
      case 'transfer_complete':
        logger.info(`TrustIn transfer_complete for deal ${deal.ref}`, { payload });
        break;
      default:
        logger.warn('Unhandled TrustIn webhook event type', { eventType });
    }

    if (eventRow) await supabaseAdmin.from('webhook_events').update({ processed: true }).eq('id', eventRow.id);
    return res.status(200).json({ received: true, matched: true });
  } catch (err) {
    logger.error('Error processing TrustIn webhook', { error: err.message });
    // Always 200 to a webhook sender's retries are based on real delivery
    // failures, not our internal processing bugs — but we log fully server-side.
    return res.status(200).json({ received: true, error: 'processing_error' });
  }
}

async function handleFundsReceived(deal, amount) {
  // Validate transferred amount matches expected sale price (allow tiny rounding tolerance).
  const expected = Number(deal.sale_price || 0);
  const received = Number(amount || 0);
  const matches = Math.abs(expected - received) < 1;

  if (!matches) {
    logger.warn(`TrustIn funds_received amount mismatch for deal ${deal.ref}`, { expected, received });
    await supabaseAdmin.from('automation_log').insert({
      deal_id: deal.id,
      action: 'trustin_funds_mismatch',
      status: 'failed',
      payload: { expected, received },
    });
    return; // Do not proceed — requires manual admin review.
  }

  await supabaseAdmin
    .from('deals')
    .update({ funds_confirmed: true, funds_confirmed_at: new Date().toISOString() })
    .eq('id', deal.id);

  const { data: seller } = deal.seller_id ? await supabaseAdmin.from('users').select('*').eq('id', deal.seller_id).single() : { data: null };
  const { data: buyer } = deal.buyer_id ? await supabaseAdmin.from('users').select('*').eq('id', deal.buyer_id).single() : { data: null };

  await whatsApp.sendFundsConfirmed(deal, seller?.phone, buyer?.phone);

  // Instruct TrustIn to settle bank loan (LoanClear only) and RTA fines simultaneously.
  const tasks = [trustIn.payFines(deal)];
  if (deal.product === 'loanclear' && deal.loan_amount) tasks.push(trustIn.payBank(deal));
  await Promise.all(tasks);
}

async function handleLoanCleared(deal) {
  await supabaseAdmin.from('deals').update({ loan_cleared: true }).eq('id', deal.id);
  await maybeAdvanceToTasjeel({ ...deal, loan_cleared: true });
}

async function handleFinesCleared(deal) {
  await supabaseAdmin.from('deals').update({ fines_cleared: true }).eq('id', deal.id);
  await maybeAdvanceToTasjeel({ ...deal, fines_cleared: true });
}

// Handles TrustIn's 'kyc_verified' event — real shape: { event_type,
// session_id, full_name, emirates_id_number, nationality }. Mirrors what
// confirmKyc previously did manually (save identity to users, flip the
// deal's seller/buyer_kyc_complete flag), but now driven by TrustIn's own
// UAE Pass verification instead of a manually-uploaded Emirates ID photo.
async function handleKycVerified(body) {
  const { session_id: sessionId, full_name: fullName, emirates_id_number: emiratesId, nationality } = body;
  if (!sessionId) {
    logger.warn('TrustIn kyc_verified webhook missing session_id');
    return false;
  }

  const { data: session, error } = await supabaseAdmin.from('trustin_kyc_sessions').select('*').eq('id', sessionId).single();
  if (error || !session) {
    logger.warn('TrustIn kyc_verified webhook for unknown session', { sessionId });
    return false;
  }

  await supabaseAdmin
    .from('trustin_kyc_sessions')
    .update({ status: 'verified', full_name: fullName, emirates_id: emiratesId, nationality: nationality || null, verified_at: new Date().toISOString() })
    .eq('id', sessionId);

  const { data: deal } = await supabaseAdmin.from('deals').select('*').eq('id', session.deal_id).single();
  if (!deal) return false;

  const partyUserId = session.party === 'seller' ? deal.seller_id : deal.buyer_id;
  if (partyUserId && fullName && emiratesId) {
    const userUpdates = { full_name: fullName, emirates_id: emiratesId };
    if (nationality) userUpdates.nationality = nationality;
    await supabaseAdmin.from('users').update(userUpdates).eq('id', partyUserId);
  }

  const dealUpdates = session.party === 'seller' ? { seller_kyc_complete: true } : { buyer_kyc_complete: true };
  await supabaseAdmin.from('deals').update(dealUpdates).eq('id', deal.id);
  return true;
}

async function maybeAdvanceToTasjeel(deal) {
  // SafePay deals have no bank loan — only fines need clearing.
  const loanRequirementMet = deal.product === 'safepay' ? true : deal.loan_cleared;
  if (loanRequirementMet && deal.fines_cleared && deal.status === STAGES.ESCROW) {
    await dealFlowEngine.advanceStage(deal.id, STAGES.TASJEEL);
  }
}

module.exports = { handleTrustInWebhook };
