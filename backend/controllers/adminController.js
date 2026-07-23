// Admin controller — dashboard stats, full deal listing, stuck-deal diagnosis,
// and manual override for the ops team.

const { supabaseAdmin } = require('../config/supabase');
const { STAGES, stageIndex } = require('../utils/dealStages');
const dealFlowEngine = require('../services/dealFlowEngine');
const feeCalculator = require('../services/feeCalculator');
const docGen = require('../services/documentGenerator');
const signNow = require('../services/signNowService');
const logger = require('../utils/logger');
const { APP_BASE_URL } = require('../config/appBaseUrl');

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
  // Mirror fines_verified's override lever for the other three Claude Vision
  // upload checks (see 0010_verified_flags.sql) — none of these had any admin
  // unblock before, so a legitimate edge case (genuinely faded Mulkiya, a
  // bank statement with a valid-but-differently-formatted name) had no remedy.
  'mulkiya_verified',
  'mulkiya_back_verified',
  'settlement_verified',
  'bank_proof_verified',
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

// Identity fields on the `users` table an admin may correct for a deal's
// seller/buyer — e.g. a KYC-time misread name, or a typo'd phone/email that
// then breaks WhatsApp/SignNow delivery. `full_name`/`emirates_id`/`phone`
// print verbatim on DOC-001 for either party; `nationality` additionally
// prints on DOC-002 but only for the seller (see documentGenerator.js).
// `email` prints on neither doc — it only feeds the SignNow invite address.
const USER_IDENTITY_FIELDS = ['full_name', 'emirates_id', 'nationality', 'phone', 'email'];
const IDENTITY_FIELDS_ON_DOC001 = ['full_name', 'emirates_id', 'phone'];
const IDENTITY_FIELDS_ON_DOC002_SELLER_ONLY = ['full_name', 'emirates_id', 'nationality', 'phone'];

// When force-stage moves a deal BACKWARD, the flags/values that gate leaving
// the target stage (see dealFlowEngine.REQUIRED_FIELDS_TO_LEAVE) must be reset
// too — otherwise the deal's `status` moves back but the flags stay true, so
// the very next automatic advance-check (triggered by literally any other
// admin override, a SignNow webhook, etc.) instantly fast-forwards the deal
// right back past the stage the admin just sent it to, without the buyer/
// seller actually doing anything. The buyer/seller app renders purely off
// `deal.status` (see DealDetail.jsx's switch statement) — it has no idea a
// flag was quietly flipped, so without this reset "force stage back to KYC"
// looked like it did nothing at all.
// QUOTE/DETAILS are deliberately excluded — their "required fields" are real
// data (plate, VIN, sale price, IBAN...), not verification flags, and wiping
// them would destroy correct data rather than just asking for re-verification.
const STAGE_RESET_FIELDS = {
  [STAGES.FINES_VERIFY]: { fines_verified: false },
  [STAGES.KYC]: { seller_kyc_complete: false, buyer_kyc_complete: false },
  [STAGES.SIGNING]: { doc001_signed: false, doc001_signnow_id: null, doc002_signed: false, doc002_signnow_id: null, doc003_signed: false, doc003_signnow_id: null },
  [STAGES.ESCROW]: { funds_confirmed: false, loan_cleared: false, fines_cleared: false },
  [STAGES.TASJEEL]: { transfer_cert_url: null },
};

// Mirrors the referral_source column comment in 0001_init.sql. A seller often
// only mentions/remembers the dealer or broker who referred them after the
// deal has already started (or the wrong one was entered) — admin needs to be
// able to attach/correct/remove this mid-deal, not just at creation time.
const REFERRAL_SOURCES = ['dealer', 'broker', 'dubizzle', 'facebook', 'direct'];

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
  make: 'Vehicle make not entered',
  model: 'Vehicle model not entered',
  year: 'Vehicle year not entered',
  colour: 'Vehicle colour not entered',
  mileage: "Mileage not entered — this can't be read from the Mulkiya, seller must type it in manually",
  emirate: 'Emirate not selected',
  loan_amount: 'Loan settlement amount not entered (from bank settlement letter)',
  loan_account: 'Loan reference number not entered',
  loan_bank: 'Loan bank not entered',
  seller_iban: "Seller's payout IBAN not entered",
  seller_acc_name: "Seller's payout account name not entered",
  seller_proc_bank: "Seller's payout bank not entered",
  doc001_signed: 'DOC-001 (Transaction & Escrow Agreement) not signed by all parties',
  doc002_signed: 'DOC-002 (Limited Power of Attorney) not signed',
  funds_confirmed: 'Escrow funds not yet confirmed received from buyer',
  loan_cleared: "Seller's outstanding bank loan not yet confirmed paid off by TrustIn",
  fines_cleared: 'Outstanding RTA traffic fines not yet confirmed paid by TrustIn',
  transfer_cert_url: 'Tasjeel transfer certificate not yet uploaded',
};

