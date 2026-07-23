// Admin controller — dashboard stats, full deal listing, stuck-deal diagnosis,
// and manual override for the ops team.

const { supabaseAdmin } = require('../config/supabase');
const { STAGES } = require('../utils/dealStages');
const dealFlowEngine = require('../services/dealFlowEngine');
const feeCalculator = require('../services/feeCalculator');
const logger = require('../utils/logger');

// Boolean fields an admin may manually flip while TrustIn KYC / SignNow signing
// aren't yet live integrations, or a third-party automation (Claude Vision fines
// check, TrustIn escrow webhook) needs a manual unblock. Deliberately not exposed
// to sellers/buyers directly — this is the "manual override for edge cases"
// control from the admin dashboard spec.
const OVERRIDABLE_FIELDS = [
  'fines_verified',
  'seller_kyc_complete',
  'buyer_kyc_complete',
  'doc001_signed',
  'doc002_signed',
  'doc003_signed',
  'funds_confirmed',
  'loan_cleared',
  'fines_cleared',
];

// Vehicle/financial fields admin may manually correct — mirrors
// dealController.js's DETAILS_ALLOWED_FIELDS (what the seller submits at the
// Details stage). Exists as a safety net for when Claude Vision misreads the
// Mulkiya or bank settlement letter: admin can pull up the source photo
// (mulkiya_image_url/settlement_image_url, see 0007_deal_uploaded_images.sql)
// and type in the correct value instead, then the usual auto-advance check
// below moves the deal forward using the corrected data.
const ADMIN_DETAIL_FIELDS = [
  'vin',
  'plate',
  'make',
  'model',
  'year',
  'colour',
  'emirate',
  'mileage',
  'sale_price',
  'loan_amount',
  'loan_account',
  'loan_bank',
  'seller_iban',
  'seller_acc_name',
  'seller_proc_bank',
];

// Human-readable descriptions of every field the deal-flow state machine
// requires to leave a stage — used to tell admin exactly *why* a deal is stuck,
// not just that it is. Mirrors dealFlowEngine.REQUIRED_FIELDS_TO_LEAVE.
const FIELD_LABELS = {
  plate: 'Plate number missing',
  sale_price: 'Sale price missing',
  seller_id: 'Seller not attached to deal',
  fines_verified: 'Traffic fines not verified yet — seller must upload an RTA screenshot (Claude Vision extraction)',
  seller_kyc_complete: "Seller's identity verification not complete",
  buyer_kyc_complete: "Buyer's identity verification not complete",
  vin: 'VIN not entered (Vehicle & Financial Details stage)',
  seller_iban: "Seller's payout IBAN not entered",
  seller_acc_name: "Seller's payout account name not entered",
  doc001_signed: 'DOC-001 (Transaction & Escrow Agreement) not signed by all parties',
  doc002_signed: 'DOC-002 (Limited Power of Attorney) not signed',
  funds_confirmed: 'Escrow funds not yet confirmed received from buyer',
  loan_cleared: "Seller's outstanding bank loan not yet confirmed paid off by TrustIn",
  fines_cleared: 'Outstanding RTA traffic fines not yet confirmed paid by TrustIn',
  transfer_cert_url: 'Tasjeel transfer certificate not yet uploaded',
};

const STUCK_THRESHOLD_MS = 2 * 60 * 60 * 1000; // flag if unchanged >2hrs, per design spec

/** Returns [{ field, label }] describing exactly what's blocking `deal` from leaving its current stage. */
function diagnoseBlockers(deal) {
  const missing = dealFlowEngine.validateRequiredFields(deal, deal.status);
  return missing.map((field) => ({ field, label: FIELD_LABELS[field] || `${field} missing` }));
}

/** GET /api/admin/deals — all deals, most recent first, with a "stuck" flag. */
async function getAllDeals(req, res) {
  const { status, product } = req.query;

  let query = supabaseAdmin.from('deals').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (product) query = query.eq('product', product);

  const { data: deals, error } = await query;
  if (error) return res.status(500).json({ error: 'Could not load deals — please try again' });

  const now = Date.now();
  const enriched = deals.map((d) => {
    const stuck = ![STAGES.COMPLETE, STAGES.CANCELLED].includes(d.status) && now - new Date(d.updated_at).getTime() > STUCK_THRESHOLD_MS;
    return {
      ...d,
      stuck,
      // Only compute blockers for stuck deals — keeps the list endpoint cheap for the common case.
      blockedOn: stuck ? diagnoseBlockers(d) : [],
    };
  });

  return res.json({ deals: enriched });
}

/**
 * GET /api/admin/deals/:id — single deal enriched with exactly which required
 * fields are missing to leave its current stage (the "why is this stuck" view).
 */
async function getDealDetail(req, res) {
  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });

  const now = Date.now();
  const stuck = ![STAGES.COMPLETE, STAGES.CANCELLED].includes(deal.status) && now - new Date(deal.updated_at).getTime() > STUCK_THRESHOLD_MS;

  return res.json({ deal: { ...deal, stuck, blockedOn: diagnoseBlockers(deal) } });
}

