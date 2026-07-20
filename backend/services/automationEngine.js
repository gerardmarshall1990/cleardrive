// Automation engine — the "chase scheduler". Runs every 30 minutes, finds all
// active deals with a pending action that has been outstanding for more than
// 2 hours, and sends a WhatsApp chase message to whoever needs to act next.
// Every run is logged to automation_log for full auditability.

const cron = require('node-cron');
const { supabaseAdmin } = require('../config/supabase');
const { STAGES } = require('../utils/dealStages');
const whatsApp = require('./whatsAppService');
const logger = require('../utils/logger');

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ACTIVE_STATUSES = [STAGES.FINES_VERIFY, STAGES.KYC, STAGES.SIGNING, STAGES.ESCROW, STAGES.TASJEEL];

/**
 * Determines who still needs to act on a deal at its current stage, and what
 * they need to do. Returns an array of { phone, whatFor } — empty if nothing
 * is pending (e.g. deal is progressing normally / waiting on ClearDrive/TrustIn, not the user).
 */
function pendingActionsFor(deal, seller, buyer) {
  const pending = [];

  switch (deal.status) {
    case STAGES.FINES_VERIFY:
      if (!deal.fines_verified) pending.push({ phone: seller?.phone, whatFor: 'uploading your RTA fines screenshot' });
      break;

    case STAGES.KYC:
      if (!deal.seller_kyc_complete) pending.push({ phone: seller?.phone, whatFor: 'completing your identity verification' });
      if (!deal.buyer_kyc_complete) pending.push({ phone: buyer?.phone, whatFor: 'completing your identity verification' });
      break;

    case STAGES.SIGNING:
      if (!deal.doc001_signed || !deal.doc002_signed) {
        pending.push({ phone: seller?.phone, whatFor: 'signing your documents' });
      }
      if (!deal.doc001_signed) {
        pending.push({ phone: buyer?.phone, whatFor: 'signing your document' });
      }
      break;

    case STAGES.ESCROW:
      if (!deal.funds_confirmed) pending.push({ phone: buyer?.phone, whatFor: 'transferring funds to the escrow account' });
      break;

    case STAGES.TASJEEL:
      if (!deal.transfer_cert_url) {
        pending.push({ phone: seller?.phone, whatFor: 'attending Tasjeel and uploading the transfer certificate' });
      }
      break;

    default:
      break;
  }

  return pending.filter((p) => p.phone);
}

/**
 * Checks whether a chase for this exact reason was already sent within the
 * last 2 hours, to avoid spamming the user every 30-minute tick.
 */
async function wasChasedRecently(dealId, whatFor) {
  const action = `whatsapp_chase_${whatFor.replace(/\s+/g, '_')}`;
  const { data } = await supabaseAdmin
    .from('automation_log')
    .select('created_at')
    .eq('deal_id', dealId)
    .eq('action', action)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return false;
  return Date.now() - new Date(data[0].created_at).getTime() < TWO_HOURS_MS;
}

/**
 * Single pass over all active deals — sends chase messages where due.
 * Exported separately from the cron scheduler so it can be triggered manually
 * (e.g. from an admin "run automation now" button) or in tests.
 */
async function runChaseSweep() {
  const { data: deals, error } = await supabaseAdmin.from('deals').select('*').in('status', ACTIVE_STATUSES);

  if (error) {
    logger.error('Chase sweep failed to load deals', { error: error.message });
    return;
  }

  const now = Date.now();
  let chasesSent = 0;

  for (const deal of deals) {
    const stageAgeMs = now - new Date(deal.updated_at).getTime();
    if (stageAgeMs < TWO_HOURS_MS) continue; // not stuck long enough yet

    const [{ data: seller }, { data: buyer }] = await Promise.all([
      deal.seller_id ? supabaseAdmin.from('users').select('*').eq('id', deal.seller_id).single() : { data: null },
      deal.buyer_id ? supabaseAdmin.from('users').select('*').eq('id', deal.buyer_id).single() : { data: null },
    ]);

    const pending = pendingActionsFor(deal, seller, buyer);

    for (const action of pending) {
      if (await wasChasedRecently(deal.id, action.whatFor)) continue;
      await whatsApp.sendChase(deal, action.phone, action.whatFor);
      chasesSent += 1;
    }
  }

  logger.info(`Chase sweep complete — ${chasesSent} chase message(s) sent across ${deals.length} active deal(s)`);
}

/**
 * Starts the recurring node-cron job (every 30 minutes) that drives the
 * chase scheduler. Call once at server startup.
 */
function startAutomationEngine() {
  cron.schedule('*/30 * * * *', () => {
    runChaseSweep().catch((err) => logger.error('Unhandled error in chase sweep', { error: err.message }));
  });
  logger.info('Automation engine started — chase scheduler runs every 30 minutes');
}

module.exports = { startAutomationEngine, runChaseSweep, pendingActionsFor };