// Which ADMIN_DETAIL_FIELDS are actually printed on each generated document —
// mirrors the field lists documentGenerator.js reads for each doc. Used so a
// correction only regenerates the document(s) it actually affects, instead of
// blindly regenerating everything on any edit.
const DOC001_FIELDS = ['vin', 'plate', 'make', 'model', 'year', 'colour', 'emirate', 'mileage', 'sale_price', 'loan_amount', 'loan_bank'];
const DOC002_FIELDS = ['plate', 'vin', 'make', 'model', 'year', 'loan_bank'];
// DOC-009 (Buyer Payment Instruction) is intentionally out of scope here — it
// has no doc009_url column (never persisted anywhere, generated-and-returned
// only from POST /generate-docs) and isn't surfaced in any UI today, so there's
// nothing to reset/re-link. Fixing that persistence gap is a separate, unrelated task.

/**
 * After an admin corrects a vehicle/financial field, regenerates any generated
 * document(s) that print that field, resets their signed status so both
 * parties are prompted to re-sign the corrected version, and (best-effort)
 * re-uploads to SignNow and re-sends the signing invite. This is the mechanism
 * that closes the "mistake found after doc generated -> deal stuck, must start
 * over" gap: instead, the deal keeps moving, just with a corrected document
 * that needs a fresh signature.
 *
 * Never blocks or throws past the caller — a SignNow failure here still
 * leaves the corrected PDF generated and saved; only the re-invite step is
 * best-effort (mirrors generateAndSendDocuments's own try/catch).
 *
 * @returns {Promise<{regenerated: string[], warning: string|null}>}
 */
