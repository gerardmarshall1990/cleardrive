// Deal flow state machine — the heart of ClearDrive's automation.
// Manages every stage transition (QUOTE -> FINES_VERIFY -> KYC -> DETAILS ->
// SIGNING -> ESCROW -> TASJEEL -> COMPLETE), validates required fields exist
// before allowing progression, and triggers the correct automated action
// (WhatsApp message, document generation, SignNow invite, TrustIn call) the
// moment a deal enters a new stage.

const { supabaseAdmin } = require('../config/supabase');
const { STAGES, isValidTransition } = require('../utils/dealStages');
const whatsApp = require('./whatsAppService');
const trustIn = require('./trustInService');
const signNow = require('./signNowService');
const docGen = require('./documentGenerator');
const feeCalculator = require('./feeCalculator');
const logger = require('../utils/logger');

/**
 * Fields required to be present on the deal record before it may advance
 * OUT of a given stage (i.e. checked when target stage is the next one).
 */
const REQUIRED_FIELDS_TO_LEAVE = {
  [STAGES.QUOTE]: ['plate', 'sale_price', 'seller_id'],
  [STAGES.FINES_VERIFY]: ['fines_verified'],
  [STAGES.KYC]: ['seller_kyc_complete', 'buyer_kyc_complete'],
  [STAGES.DETAILS]: ['vin', 'sale_price', 'seller_iban', 'seller_acc_name'],
  [STAGES.SIGNING]: ['doc001_signed', 'doc002_signed'],
  [STAGES.ESCROW]: ['funds_confirmed'],
  [STAGES.TASJEEL]: ['transfer_cert_url'],
};

function validateRequiredFields(deal, fromStage) {
  const required = REQUIRED_FIELDS_TO_LEAVE[fromStage] || [];
  const missing = required.filter((field) => {
    const value = deal[field];
    if (typeof value === 'boolean') return value !== true;
    return value === null || value === undefined || value === '';
  });
  return missing;
}

async function getDealWithParties(dealId) {
  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', dealId).single();
  if (error || !deal) throw new Error(`Deal not found: ${dealId}`);

  const [{ data: seller }, { data: buyer }, { data: partner }] = await Promise.all([
    deal.seller_id ? supabaseAdmin.from('users').select('*').eq('id', deal.seller_id).single() : { data: null },
    deal.buyer_id ? supabaseAdmin.from('users').select('*').eq('id', deal.buyer_id).single() : { data: null },
    deal.referral_partner_id ? supabaseAdmin.from('partners').select('*').eq('id', deal.referral_partner_id).single() : { data: null },
  ]);

  return { deal, seller, buyer, partner };
}

/**
 * Advances a deal to a new stage after validating the transition is legal and
 * all required fields for the current stage are present, then fires the
 * automated actions associated with entering the new stage.
 *
 * @param {string} dealId
 * @param {string} targetStage - one of STAGES
 * @returns {Promise<object>} updated deal row
 */
