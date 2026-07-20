// WhatsApp Business API service — MOCK implementation.
//
// Real WhatsApp Business API approval is pending. Every message is logged to
// the console AND persisted to automation_log so behaviour is fully auditable
// during testing. Swapping to the real Meta Cloud API later means: set
// WHATSAPP_MOCK_MODE=false and provide WHATSAPP_API_KEY / WHATSAPP_PHONE_NUMBER_ID —
// only sendRaw() below needs to change its implementation.

const axios = require('axios');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../config/supabase');

const MOCK_MODE = process.env.WHATSAPP_MOCK_MODE !== 'false';
const API_KEY = process.env.WHATSAPP_API_KEY;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TIMEOUT_MS = 15000;

/**
 * Sends a raw WhatsApp text message. In mock mode, logs to console + DB only.
 * @param {string} to - phone number in +971XXXXXXXXX format
 * @param {string} message
 * @param {string} templateName - identifier used in automation_log.action
 * @param {string|null} dealId
 */
async function sendRaw(to, message, templateName, dealId = null) {
  if (!to) {
    logger.warn('WhatsApp send skipped — no recipient phone number', { templateName, dealId });
    await logAction(dealId, templateName, 'skipped', { reason: 'no phone number', message });
    return { success: false, reason: 'no phone number' };
  }

  if (MOCK_MODE) {
    logger.mock('WhatsApp', `-> ${to} [${templateName}]`, { message });
    await logAction(dealId, templateName, 'sent', { to, message });
    return { success: true, mock: true };
  }

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: 'whatsapp', to: to.replace('+', ''), type: 'text', text: { body: message } },
      { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: TIMEOUT_MS }
    );
    await logAction(dealId, templateName, 'sent', { to, message });
    return { success: true };
  } catch (err) {
    logger.error('WhatsApp send failed', { error: err.message, to, templateName });
    await logAction(dealId, templateName, 'failed', { to, message, error: err.message });
    return { success: false, reason: err.message };
  }
}

async function logAction(dealId, action, status, payload) {
  await supabaseAdmin.from('automation_log').insert({ deal_id: dealId, action: `whatsapp_${action}`, status, payload });
}

// ---------- Message templates (per brief) ----------

const templates = {
  quoteConfirmation: (deal) =>
    `ClearDrive: Your ${deal.product === 'loanclear' ? 'LoanClear' : 'SafePay'} quote is ready — Deal ${deal.ref}. ` +
    `Estimated net proceeds: AED ${Number(deal.net_proceeds || 0).toLocaleString()}. Open the app to continue.`,

  kycLinkSeller: (deal, link) => `ClearDrive: Deal ${deal.ref} — please complete your identity verification (UAE Pass): ${link}`,

  kycLinkBuyer: (deal, link) => `ClearDrive: You've been added as the buyer on Deal ${deal.ref}. Please verify your identity (UAE Pass): ${link}`,

  signingLinkSeller: (deal, link) => `ClearDrive: Deal ${deal.ref} — your documents are ready to sign: ${link}`,

  signingLinkBuyer: (deal, link) => `ClearDrive: Deal ${deal.ref} — please review and sign your document: ${link}`,

  escrowPaymentInstruction: (deal) =>
    `ClearDrive: Deal ${deal.ref} — please transfer AED ${Number(deal.sale_price || 0).toLocaleString()} to escrow IBAN ` +
    `${deal.trustin_escrow_iban} with reference "${deal.ref}" within 24 hours.`,

  fundsConfirmed: (deal) => `ClearDrive: Deal ${deal.ref} — funds received and confirmed in escrow. Processing loan/fines settlement now.`,

  tasjeelReminder: (deal) => `ClearDrive: Deal ${deal.ref} — loan and fines cleared. Please attend RTA Tasjeel within 48 hours to complete transfer.`,

  completionNotice: (deal) => `ClearDrive: Deal ${deal.ref} is complete! Thank you for using ClearDrive.`,

  referralFeePaid: (deal, partner) =>
    `ClearDrive: Referral fee of AED ${Number(deal.referral_fee || 0).toLocaleString()} for Deal ${deal.ref} has been paid to ${partner.name}.`,

  chase: (deal, whatFor) => `ClearDrive: Reminder — Deal ${deal.ref} is waiting on ${whatFor}. Please complete this to keep your deal moving.`,
};

// ---------- Convenience senders (bind template + recipient) ----------

async function sendQuoteConfirmation(deal, sellerPhone) {
  return sendRaw(sellerPhone, templates.quoteConfirmation(deal), 'quote_confirmation', deal.id);
}

async function sendKycLink(deal, phone, party, link) {
  const msg = party === 'seller' ? templates.kycLinkSeller(deal, link) : templates.kycLinkBuyer(deal, link);
  return sendRaw(phone, msg, `kyc_link_${party}`, deal.id);
}

async function sendSigningLink(deal, phone, party, link) {
  const msg = party === 'seller' ? templates.signingLinkSeller(deal, link) : templates.signingLinkBuyer(deal, link);
  return sendRaw(phone, msg, `signing_link_${party}`, deal.id);
}

async function sendEscrowPaymentInstruction(deal, buyerPhone) {
  return sendRaw(buyerPhone, templates.escrowPaymentInstruction(deal), 'escrow_payment_instruction', deal.id);
}

async function sendFundsConfirmed(deal, sellerPhone, buyerPhone) {
  const msg = templates.fundsConfirmed(deal);
  await sendRaw(sellerPhone, msg, 'funds_confirmed', deal.id);
  await sendRaw(buyerPhone, msg, 'funds_confirmed', deal.id);
}

async function sendTasjeelReminder(deal, sellerPhone, buyerPhone) {
  const msg = templates.tasjeelReminder(deal);
  await sendRaw(sellerPhone, msg, 'tasjeel_reminder', deal.id);
  await sendRaw(buyerPhone, msg, 'tasjeel_reminder', deal.id);
}

async function sendCompletionNotice(deal, sellerPhone, buyerPhone) {
  const msg = templates.completionNotice(deal);
  await sendRaw(sellerPhone, msg, 'completion_notice', deal.id);
  await sendRaw(buyerPhone, msg, 'completion_notice', deal.id);
}

async function sendReferralFeePaid(deal, partner) {
  return sendRaw(partner.phone, templates.referralFeePaid(deal, partner), 'referral_fee_paid', deal.id);
}

async function sendChase(deal, phone, whatFor) {
  return sendRaw(phone, templates.chase(deal, whatFor), `chase_${whatFor.replace(/\s+/g, '_')}`, deal.id);
}

module.exports = {
  sendRaw,
  templates,
  sendQuoteConfirmation,
  sendKycLink,
  sendSigningLink,
  sendEscrowPaymentInstruction,
  sendFundsConfirmed,
  sendTasjeelReminder,
  sendCompletionNotice,
  sendReferralFeePaid,
  sendChase,
  MOCK_MODE,
};