async function regenerateAffectedDocuments(deal, changedFields, adminId, force = {}) {
  const regenerated = [];
  const docUpdates = {};

  const needsDoc001 = deal.doc001_url && (force.doc001 || changedFields.some((f) => DOC001_FIELDS.includes(f)));
  const needsDoc002 = deal.doc002_url && (force.doc002 || changedFields.some((f) => DOC002_FIELDS.includes(f)));

  if (!needsDoc001 && !needsDoc002) return { regenerated, warning: null };

  const [{ data: seller }, { data: buyer }] = await Promise.all([
    deal.seller_id ? supabaseAdmin.from('users').select('*').eq('id', deal.seller_id).single() : { data: null },
    deal.buyer_id ? supabaseAdmin.from('users').select('*').eq('id', deal.buyer_id).single() : { data: null },
  ]);

  if (needsDoc001) {
    const doc001 = await docGen.generateDoc001(deal, seller, buyer);
    docUpdates.doc001_url = doc001.url;
    docUpdates.doc001_signed = false;
    docUpdates.doc001_signnow_id = null;
    regenerated.push('DOC-001 (Transaction & Escrow Agreement)');
    try {
      const doc001Id = await signNow.uploadDocument(doc001.filePath);
      docUpdates.doc001_signnow_id = doc001Id;
      await signNow.sendSigningInvite(doc001Id, [
        { email: seller?.email, role: 'Seller', order: 1 },
        { email: buyer?.email, role: 'Buyer', order: 2 },
      ]);
    } catch (err) {
      logger.warn('SignNow re-upload/invite skipped or failed for regenerated DOC-001', { dealRef: deal.ref, error: err.message });
    }
  }

  if (needsDoc002) {
    const doc002 = await docGen.generateDoc002(deal, seller);
    docUpdates.doc002_url = doc002.url;
    docUpdates.doc002_signed = false;
    docUpdates.doc002_signnow_id = null;
    regenerated.push('DOC-002 (Limited Power of Attorney)');
    try {
      const doc002Id = await signNow.uploadDocument(doc002.filePath);
      docUpdates.doc002_signnow_id = doc002Id;
      await signNow.sendSigningInvite(doc002Id, [{ email: seller?.email, role: 'Seller', order: 1 }]);
    } catch (err) {
      logger.warn('SignNow re-upload/invite skipped or failed for regenerated DOC-002', { dealRef: deal.ref, error: err.message });
    }
  }

  if (Object.keys(docUpdates).length > 0) {
    await supabaseAdmin.from('deals').update(docUpdates).eq('id', deal.id);
  }

  // Funds may already have moved based on the original (now-corrected) figures
  // once the deal has reached ESCROW — regenerating the document doesn't undo
  // that. Surface a clear warning so admin manually reconciles the escrow
  // amount/payout rather than assuming the correction alone fixes it.
  const warning =
    stageIndex(deal.status) >= stageIndex(STAGES.ESCROW)
      ? 'This deal is already at or past the Escrow stage — funds may already have moved based on the original figures. ' +
        'The document(s) above were regenerated and re-sent for signature, but you must manually verify/adjust the actual ' +
        'escrow payout amount to match the correction.'
      : null;

  await supabaseAdmin.from('automation_log').insert({
    deal_id: deal.id,
    action: 'admin_document_regeneration',
    status: 'sent',
    payload: { changedFields, regenerated, warning, adminId },
  });

  return { regenerated, warning };
}

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

  // Stable, deterministic links (mirrors dealFlowEngine.onEnterStage's own
  // link construction) surfaced for manual copy/send — important right now
  // since WHATSAPP_MOCK_MODE means the automated WhatsApp messages carrying
  // these same links don't actually deliver to anyone yet.
  const links = {
    join: !deal.seller_id || !deal.buyer_id ? `${APP_BASE_URL}/join/${deal.id}/${!deal.seller_id ? 'seller' : 'buyer'}` : null,
    kycSeller: deal.seller_id && !deal.seller_kyc_complete ? `${APP_BASE_URL}/kyc/${deal.id}/seller` : null,
    kycBuyer: deal.buyer_id && !deal.buyer_kyc_complete ? `${APP_BASE_URL}/kyc/${deal.id}/buyer` : null,
    signingSeller: deal.doc001_url && !deal.doc001_signed ? `${APP_BASE_URL}/sign/${deal.id}/seller` : null,
    signingBuyer: deal.doc001_url && !deal.doc001_signed ? `${APP_BASE_URL}/sign/${deal.id}/buyer` : null,
  };

  return res.json({ deal: { ...deal, stuck, blockedOn: diagnoseBlockers(deal) }, links });
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
  // Tracked before cd_fee/net_proceeds get added below, so document
  // regeneration only fires for fields the admin actually corrected.
  const changedDetailFields = ADMIN_DETAIL_FIELDS.filter((f) => updates[f] !== undefined);

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
  // When admin manually confirms funds_confirmed after a trustin_funds_mismatch
  // (buyer's transfer didn't match sale_price — see trustInWebhook.handleFundsReceived,
  // which otherwise leaves the deal silently stuck forever with no admin-facing
  // signal beyond a raw automation_log row), let them record what was actually
  // received for reconciliation. No schema change: logged alongside the override
  // itself, same place the original mismatch was logged, so both are visible together.
  const receivedAmountNote =
    updates.funds_confirmed === true && req.body.receivedAmount !== undefined ? { receivedAmount: Number(req.body.receivedAmount) || 0, expected: deal.sale_price } : null;
  await supabaseAdmin.from('automation_log').insert({
    deal_id: updated.id,
    action: 'admin_manual_override',
    status: 'sent',
    payload: { updates, adminId: req.appUser?.id, ...(receivedAmountNote ? { receivedAmountReconciliation: receivedAmountNote } : {}) },
  });

  // A corrected vehicle/financial field may already be printed on a generated
  // (possibly already-signed) document — regenerate it and reset its signed
  // status so the deal doesn't get stuck, instead of requiring a restart.
  let documentsRegenerated = [];
  let regenerationWarning = null;
  if (changedDetailFields.length > 0) {
    try {
      const result = await regenerateAffectedDocuments(updated, changedDetailFields, req.appUser?.id);
      documentsRegenerated = result.regenerated;
      regenerationWarning = result.warning;
    } catch (err) {
      logger.error(`Document regeneration failed for deal ${updated.ref}`, { error: err.message });
      regenerationWarning = `Field(s) were saved, but document regeneration failed: ${err.message}. Please retry or regenerate manually.`;
    }
  }

  const afterCheck = await dealFlowEngine.checkAndAdvanceIfStageComplete(updated.id);
  const finalDeal = afterCheck || updated;
  return res.json({
    deal: documentsRegenerated.length > 0 ? { ...finalDeal, ...(await refetchDocFields(finalDeal.id)) } : finalDeal,
    documentsRegenerated,
    warning: regenerationWarning,
  });
}