/** GET /api/admin/stats — today's deals, active deals, revenue today/month. */
async function getStats(req, res) {
  const { data: deals, error } = await supabaseAdmin.from('deals').select('status, cd_fee, created_at, updated_at');
  if (error) return res.status(500).json({ error: 'Could not load stats — please try again' });

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const todaysDeals = deals.filter((d) => new Date(d.created_at) >= startOfToday);
  const activeDeals = deals.filter((d) => ![STAGES.COMPLETE, STAGES.CANCELLED].includes(d.status));
  const completedToday = deals.filter((d) => d.status === STAGES.COMPLETE && new Date(d.updated_at) >= startOfToday);
  const completedThisMonth = deals.filter(
    (d) => d.status === STAGES.COMPLETE && new Date(d.updated_at).getUTCMonth() === now.getUTCMonth() && new Date(d.updated_at).getUTCFullYear() === now.getUTCFullYear()
  );

  const revenueToday = completedToday.reduce((sum, d) => sum + Number(d.cd_fee || 0), 0);
  const revenueMonth = completedThisMonth.reduce((sum, d) => sum + Number(d.cd_fee || 0), 0);

  return res.json({
    stats: {
      todaysDeals: todaysDeals.length,
      activeDeals: activeDeals.length,
      revenueToday,
      revenueMonth,
    },
  });
}

/**
 * PUT /api/admin/deals/:id/override — manually flips KYC-complete / document-signed /
 * fines-verified / funds-confirmed flags for edge cases (e.g. TrustIn KYC, SignNow
 * signing, or Claude Vision fines extraction not yet integrated or currently failing,
 * or a signature/payment collected outside the platform). Only fields in
 * OVERRIDABLE_FIELDS are accepted as booleans; `finesAmount` (paired with
 * fines_verified) and `transferCertUrl` are accepted as accompanying values so a
 * fines-stuck or tasjeel-stuck deal can be fully unblocked in one call.
 * If a doc*_signed override completes the signing stage, the deal auto-advances to ESCROW.
 */
async function manualOverride(req, res) {
  const { data: deal, error: fetchErr } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (fetchErr || !deal) return res.status(404).json({ error: 'Deal not found' });

  const updates = {};
  for (const field of OVERRIDABLE_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = Boolean(req.body[field]);
  }
  for (const field of ADMIN_DETAIL_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  // Admin marking fines_verified=true can optionally supply the actual fines
  // figure (e.g. read off the RTA screenshot themselves) — recalculate fee/net
  // proceeds the same way the automated Claude Vision path does.
  if (updates.fines_verified === true && req.body.finesAmount !== undefined) {
    const finesAmount = Number(req.body.finesAmount) || 0;
    const cdFee = deal.product === 'loanclear' ? feeCalculator.calculateLoanClearFee(deal.loan_amount || 0) : feeCalculator.calculateSafePayFee(deal.sale_price);
    updates.fines_amount = finesAmount;
    updates.cd_fee = cdFee;
    updates.net_proceeds = feeCalculator.calculateNetProceeds({ salePrice: deal.sale_price, loanAmount: deal.loan_amount || 0, finesAmount, cdFee });
  }

  // If admin corrects sale_price or loan_amount (e.g. Claude Vision misread
  // the settlement letter), fee/net proceeds must be recalculated the same
  // way the seller's own PATCH /:id/details does.
  if (updates.sale_price !== undefined || updates.loan_amount !== undefined) {
    const salePrice = updates.sale_price ?? deal.sale_price;
    const loanAmount = updates.loan_amount !== undefined ? Number(updates.loan_amount) : deal.loan_amount || 0;
    const finesAmount = updates.fines_amount ?? deal.fines_amount ?? 0;
    const cdFee = deal.product === 'loanclear' ? feeCalculator.calculateLoanClearFee(loanAmount) : feeCalculator.calculateSafePayFee(salePrice);
    updates.cd_fee = cdFee;
    updates.net_proceeds = feeCalculator.calculateNetProceeds({ salePrice, loanAmount, finesAmount, cdFee });
  }

  // Tasjeel stage requires transfer_cert_url (a string, not a boolean) — admin
  // can paste the certificate link/reference to unblock COMPLETE.
  if (typeof req.body.transferCertUrl === 'string' && req.body.transferCertUrl.trim()) {
    updates.transfer_cert_url = req.body.transferCertUrl.trim();
  }

  if (Object.keys(updates).length === 0) {
    return res
      .status(400)
      .json({ error: `No valid fields provided. Allowed: ${OVERRIDABLE_FIELDS.join(', ')}, ${ADMIN_DETAIL_FIELDS.join(', ')}, finesAmount, transferCertUrl` });
  }

  const { data: updated, error } = await supabaseAdmin.from('deals').update(updates).eq('id', req.params.id).select().single();
  if (error || !updated) return res.status(404).json({ error: 'Deal not found' });

  logger.info(`Admin manual override on deal ${updated.ref}`, { updates, admin: req.appUser?.id });
  await supabaseAdmin.from('automation_log').insert({
    deal_id: updated.id,
    action: 'admin_manual_override',
    status: 'sent',
    payload: { updates, adminId: req.appUser?.id },
  });

  const afterCheck = await dealFlowEngine.checkAndAdvanceIfStageComplete(updated.id);
  return res.json({ deal: afterCheck || updated });
}

module.exports = { getAllDeals, getStats, getDealDetail, manualOverride };
