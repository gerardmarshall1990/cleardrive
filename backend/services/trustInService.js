// TrustIn (Escrow Partner) service — MOCK implementation.
//
// TrustIn credentials are not yet issued. This module is structured to mirror
// the exact real API surface described in the brief (create deal, check status,
// release funds, pay bank, pay fines) so that swapping to the live API later is
// a ONE-LINE change: set TRUSTIN_MOCK_MODE=false and provide TRUSTIN_API_KEY /
// TRUSTIN_BASE_URL in .env. All mock calls are clearly logged and persisted to
// automation_log so they're auditable exactly like real calls would be.

const axios = require('axios');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../config/supabase');

const MOCK_MODE = process.env.TRUSTIN_MOCK_MODE !== 'false';
const BASE_URL = process.env.TRUSTIN_BASE_URL;
const API_KEY = process.env.TRUSTIN_API_KEY;
const TIMEOUT_MS = 15000;

async function logMockCall(dealId, action, payload) {
  logger.mock('TrustIn', `${action}`, payload);
  await supabaseAdmin.from('automation_log').insert({
    deal_id: dealId,
    action: `trustin_${action}`,
    status: 'sent',
    payload: { mock: true, ...payload },
  });
}

async function withRetry(fn, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
    }
  }
  throw lastErr;
}

function mockIban() {
  const digits = Math.floor(1e17 + Math.random() * 8.9e17);
  return `AE${digits}`.slice(0, 23);
}

/**
 * Creates an escrow deal with TrustIn. Returns a unique escrow IBAN for the deal.
 * @param {object} deal - deal row
 * @returns {Promise<{trustinDealId:string, escrowIban:string, status:string}>}
 */
async function createDeal(deal) {
  if (MOCK_MODE) {
    const trustinDealId = `TRUSTIN-MOCK-${deal.ref}`;
    const escrowIban = mockIban();
    await logMockCall(deal.id, 'create_deal', { trustinDealId, escrowIban, amount: deal.sale_price });
    return { trustinDealId, escrowIban, status: 'awaiting_funds' };
  }

  const response = await withRetry(() =>
    axios.post(
      `${BASE_URL}/deals`,
      { reference: deal.ref, amount: deal.sale_price, currency: 'AED' },
      { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: TIMEOUT_MS }
    )
  );
  return { trustinDealId: response.data.id, escrowIban: response.data.escrow_iban, status: response.data.status };
}

/**
 * Checks the current status of a TrustIn escrow deal.
 * @param {string} trustinDealId
 */
async function checkDealStatus(trustinDealId) {
  if (MOCK_MODE) {
    logger.mock('TrustIn', 'check_deal_status', { trustinDealId });
    return { status: 'awaiting_funds', fundsReceived: false };
  }

  const response = await withRetry(() =>
    axios.get(`${BASE_URL}/deals/${trustinDealId}/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      timeout: TIMEOUT_MS,
    })
  );
  return response.data;
}

/**
 * Instructs TrustIn to release net proceeds to the seller's IBAN.
 * @param {object} deal
 */
async function releaseFunds(deal) {
  if (MOCK_MODE) {
    await logMockCall(deal.id, 'release_funds', {
      trustinDealId: deal.trustin_deal_id,
      to: deal.seller_iban,
      amount: deal.net_proceeds,
    });
    return { success: true, transactionId: `TRUSTIN-MOCK-RELEASE-${deal.ref}` };
  }

  const response = await withRetry(() =>
    axios.post(
      `${BASE_URL}/deals/${deal.trustin_deal_id}/release`,
      { to_iban: deal.seller_iban, amount: deal.net_proceeds },
      { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: TIMEOUT_MS }
    )
  );
  return response.data;
}

/**
 * Instructs TrustIn to pay off the seller's outstanding loan balance directly to the bank.
 * @param {object} deal
 */
async function payBank(deal) {
  if (MOCK_MODE) {
    await logMockCall(deal.id, 'pay_bank', {
      trustinDealId: deal.trustin_deal_id,
      bank: deal.loan_bank,
      amount: deal.loan_amount,
    });
    return { success: true, transactionId: `TRUSTIN-MOCK-PAYBANK-${deal.ref}` };
  }

  const response = await withRetry(() =>
    axios.post(
      `${BASE_URL}/deals/${deal.trustin_deal_id}/pay-bank`,
      { bank: deal.loan_bank, account: deal.loan_account, amount: deal.loan_amount },
      { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: TIMEOUT_MS }
    )
  );
  return response.data;
}

/**
 * Instructs TrustIn to pay outstanding RTA traffic fines directly.
 * @param {object} deal
 */
async function payFines(deal) {
  if (MOCK_MODE) {
    await logMockCall(deal.id, 'pay_fines', {
      trustinDealId: deal.trustin_deal_id,
      plate: deal.plate,
      amount: deal.fines_amount,
    });
    return { success: true, transactionId: `TRUSTIN-MOCK-PAYFINES-${deal.ref}` };
  }

  const response = await withRetry(() =>
    axios.post(
      `${BASE_URL}/deals/${deal.trustin_deal_id}/pay-fines`,
      { plate: deal.plate, amount: deal.fines_amount },
      { headers: { Authorization: `Bearer ${API_KEY}` }, timeout: TIMEOUT_MS }
    )
  );
  return response.data;
}

module.exports = { createDeal, checkDealStatus, releaseFunds, payBank, payFines, MOCK_MODE };