/** Re-fetches just the doc*_url/doc*_signed columns after regeneration, so the response reflects the new URLs/reset signed flags without a second full deal query elsewhere. */
async function refetchDocFields(dealId) {
  const { data } = await supabaseAdmin
    .from('deals')
    .select('doc001_url, doc001_signed, doc001_signnow_id, doc002_url, doc002_signed, doc002_signnow_id')
    .eq('id', dealId)
    .single();
  return data || {};
}

/**
 * PUT /api/admin/deals/:id/force-stage — bypasses the normal forward-only
 * state machine (dealStages.isValidTransition only permits moving one step
 * forward, or to CANCELLED from any non-terminal stage — there is no way to
 * reopen a cancelled deal, revert a stage, or un-complete a wrongly-completed
 * deal through the regular PUT /:id/stage route). Admin-only escape hatch for
 * exactly those cases (e.g. a deal was cancelled by mistake, or completed
 * before the parties actually finished, or needs to go back a step to redo
 * something).
 *
 * Deliberately does NOT re-run onEnterStage's stage-entry automation (no
 * WhatsApp resend, no document (re)generation, no TrustIn/escrow calls) —
 * replaying that automatically risks duplicate WhatsApp messages, a second
 * TrustIn escrow deal being created, or double-charging/paying out. Admin
 * must trigger any of those manually afterwards using the other admin tools
 * (Regenerate documents, Resend signing invite, etc.) if the new stage needs them.
 *
 * When moving BACKWARD (target is earlier than the deal's current stage),
 * also resets whichever verification flags/values gate leaving the target
 * stage (STAGE_RESET_FIELDS) — otherwise the deal's status would move back
 * but the underlying flags stay true, so the very next unrelated
 * advance-check silently fast-forwards it right back to where it was, with
 * the buyer/seller never having redone anything (see STAGE_RESET_FIELDS'
 * comment for the full reasoning). Moving FORWARD never resets anything.
 */
async function forceStage(req, res) {
  const { targetStage, reason } = req.body;
  if (!targetStage || !Object.values(STAGES).includes(targetStage)) {
    return res.status(400).json({ error: `targetStage must be one of: ${Object.values(STAGES).join(', ')}` });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A reason is required so this override is auditable' });
  }

  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.status === targetStage) return res.status(400).json({ error: 'Deal is already in that stage' });

  const isBackward = stageIndex(targetStage) !== -1 && stageIndex(targetStage) < stageIndex(deal.status);
  const resetFields = isBackward ? STAGE_RESET_FIELDS[targetStage] || {} : {};

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('deals')
    .update({ status: targetStage, ...resetFields })
    .eq('id', deal.id)
    .select()
    .single();
  if (updateErr || !updated) return res.status(500).json({ error: 'Could not change stage — please try again' });

  logger.info(`Admin force-set deal ${updated.ref} from ${deal.status} to ${targetStage}`, { reason, resetFields, admin: req.appUser?.id });
  await supabaseAdmin.from('automation_log').insert({
    deal_id: updated.id,
    action: 'admin_force_stage',
    status: 'sent',
    payload: { from: deal.status, to: targetStage, reason, resetFields: Object.keys(resetFields), adminId: req.appUser?.id },
  });

  const resetFieldNames = Object.keys(resetFields);
  const warning =
    'Stage was force-set directly — no automated actions for the new stage were re-triggered (no WhatsApp messages, document generation, or TrustIn/escrow calls). ' +
    'Trigger any of those manually if the new stage needs them.' +
    (resetFieldNames.length > 0
      ? ` Because this was a backward move, the following were reset so the deal can't silently skip back past this stage: ${resetFieldNames.join(', ')}. Manually notify the affected part(y/ies) to redo this — send them the relevant link from the Links card below.`
      : '');

  return res.json({ deal: updated, warning });
}