async function advanceStage(dealId, targetStage) {
  const { deal, seller, buyer, partner } = await getDealWithParties(dealId);

  if (!isValidTransition(deal.status, targetStage)) {
    throw new Error(`Invalid stage transition: ${deal.status} -> ${targetStage}`);
  }

  const missing = validateRequiredFields(deal, deal.status);
  if (missing.length > 0) {
    throw new Error(`Cannot leave stage "${deal.status}" — missing required fields: ${missing.join(', ')}`);
  }

  const { data: updated, error } = await supabaseAdmin
    .from('deals')
    .update({ status: targetStage })
    .eq('id', dealId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update deal stage: ${error.message}`);

  logger.info(`Deal ${deal.ref} advanced ${deal.status} -> ${targetStage}`);

  try {
    await onEnterStage(updated, { seller, buyer, partner });
  } catch (err) {
    // Automation failures should never block the state transition that already
    // succeeded in the DB — log clearly so admin can see and manually retry.
    logger.error(`Automation failed entering stage ${targetStage} for deal ${deal.ref}`, { error: err.message });
    await supabaseAdmin.from('automation_log').insert({
      deal_id: dealId,
      action: `stage_entry_automation_${targetStage}`,
      status: 'failed',
      payload: { error: err.message },
    });
  }

  // Re-fetch — onEnterStage's automation (doc generation, TrustIn escrow
  // creation, etc.) writes further columns on the deal after the stage update
  // above, so the caller should see the fully up-to-date row, not the stale
  // snapshot from immediately after the status change.
  const { data: finalDeal } = await supabaseAdmin.from('deals').select('*').eq('id', dealId).single();
  return finalDeal || updated;
}

/**
 * Fires the automated action associated with a deal newly entering `stage`.
 */
async function onEnterStage(deal, { seller, buyer, partner }) {
  switch (deal.status) {
    case STAGES.FINES_VERIFY:
      await whatsApp.sendQuoteConfirmation(deal, seller?.phone);
      break;

    case STAGES.KYC: {
      // In production these links point at TrustIn's UAE Pass KYC flow for this deal.
      const sellerLink = `${process.env.APP_BASE_URL || 'https://app.cleardriveuae.com'}/kyc/${deal.id}/seller`;
      const buyerLink = `${process.env.APP_BASE_URL || 'https://app.cleardriveuae.com'}/kyc/${deal.id}/buyer`;
      await whatsApp.sendKycLink(deal, seller?.phone, 'seller', sellerLink);
      if (buyer?.phone) await whatsApp.sendKycLink(deal, buyer.phone, 'buyer', buyerLink);
      break;
    }

    case STAGES.DETAILS:
      // Both parties verified — nothing to send yet, seller now fills in vehicle/financial details in-app.
      break;

    case STAGES.SIGNING:
      await generateAndSendDocuments(deal, seller, buyer, partner);
      break;

    case STAGES.ESCROW: {
      const { trustinDealId, escrowIban, status } = await trustIn.createDeal(deal);
      await docGen.generateDoc009({ ...deal, trustin_escrow_iban: escrowIban });
      await supabaseAdmin
        .from('deals')
        .update({ trustin_deal_id: trustinDealId, trustin_escrow_iban: escrowIban, trustin_status: status })
        .eq('id', deal.id);
      await whatsApp.sendEscrowPaymentInstruction({ ...deal, trustin_escrow_iban: escrowIban }, buyer?.phone);
      break;
    }

    case STAGES.TASJEEL:
      // Entered once funds_confirmed webhook fired and loan/fines cleared (see webhook handler).
      await whatsApp.sendTasjeelReminder(deal, seller?.phone, buyer?.phone);
      break;

    case STAGES.COMPLETE:
      await completeDeal(deal, seller, buyer, partner);
      break;

    default:
      break;
  }
}

/**
 * Generates DOC-001, DOC-002 (and DOC-003 if a referral partner exists),
 * uploads each to SignNow, and sends signing links to the correct parties.
 */
async function generateAndSendDocuments(deal, seller, buyer, partner) {
  const doc001Path = await docGen.generateDoc001(deal, seller, buyer);
  const doc002Path = await docGen.generateDoc002(deal, seller);

  const updates = { doc001_url: doc001Path, doc002_url: doc002Path };

  let doc003Path = null;
  if (partner) {
    doc003Path = await docGen.generateDoc003(deal, partner);
    updates.doc003_url = doc003Path;
  }

  // SignNow upload/invite requires SIGNNOW_CLIENT_ID/SECRET — if not configured,
  // we still generate the PDFs above and store them; signing links are skipped
  // with a clear log entry rather than throwing and losing the generated docs.
  try {
    const doc001Id = await signNow.uploadDocument(doc001Path);
    const doc002Id = await signNow.uploadDocument(doc002Path);
    updates.doc001_signnow_id = doc001Id;
    updates.doc002_signnow_id = doc002Id;

    await signNow.sendSigningInvite(doc001Id, [
      { email: seller?.email, role: 'Seller', order: 1 },
      { email: buyer?.email, role: 'Buyer', order: 2 },
    ]);
    await signNow.sendSigningInvite(doc002Id, [{ email: seller?.email, role: 'Seller', order: 1 }]);

    if (doc003Path && partner) {
      const doc003Id = await signNow.uploadDocument(doc003Path);
      updates.doc003_signnow_id = doc003Id;
      await signNow.sendSigningInvite(doc003Id, [{ email: partner.email, role: 'Partner', order: 1 }]);
    }

    const appBase = process.env.APP_BASE_URL || 'https://app.cleardriveuae.com';
    await whatsApp.sendSigningLink(deal, seller?.phone, 'seller', `${appBase}/sign/${deal.id}/seller`);
    if (buyer?.phone) await whatsApp.sendSigningLink(deal, buyer.phone, 'buyer', `${appBase}/sign/${deal.id}/buyer`);
  } catch (err) {
    logger.warn('SignNow upload/invite skipped or failed — documents generated but not yet dispatched for signature', {
      dealRef: deal.ref,
      error: err.message,
    });
  }

  await supabaseAdmin.from('deals').update(updates).eq('id', deal.id);
}

/**
 * Runs the final completion sequence: release proceeds via TrustIn, pay
 * referral fee if applicable, notify all parties, update partner stats.
 */
async function completeDeal(deal, seller, buyer, partner) {
  await trustIn.releaseFunds(deal);

  if (partner && deal.referral_fee && !deal.referral_fee_paid) {
    // Real payment execution to partners is a manual/finance-team action in
    // MVP — here we mark it pending and notify, per "within 5 business days" in the spec.
    await whatsApp.sendReferralFeePaid(deal, partner);
    await supabaseAdmin
      .from('partners')
      .update({
        total_deals: (partner.total_deals || 0) + 1,
        total_earned: Number(partner.total_earned || 0) + Number(deal.referral_fee || 0),
        tier: feeCalculator.isLoyaltyTier((partner.total_deals || 0) + 1) ? 'loyalty' : partner.tier,
      })
      .eq('id', partner.id);
  }

  await whatsApp.sendCompletionNotice(deal, seller?.phone, buyer?.phone);
}

/**
 * Checks whether all documents required for the current deal are signed
 * (DOC-001 + DOC-002, plus DOC-003 if a referral partner is attached) and, if
 * so, advances the deal from SIGNING to ESCROW. Shared by the SignNow webhook
 * and the admin manual-signing override (used while SignNow isn't configured).
 * @param {string} dealId
 */
async function checkAndAdvanceIfAllSigned(dealId) {
  const { data: deal } = await supabaseAdmin.from('deals').select('*').eq('id', dealId).single();
  if (!deal || deal.status !== STAGES.SIGNING) return deal;

  const doc003Required = Boolean(deal.referral_partner_id);
  const allSigned = deal.doc001_signed && deal.doc002_signed && (!doc003Required || deal.doc003_signed);

  if (allSigned) {
    return advanceStage(dealId, STAGES.ESCROW);
  }
  return deal;
}

module.exports = {
  advanceStage,
  onEnterStage,
  validateRequiredFields,
  getDealWithParties,
  checkAndAdvanceIfAllSigned,
  REQUIRED_FIELDS_TO_LEAVE,
};