/**
 * PUT /api/admin/deals/:id/reassign — replaces the seller or buyer on a deal
 * by phone lookup. The seller-facing PATCH /:id/buyer endpoint already lets a
 * seller attach/replace a buyer, but does zero cleanup of the previously
 * attached party's state — if a seller attached the wrong buyer who then
 * completed KYC or even signed DOC-001, re-attaching the correct buyer would
 * silently leave those flags true for someone who never actually did any of
 * it. This admin version resets seller/buyer_kyc_complete and any signed
 * document status tied to the replaced party, and regenerates already-
 * generated DOC-001/002 (they printed the wrong party's name).
 */
async function reassignParty(req, res) {
  const { role, phone } = req.body;
  if (!['seller', 'buyer'].includes(role)) return res.status(400).json({ error: 'role must be "seller" or "buyer"' });
  if (!phone) return res.status(400).json({ error: 'phone is required' });

  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });

  const { data: newUser } = await supabaseAdmin.from('users').select('id').eq('phone', phone).eq('role', 'individual').maybeSingle();
  if (!newUser) return res.status(400).json({ error: 'No account found with that phone number — they must sign up first' });

  const idField = role === 'seller' ? 'seller_id' : 'buyer_id';
  const kycField = role === 'seller' ? 'seller_kyc_complete' : 'buyer_kyc_complete';
  if (deal[idField] === newUser.id) return res.status(400).json({ error: `That is already the ${role} on this deal` });

  const updates = { [idField]: newUser.id, [kycField]: false };
  // Any signature already collected was collected under the wrong identity —
  // it no longer represents the actual party and must be re-collected.
  if (deal.doc001_url) {
    updates.doc001_signed = false;
    updates.doc001_signnow_id = null;
  }
  if (role === 'seller' && deal.doc002_url) {
    updates.doc002_signed = false;
    updates.doc002_signnow_id = null;
  }

  const { data: updated, error: updateErr } = await supabaseAdmin.from('deals').update(updates).eq('id', deal.id).select().single();
  if (updateErr || !updated) return res.status(500).json({ error: 'Could not reassign — please try again' });

  logger.info(`Admin reassigned ${role} on deal ${updated.ref}`, { oldId: deal[idField], newId: newUser.id, admin: req.appUser?.id });
  await supabaseAdmin.from('automation_log').insert({
    deal_id: updated.id,
    action: 'admin_reassign_party',
    status: 'sent',
    payload: { role, oldId: deal[idField], newId: newUser.id, adminId: req.appUser?.id },
  });

  let documentsRegenerated = [];
  let warning =
    stageIndex(deal.status) >= stageIndex(STAGES.ESCROW)
      ? 'This deal is already at or past Escrow — funds/loan/fines settlement may already be tied to the previous party. Reassigning does not undo any money movement; reconcile manually.'
      : null;
  try {
    const result = await regenerateAffectedDocuments(updated, [], req.appUser?.id, {
      doc001: !!deal.doc001_url,
      doc002: role === 'seller' && !!deal.doc002_url,
    });
    documentsRegenerated = result.regenerated;
    if (result.warning) warning = warning ? `${warning} ${result.warning}` : result.warning;
  } catch (err) {
    const msg = `Reassignment was saved, but document regeneration failed: ${err.message}.`;
    warning = warning ? `${warning} ${msg}` : msg;
  }

  return res.json({
    deal: documentsRegenerated.length > 0 ? { ...updated, ...(await refetchDocFields(updated.id)) } : updated,
    documentsRegenerated,
    warning,
  });
}

/**
 * PUT /api/admin/deals/:id/party/:role/identity — corrects a seller or
 * buyer's identity fields on the `users` table (full_name, emirates_id,
 * nationality, phone, email). Before this, there was no admin path to fix any
 * of these once TrustIn/UAE-Pass KYC populated them — a misread name has real
 * consequences: it prints on DOC-001/002 and drives the bank-proof
 * fuzzy-name-match (bankProofVerificationService.js), so a KYC typo could
 * permanently block a seller from passing bank-proof verification with no
 * remedy. Regenerates DOC-001/002 for THIS deal if they already print the
 * changed field(s) and were already generated.
 */
async function updatePartyIdentity(req, res) {
  const { role } = req.params;
  if (!['seller', 'buyer'].includes(role)) return res.status(400).json({ error: 'role must be "seller" or "buyer"' });

  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });

  const userId = role === 'seller' ? deal.seller_id : deal.buyer_id;
  if (!userId) return res.status(400).json({ error: `No ${role} attached to this deal yet` });

  const updates = {};
  for (const field of USER_IDENTITY_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: `No valid fields provided. Allowed: ${USER_IDENTITY_FIELDS.join(', ')}` });
  }

  const { data: updatedUser, error: updateErr } = await supabaseAdmin.from('users').update(updates).eq('id', userId).select().single();
  if (updateErr || !updatedUser) return res.status(500).json({ error: 'Could not save identity fields — please try again' });

  logger.info(`Admin corrected ${role} identity on deal ${deal.ref}`, { updates, admin: req.appUser?.id });
  await supabaseAdmin.from('automation_log').insert({
    deal_id: deal.id,
    action: 'admin_identity_override',
    status: 'sent',
    payload: { role, updates, adminId: req.appUser?.id },
  });

  const changedFields = Object.keys(updates);
  const printedOnDoc001 = changedFields.some((f) => IDENTITY_FIELDS_ON_DOC001.includes(f));
  const printedOnDoc002 = role === 'seller' && changedFields.some((f) => IDENTITY_FIELDS_ON_DOC002_SELLER_ONLY.includes(f));

  let documentsRegenerated = [];
  let warning = null;
  if (printedOnDoc001 || printedOnDoc002) {
    try {
      const result = await regenerateAffectedDocuments(deal, [], req.appUser?.id, {
        doc001: printedOnDoc001 && !!deal.doc001_url,
        doc002: printedOnDoc002 && !!deal.doc002_url,
      });
      documentsRegenerated = result.regenerated;
      warning = result.warning;
    } catch (err) {
      warning = `Identity fields were saved, but document regeneration failed: ${err.message}.`;
    }
  }

  return res.json({
    user: updatedUser,
    deal: documentsRegenerated.length > 0 ? { ...deal, ...(await refetchDocFields(deal.id)) } : undefined,
    documentsRegenerated,
    warning,
  });
}

/**
 * POST /api/admin/deals/:id/resend-signing-invite — standalone re-dispatch of
 * a specific already-generated document to SignNow, decoupled from requiring
 * a field edit to trigger it (previously the only way to re-send a signing
 * invite was via manualOverride's side-effect regeneration when a printed
 * field happened to change). Covers e.g. "the seller says they never got the
 * SignNow email" or "the SignNow upload failed silently the first time" — both
 * currently unrecoverable without this. Regenerates the PDF fresh (guarantees
 * an up-to-date document and a fresh SignNow document ID) and resends.
 */
async function resendSigningInvite(req, res) {
  const { doc } = req.body;
  if (!['doc001', 'doc002'].includes(doc)) return res.status(400).json({ error: 'doc must be "doc001" or "doc002"' });

  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (!deal[`${doc}_url`]) {
    return res.status(400).json({ error: `${doc.toUpperCase()} has not been generated yet — use "Regenerate documents" first` });
  }

  try {
    const result = await regenerateAffectedDocuments(deal, [], req.appUser?.id, { doc001: doc === 'doc001', doc002: doc === 'doc002' });
    return res.json({ regenerated: result.regenerated, warning: result.warning });
  } catch (err) {
    return res.status(500).json({ error: `Could not resend signing invite: ${err.message}` });
  }
}

/**
 * Generates DOC-003 (Broker Referral Agreement) fresh and (best-effort)
 * uploads + sends it to the partner for signature. Shared by updateReferral
 * for both the "newly attached partner" and "existing partner's fee/identity
 * changed" cases below.
 */
async function generateAndSendDoc003(deal, partner) {
  const doc003 = await docGen.generateDoc003(deal, partner);
  const updates = { doc003_url: doc003.url, doc003_signed: false, doc003_signnow_id: null };
  try {
    const doc003Id = await signNow.uploadDocument(doc003.filePath);
    updates.doc003_signnow_id = doc003Id;
    await signNow.sendSigningInvite(doc003Id, [{ email: partner.email, role: 'Partner', order: 1 }]);
  } catch (err) {
    logger.warn('SignNow re-upload/invite skipped or failed for regenerated DOC-003', { dealRef: deal.ref, error: err.message });
  }
  await supabaseAdmin.from('deals').update(updates).eq('id', deal.id);
  return updates;
}

/**
 * PUT /api/admin/deals/:id/referral — attaches, corrects, or removes the
 * referral partner/source/fee on a deal after it's already been created. A
 * seller very often only mentions the dealer/broker who referred them once
 * the deal is already underway (or names the wrong one, or the fee needs a
 * manual adjustment) — before this there was no way to fix any of that once
 * POST /deals had already run, since referral_partner_id/referral_source/
 * referral_fee were only ever set once, at creation.
 *
 * Body: { partnerPhone, referralSource, referralFee }, all optional —
 *  - partnerPhone: looks up an existing partners row by phone and attaches it.
 *    Pass an empty string/null to remove the currently attached partner.
 *  - referralSource: one of REFERRAL_SOURCES.
 *  - referralFee: explicit override of the auto-calculated referral fee
 *    (e.g. a custom negotiated amount) — takes precedence over the
 *    auto-calculation triggered by attaching a partner in the same request.
 *
 * If a partner is newly attached to a deal whose DOC-001 already exists but
 * DOC-003 does not (no partner existed when documents were first generated),
 * generates + sends DOC-003 now. If a partner/fee changes on a deal that
 * already has a DOC-003, regenerates and re-sends it so the printed
 * partner/fee is correct and it's re-signed. If the partner is removed,
 * doc003Required becomes false (see dealFlowEngine.checkAndAdvanceIfAllSigned)
 * so an unsigned/orphaned DOC-003 no longer blocks the deal from advancing —
 * the stale doc003_url/signed state is cleared since it no longer applies.
 */
async function updateReferral(req, res) {
  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });

  const updates = {};
  let newPartner = null;
  let partnerRemoved = false;

  if ('partnerPhone' in req.body) {
    const phone = req.body.partnerPhone;
    if (!phone || !String(phone).trim()) {
      partnerRemoved = Boolean(deal.referral_partner_id);
      updates.referral_partner_id = null;
      updates.referral_fee = null;
      if (deal.doc003_url) {
        updates.doc003_url = null;
        updates.doc003_signed = false;
        updates.doc003_signnow_id = null;
      }
    } else {
      const { data: partner } = await supabaseAdmin.from('partners').select('*').eq('phone', String(phone).trim()).maybeSingle();
      if (!partner) return res.status(400).json({ error: 'No partner found with that phone number — they must create a partner profile first (POST /api/partners)' });
      newPartner = partner;
      updates.referral_partner_id = partner.id;
      const dealValue = deal.product === 'loanclear' ? deal.loan_amount || 0 : deal.sale_price;
      updates.referral_fee = feeCalculator.calculateReferralFee(dealValue, feeCalculator.isLoyaltyTier(partner.total_deals));
    }
  }

  if (req.body.referralSource !== undefined) {
    if (!REFERRAL_SOURCES.includes(req.body.referralSource)) {
      return res.status(400).json({ error: `referralSource must be one of: ${REFERRAL_SOURCES.join(', ')}` });
    }
    updates.referral_source = req.body.referralSource;
  }

  // Explicit fee override always wins over the auto-calculated figure set above.
  if (req.body.referralFee !== undefined) {
    updates.referral_fee = req.body.referralFee === null || req.body.referralFee === '' ? null : Number(req.body.referralFee);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields provided. Allowed: partnerPhone, referralSource, referralFee' });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin.from('deals').update(updates).eq('id', deal.id).select().single();
  if (updateErr || !updated) return res.status(500).json({ error: 'Could not update referral info — please try again' });

  logger.info(`Admin updated referral info on deal ${updated.ref}`, { updates, admin: req.appUser?.id });
  await supabaseAdmin.from('automation_log').insert({
    deal_id: updated.id,
    action: 'admin_referral_override',
    status: 'sent',
    payload: { updates, adminId: req.appUser?.id },
  });

  const warnings = [];
  if (deal.referral_fee_paid) {
    warnings.push('A referral fee was already recorded as paid on this deal — this change does NOT reverse or reissue any payment. Reconcile manually with finance.');
  }
  if (partnerRemoved && deal.doc003_signed) {
    warnings.push('The removed partner had already signed DOC-003 — that signature no longer applies to this deal.');
  }

  let documentsRegenerated = [];
  const partnerId = updated.referral_partner_id;
  // Regenerate DOC-003 if: a partner was just newly attached/changed (it either
  // didn't exist yet or printed the wrong partner's details), OR the fee was
  // explicitly overridden on a deal that already has a DOC-003 (it printed the
  // old figure). A referralSource-only change never affects DOC-003's content.
  const shouldRegenerateDoc003 = partnerId && updated.doc001_url && (newPartner || (deal.doc003_url && req.body.referralFee !== undefined));
  if (shouldRegenerateDoc003) {
    try {
      const partner = newPartner || (await supabaseAdmin.from('partners').select('*').eq('id', partnerId).single()).data;
      if (partner) {
        await generateAndSendDoc003(updated, partner);
        documentsRegenerated.push('DOC-003 (Broker Referral Agreement)');
      }
    } catch (err) {
      warnings.push(`Referral info was saved, but DOC-003 generation failed: ${err.message}.`);
    }
  }

  const afterCheck = await dealFlowEngine.checkAndAdvanceIfStageComplete(updated.id);
  const finalDeal = afterCheck || updated;

  return res.json({
    deal: documentsRegenerated.length > 0 ? { ...finalDeal, ...(await refetchDoc003Fields(finalDeal.id)) } : finalDeal,
    documentsRegenerated,
    warning: warnings.length > 0 ? warnings.join(' ') : null,
  });
}

/** Re-fetches just the doc003_url/doc003_signed columns after regeneration — mirrors refetchDocFields but for DOC-003. */
async function refetchDoc003Fields(dealId) {
  const { data } = await supabaseAdmin.from('deals').select('doc003_url, doc003_signed, doc003_signnow_id').eq('id', dealId).single();
  return data || {};
}

/**
 * GET /api/admin/deals/:id/audit-log — the automation_log rows for this deal
 * (mock TrustIn calls, admin overrides, document regeneration, stage-entry
 * automation failures, and critically `trustin_funds_mismatch` when a buyer's
 * transfer doesn't match the expected sale price). Previously this table was
 * write-only from the admin's perspective — visible only via raw Supabase
 * access — even though it's exactly the audit trail admin needs to see what
 * happened and why a deal might be stuck.
 */
async function getDealAuditLog(req, res) {
  const { data: deal, error: dealErr } = await supabaseAdmin.from('deals').select('id').eq('id', req.params.id).single();
  if (dealErr || !deal) return res.status(404).json({ error: 'Deal not found' });

  const { data: log, error } = await supabaseAdmin
    .from('automation_log')
    .select('*')
    .eq('deal_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Could not load audit log — please try again' });

  return res.json({ log });
}

module.exports = {
  getAllDeals,
  getStats,
  getDealDetail,
  manualOverride,
  forceStage,
  reassignParty,
  updatePartyIdentity,
  resendSigningInvite,
  updateReferral,
  getDealAuditLog,
};
