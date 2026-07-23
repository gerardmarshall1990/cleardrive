// Deal controller — creation, retrieval, stage progression, fines verification,
// document generation, and completion. All business logic (fees, state machine)
// lives in /services; this file only validates input, calls services, and shapes responses.

const { supabaseAdmin } = require('../config/supabase');
const feeCalculator = require('../services/feeCalculator');
const dealFlowEngine = require('../services/dealFlowEngine');
const finesVerification = require('../services/finesVerificationService');
const documentVision = require('../services/documentVisionService');
const bankProofVerification = require('../services/bankProofVerificationService');
const trustInKycService = require('../services/trustInKycService');
const storageService = require('../services/storageService');
const docGen = require('../services/documentGenerator');
const whatsAppService = require('../services/whatsAppService');
const emailService = require('../services/emailService');
const { STAGES, stageIndex } = require('../utils/dealStages');
const logger = require('../utils/logger');
const { APP_BASE_URL } = require('../config/appBaseUrl');

const SAFEPAY_MIN_SALE_PRICE = 100000;

/**
 * Looks up an existing individual account by phone number to attach as the
 * buyer. They must already have a ClearDrive account (self-serve signup)
 * before a seller can attach them to a deal — we never create phantom user
 * rows for people who haven't signed up, since buyer_id is a hard FK and the
 * buyer must complete their own KYC/signing steps under their own login.
 * @returns {Promise<{buyerId: string|null, error: string|null}>}
 */
async function resolveBuyerId(buyerPhone) {
  if (!buyerPhone) return { buyerId: null, error: null };
  const { data: buyer } = await supabaseAdmin.from('users').select('id').eq('phone', buyerPhone).eq('role', 'individual').maybeSingle();
  if (!buyer) return { buyerId: null, error: 'No account found with that phone number — ask them to sign up first, then try again' };
  return { buyerId: buyer.id, error: null };
}

/**
 * Same pattern as resolveBuyerId, for dealers/brokers referring a seller they
 * don't have an account ID for — the seller must already have a ClearDrive account.
 */
async function resolveSellerId(sellerPhone) {
  if (!sellerPhone) return { sellerId: null, error: null };
  const { data: seller } = await supabaseAdmin.from('users').select('id').eq('phone', sellerPhone).eq('role', 'individual').maybeSingle();
  if (!seller) return { sellerId: null, error: 'No account found with that phone number — ask them to sign up first, then try again' };
  return { sellerId: seller.id, error: null };
}

/**
 * Dealers/brokers referring a deal are always credited as themselves — the
 * referral partner is never taken from client input for those roles, to
 * prevent one partner claiming another's referral fee. Linked by phone (see
 * partnerController.findMyPartner / authController.signup).
 */
async function resolveOwnPartnerId(appUser) {
  if (appUser.role !== 'dealer' && appUser.role !== 'broker') return null;
  const { data: partner } = await supabaseAdmin.from('partners').select('id').eq('phone', appUser.phone).eq('type', appUser.role).maybeSingle();
  return partner?.id || null;
}

/**
 * Resolves whether the calling user may view/act on a given deal — a party
 * (seller/buyer), the dealer/broker who referred it, or an admin. Used to
 * scope every deal-level endpoint below so an authenticated user can't read
 * or mutate someone else's deal just by guessing/incrementing an ID.
 */
async function getDealAccess(deal, appUser) {
  const isSeller = deal.seller_id === appUser.id;
  const isBuyer = deal.buyer_id === appUser.id;
  const isAdmin = appUser.role === 'admin';
  let isReferringPartner = false;
  if (!isSeller && !isBuyer && !isAdmin && deal.referral_partner_id) {
    const ownPartnerId = await resolveOwnPartnerId(appUser);
    isReferringPartner = ownPartnerId !== null && ownPartnerId === deal.referral_partner_id;
  }
  return { isSeller, isBuyer, isAdmin, isReferringPartner };
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — generous for a phone photo, well under Claude Vision's per-image limit

/**
 * Shared guard for the four Claude Vision upload endpoints below (fines,
 * Mulkiya, settlement letter, Emirates ID) — rejects unsupported file types
 * and oversized payloads before spending a Vision API call on them. Previously
 * unvalidated: any authenticated user could POST arbitrary base64 data of any
 * size/type here, an open cost/abuse vector.
 */
function validateImageUpload(imageBase64, mediaType) {
  if (mediaType && !ALLOWED_IMAGE_TYPES.includes(mediaType)) {
    return `Unsupported image type "${mediaType}" — use JPEG, PNG, WEBP, or HEIC`;
  }
  // Rough decoded size from base64 length (4 chars ~= 3 bytes) — good enough
  // to reject grossly oversized uploads without a full decode.
  const approxBytes = (imageBase64.length * 3) / 4;
  if (approxBytes > MAX_IMAGE_BYTES) {
    return 'Image is too large — please upload a photo under 8MB';
  }
  return null;
}

/**
 * POST /api/deals — creates a new deal (quote stage) and calculates the
 * estimated net proceeds. Deal ref (CD-YYYY-NNN) is auto-generated by the DB.
 *
 * One form serves both sides of the trade — an individual account picks
 * which side they're playing on THIS deal via `role` in the request body
 * (seller or buyer; not fixed on the account), and the other party's slot
 * (seller_id/buyer_id) is left null until they join via the invite link sent
 * below. Dealers/brokers/admins keep the existing referral-creation path
 * (always creating on behalf of a seller by phone/ID).
 */
async function createDeal(req, res) {
  const {
    product, // 'loanclear' | 'safepay'
    plate,
    make,
    model,
    year,
    salePrice,
    loanAmount,
    loanBank,
    otherPartyPhone,
    otherPartyEmail,
    buyerPhone,
    sellerPhone,
    referralSource,
  } = req.body;

  const creatorRole = req.appUser.role; // 'individual' | 'dealer' | 'broker' | 'admin'
  const isPartyCreator = creatorRole === 'individual';
  let dealRole = null; // 'seller' | 'buyer' — the side this individual is playing on THIS deal

  let sellerId = null;
  let buyerId = null;

  if (isPartyCreator) {
    dealRole = req.body.role;
    if (!['seller', 'buyer'].includes(dealRole)) {
      return res.status(400).json({ error: 'role must be "seller" or "buyer"' });
    }
    if (dealRole === 'seller') {
      sellerId = req.appUser.id;
      // The other party's slot is always left null here, even if they already
      // have an account — attachment only ever happens through them actually
      // clicking the join link below (and confirming their own session), never
      // silently at creation time.
    } else {
      buyerId = req.appUser.id;
    }
  } else {
    // Dealers/brokers referring a seller they don't have an ID for may pass
    // the seller's phone instead (the seller must already have a ClearDrive
    // account). Admins may pass an explicit sellerId.
    sellerId = req.body.sellerId;
    if (!sellerId && sellerPhone) {
      const { sellerId: resolved, error: sellerErr } = await resolveSellerId(sellerPhone);
      if (sellerErr) return res.status(400).json({ error: sellerErr });
      sellerId = resolved;
    }
    const { buyerId: resolved, error: buyerErr } = await resolveBuyerId(buyerPhone);
    if (buyerErr) return res.status(400).json({ error: buyerErr });
    buyerId = resolved;

    if (!sellerId) {
      return res.status(400).json({ error: 'sellerId (or sellerPhone) is required' });
    }
  }

  if (!['loanclear', 'safepay'].includes(product)) {
    return res.status(400).json({ error: 'product must be "loanclear" or "safepay"' });
  }
  if (!plate || typeof salePrice !== 'number' || salePrice <= 0) {
    return res.status(400).json({ error: 'plate and a positive salePrice are required' });
  }
  if (product === 'safepay' && salePrice < SAFEPAY_MIN_SALE_PRICE) {
    return res.status(400).json({ error: `SafePay requires a minimum sale price of AED ${SAFEPAY_MIN_SALE_PRICE.toLocaleString()}` });
  }
  // A seller creating the deal knows (or must find out) the exact outstanding
  // loan amount up front. A buyer proposing a deal may only know roughly (or
  // not at all) — the seller will confirm the authoritative figure later via
  // the settlement letter extraction / PATCH :id/details.
  if (product === 'loanclear' && dealRole === 'seller' && (typeof loanAmount !== 'number' || loanAmount < 0)) {
    return res.status(400).json({ error: 'loanAmount (approximate) is required for LoanClear deals' });
  }
  const effectiveLoanAmount = product === 'loanclear' ? (typeof loanAmount === 'number' && loanAmount >= 0 ? loanAmount : 0) : 0;

  // A join link must go to someone — the other party's contact details are
  // required so the invite can actually be delivered.
  if (isPartyCreator && !(otherPartyPhone || buyerPhone || sellerPhone) && !otherPartyEmail) {
    return res.status(400).json({ error: "The other party's phone or email is required so we can send them the join link" });
  }

  // Dealers/brokers are always credited as themselves; admins may still pass an
  // explicit referralPartnerId (e.g. entering a historical/offline referral).
  const referralPartnerId = creatorRole === 'admin' ? req.body.referralPartnerId : await resolveOwnPartnerId(req.appUser);

  const cdFee = product === 'loanclear' ? feeCalculator.calculateLoanClearFee(effectiveLoanAmount) : feeCalculator.calculateSafePayFee(salePrice);
  const netProceeds = feeCalculator.calculateNetProceeds({ salePrice, loanAmount: effectiveLoanAmount, finesAmount: 0, cdFee });

  let referralFee = null;
  if (referralPartnerId) {
    const { data: partner } = await supabaseAdmin.from('partners').select('*').eq('id', referralPartnerId).single();
    if (partner) {
      const dealValue = product === 'loanclear' ? effectiveLoanAmount : salePrice;
      referralFee = feeCalculator.calculateReferralFee(dealValue, feeCalculator.isLoyaltyTier(partner.total_deals));
    }
  }

  const { data: deal, error } = await supabaseAdmin
    .from('deals')
    .insert({
      product,
      status: STAGES.QUOTE,
      seller_id: sellerId,
      buyer_id: buyerId,
      plate,
      make: make || null,
      model: model || null,
      year: year || null,
      sale_price: salePrice,
      loan_amount: product === 'loanclear' ? effectiveLoanAmount : null,
      loan_bank: product === 'loanclear' ? loanBank || null : null,
      cd_fee: cdFee,
      net_proceeds: netProceeds,
      referral_source: (creatorRole === 'dealer' || creatorRole === 'broker') ? creatorRole : referralSource || 'direct',
      referral_partner_id: referralPartnerId || null,
      referral_fee: referralFee,
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create deal', { error: error.message });
    return res.status(500).json({ error: 'Could not create deal — please try again' });
  }

  // Auto-generate and send the join link to the other party — immediately,
  // via both WhatsApp and email, no extra step. Only applies when a seller or
  // buyer created the deal directly (dealer/broker referrals attach an
  // existing seller by phone and don't need an invite link).
  if (isPartyCreator) {
    const otherRole = dealRole === 'seller' ? 'buyer' : 'seller';
    const contactPhone = otherPartyPhone || buyerPhone || sellerPhone || null;
    const link = `${APP_BASE_URL}/join/${deal.id}/${otherRole}`;
    await Promise.all([
      whatsAppService.sendJoinInvite(deal, contactPhone, otherRole, link),
      emailService.sendJoinInvite(deal, otherPartyEmail, otherRole, link),
    ]);
  }

  return res.status(201).json({ deal });
}

/**
 * GET /api/deals/by-ref/:ref — looks up a deal by its human-readable
 * reference (e.g. "CD-2026-035") for the "Join Deal" flow: the other party
 * enters the ref number themselves instead of needing the emailed/WhatsApp'd
 * join link to actually arrive. Returns only a small preview (not the full
 * deal record — no banking/escrow fields) plus which side is still open, so
 * the frontend can show "Confirm you're the {openRole}" before attaching.
 */
async function getDealByRef(req, res) {
  if (req.appUser.role !== 'individual') {
    return res.status(403).json({ error: 'Only individual accounts can join a deal this way' });
  }

  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('ref', req.params.ref).maybeSingle();
  if (error || !deal) return res.status(404).json({ error: 'No deal found with that reference number' });

  const openRole = !deal.seller_id ? 'seller' : !deal.buyer_id ? 'buyer' : null;

  return res.json({
    deal: {
      id: deal.id,
      ref: deal.ref,
      product: deal.product,
      plate: deal.plate,
      make: deal.make,
      model: deal.model,
      year: deal.year,
      sale_price: deal.sale_price,
      status: deal.status,
    },
    openRole,
    alreadyJoined: deal.seller_id === req.appUser.id || deal.buyer_id === req.appUser.id,
  });
}

/**
 * POST /api/deals/:id/join — the join-link landing action. Clicking an
 * invite link (either directly, if already logged in as the right role, or
 * immediately after completing signup) calls this to attach the caller to
 * the deal as the role embedded in the link. Idempotent: if the caller is
 * already attached in that slot, it's a no-op success rather than an error,
 * so re-clicking the same link (or a page refresh mid-flow) never fails.
 */
async function joinDeal(req, res) {
  const { role } = req.body;
  if (!['seller', 'buyer'].includes(role)) return res.status(400).json({ error: 'role must be "seller" or "buyer"' });
  if (req.appUser.role !== 'individual') {
    return res.status(403).json({ error: `This invite requires an individual account — you're logged in as a ${req.appUser.role} account` });
  }

  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });

  const idField = role === 'seller' ? 'seller_id' : 'buyer_id';

  if (deal[idField] === req.appUser.id) {
    return res.json({ deal }); // already attached — no-op
  }
  if (deal[idField]) {
    return res.status(409).json({ error: `This deal already has a ${role} attached` });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin.from('deals').update({ [idField]: req.appUser.id }).eq('id', deal.id).select().single();
  if (updateErr) return res.status(500).json({ error: 'Could not join the deal — please try again' });

  return res.json({ deal: updated });
}

/**
 * PATCH /api/deals/:id/buyer — attaches (or replaces) the buyer on a deal by
 * phone number lookup. Used when the seller didn't have the buyer's details
 * at quote-creation time, and must be done before the deal reaches KYC so
 * the buyer's identity check can be sent to the right person.
 */
async function attachBuyer(req, res) {
  const { buyerPhone } = req.body;
  if (!buyerPhone) return res.status(400).json({ error: 'buyerPhone is required' });

  const { data: deal, error: dealErr } = await supabaseAdmin.from('deals').select('id, seller_id').eq('id', req.params.id).single();
  if (dealErr || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.seller_id !== req.appUser.id) {
    return res.status(403).json({ error: 'Only the seller can attach a buyer' });
  }

  const { buyerId, error: buyerErr } = await resolveBuyerId(buyerPhone);
  if (buyerErr) return res.status(400).json({ error: buyerErr });

  const { data: updated, error } = await supabaseAdmin.from('deals').update({ buyer_id: buyerId }).eq('id', req.params.id).select().single();
  if (error || !updated) return res.status(404).json({ error: 'Deal not found' });

  return res.json({ deal: updated });
}

/**
 * GET /api/deals/mine — all deals where the calling user is the seller or
 * buyer, most recent first. Powers the seller/buyer "my deals" dashboards.
 */
async function listMine(req, res) {
  const userId = req.appUser.id;
  const { data: deals, error } = await supabaseAdmin
    .from('deals')
    .select('*')
    .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Could not load your deals — please try again' });
  return res.json({ deals });
}

/** GET /api/deals/:id — seller, buyer, the referring partner, or admin only. */
async function getDeal(req, res) {
  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });

  const { isSeller, isBuyer, isAdmin, isReferringPartner } = await getDealAccess(deal, req.appUser);
  if (!isSeller && !isBuyer && !isAdmin && !isReferringPartner) {
    return res.status(403).json({ error: 'You do not have access to this deal' });
  }

  return res.json({ deal });
}

/** PUT /api/deals/:id/stage — advances the deal to the next stage in the flow. */
async function advanceStage(req, res) {
  const { targetStage } = req.body;
  if (!targetStage) return res.status(400).json({ error: 'targetStage is required' });

  const { data: deal, error: dealErr } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (dealErr || !deal) return res.status(404).json({ error: 'Deal not found' });

  const { isSeller, isBuyer, isAdmin, isReferringPartner } = await getDealAccess(deal, req.appUser);
  if (!isSeller && !isBuyer && !isAdmin && !isReferringPartner) {
    return res.status(403).json({ error: 'You are not a party to this deal' });
  }

  try {
    const updated = await dealFlowEngine.advanceStage(req.params.id, targetStage);
    return res.json({ deal: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

/**
 * POST /api/deals/:id/fines-verify — accepts a base64 RTA screenshot, runs
 * Claude Vision extraction, cross-validates against the deal's plate, and
 * (on success) marks the deal's fines as verified.
 */
async function verifyFines(req, res) {
  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
  const imageError = validateImageUpload(imageBase64, mediaType);
  if (imageError) return res.status(400).json({ error: imageError });

  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.seller_id !== req.appUser.id) {
    return res.status(403).json({ error: 'Only the seller can verify fines' });
  }

  const result = await finesVerification.verifyFinesScreenshot({ imageBase64, mediaType, expectedPlate: deal.plate });

  if (!result.success) {
    return res.status(422).json({ verified: false, error: result.reason, reason: result.reason });
  }

  const cdFee = deal.product === 'loanclear' ? feeCalculator.calculateLoanClearFee(deal.loan_amount) : feeCalculator.calculateSafePayFee(deal.sale_price);
  const netProceeds = feeCalculator.calculateNetProceeds({
    salePrice: deal.sale_price,
    loanAmount: deal.loan_amount || 0,
    finesAmount: result.finesAed,
    cdFee,
  });

  let finesScreenshotUrl;
  try {
    const ext = mediaType === 'image/png' ? 'png' : 'jpg';
    finesScreenshotUrl = await storageService.uploadUserImage(imageBase64, mediaType, `${deal.id}/fines-${Date.now()}.${ext}`);
  } catch (uploadErr) {
    logger.warn('Fines screenshot upload failed — continuing with verification only', { error: uploadErr.message, dealId: deal.id });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('deals')
    .update({
      fines_amount: result.finesAed,
      fines_verified: true,
      cd_fee: cdFee,
      net_proceeds: netProceeds,
      ...(finesScreenshotUrl ? { fines_screenshot_url: finesScreenshotUrl } : {}),
    })
    .eq('id', deal.id)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: 'Could not save verified fines — please try again' });

  return res.json({ verified: true, deal: updated });
}

/**
 * POST /api/deals/:id/extract-mulkiya — accepts a base64 Mulkiya (vehicle
 * registration card) photo, runs Claude Vision extraction, and returns the
 * extracted vehicle fields for the seller to confirm/edit before saving via
 * PATCH /:id/details. The raw photo itself IS persisted (mulkiya_image_url,
 * see 0007_deal_uploaded_images.sql) — regardless of whether extraction
 * succeeds — so admin can pull up the source document and correct any field
 * Claude Vision misread via the admin override endpoint.
 */
async function extractMulkiya(req, res) {
  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
  const imageError = validateImageUpload(imageBase64, mediaType);
  if (imageError) return res.status(400).json({ error: imageError });

  const { data: deal, error } = await supabaseAdmin.from('deals').select('id, seller_id').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.seller_id !== req.appUser.id) {
    return res.status(403).json({ error: 'Only the seller can upload the Mulkiya' });
  }

  try {
    const ext = mediaType === 'image/png' ? 'png' : 'jpg';
    const imageUrl = await storageService.uploadUserImage(imageBase64, mediaType, `${deal.id}/mulkiya-${Date.now()}.${ext}`);
    await supabaseAdmin.from('deals').update({ mulkiya_image_url: imageUrl }).eq('id', deal.id);
  } catch (uploadErr) {
    logger.warn('Mulkiya image upload failed — continuing with extraction only', { error: uploadErr.message, dealId: deal.id });
  }

  const result = await documentVision.extractMulkiya({ imageBase64, mediaType });
  if (!result.success) return res.status(422).json({ extracted: false, error: result.reason, reason: result.reason });

  await supabaseAdmin.from('deals').update({ mulkiya_verified: true }).eq('id', deal.id);

  return res.json({ extracted: true, data: result.data });
}

/**
 * POST /api/deals/:id/extract-mulkiya-back — accepts a base64 photo of the
 * BACK of the Mulkiya. No fields are extracted into the deal record (the back
 * doesn't carry any of the vehicle fields the Details form collects) — this
 * just verifies the photo is legible and is in fact the back of a Mulkiya,
 * and persists it (mulkiya_back_image_url, see 0009_mulkiya_back_image.sql)
 * so admin has the complete document on file.
 */
async function extractMulkiyaBack(req, res) {
  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
  const imageError = validateImageUpload(imageBase64, mediaType);
  if (imageError) return res.status(400).json({ error: imageError });

  const { data: deal, error } = await supabaseAdmin.from('deals').select('id, seller_id').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.seller_id !== req.appUser.id) {
    return res.status(403).json({ error: 'Only the seller can upload the Mulkiya' });
  }

  try {
    const ext = mediaType === 'image/png' ? 'png' : 'jpg';
    const imageUrl = await storageService.uploadUserImage(imageBase64, mediaType, `${deal.id}/mulkiya-back-${Date.now()}.${ext}`);
    await supabaseAdmin.from('deals').update({ mulkiya_back_image_url: imageUrl }).eq('id', deal.id);
  } catch (uploadErr) {
    logger.warn('Mulkiya back image upload failed — continuing with verification only', { error: uploadErr.message, dealId: deal.id });
  }

  const result = await documentVision.extractMulkiyaBack({ imageBase64, mediaType });
  if (!result.success) return res.status(422).json({ extracted: false, error: result.reason, reason: result.reason });

  await supabaseAdmin.from('deals').update({ mulkiya_back_verified: true }).eq('id', deal.id);

  return res.json({ extracted: true });
}

/**
 * POST /api/deals/:id/extract-settlement — LoanClear only. Accepts a base64
 * bank settlement letter photo, runs Claude Vision extraction, and returns the
 * authoritative settlement amount + loan reference for the seller to
 * confirm/edit before saving via PATCH /:id/details (as loan_amount/loan_account/
 * loan_bank). This figure supersedes the approximate loan estimate entered at
 * quote time. Never writes to the DB directly.
 */
async function extractSettlement(req, res) {
  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
  const imageError = validateImageUpload(imageBase64, mediaType);
  if (imageError) return res.status(400).json({ error: imageError });

  const { data: deal, error } = await supabaseAdmin.from('deals').select('id, product, seller_id').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.seller_id !== req.appUser.id) {
    return res.status(403).json({ error: 'Only the seller can upload the settlement letter' });
  }
  if (deal.product !== 'loanclear') return res.status(400).json({ error: 'Settlement letter extraction only applies to LoanClear deals' });

  try {
    const ext = mediaType === 'image/png' ? 'png' : 'jpg';
    const imageUrl = await storageService.uploadUserImage(imageBase64, mediaType, `${deal.id}/settlement-${Date.now()}.${ext}`);
    await supabaseAdmin.from('deals').update({ settlement_image_url: imageUrl }).eq('id', deal.id);
  } catch (uploadErr) {
    logger.warn('Settlement image upload failed — continuing with extraction only', { error: uploadErr.message, dealId: deal.id });
  }

  const result = await documentVision.extractSettlementLetter({ imageBase64, mediaType });
  if (!result.success) return res.status(422).json({ extracted: false, error: result.reason, reason: result.reason });

  await supabaseAdmin.from('deals').update({ settlement_verified: true }).eq('id', deal.id);

  return res.json({ extracted: true, data: result.data });
}

/**
 * POST /api/deals/:id/extract-bank-proof — accepts a base64 screenshot of the
 * seller's online banking app or a bank statement, runs Claude Vision
 * extraction, and cross-validates the extracted account holder name against
 * the seller's own verified identity (users.full_name, set during the KYC
 * stage) — so proceeds can't be routed to someone else's account. The raw
 * photo IS persisted (bank_proof_image_url, see 0008_bank_proof_image.sql)
 * regardless of whether extraction/validation succeeds, so admin can review
 * it if a genuine name-match edge case needs a manual look.
 */
async function extractBankProof(req, res) {
  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
  const imageError = validateImageUpload(imageBase64, mediaType);
  if (imageError) return res.status(400).json({ error: imageError });

  const { data: deal, error } = await supabaseAdmin.from('deals').select('id, seller_id').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.seller_id !== req.appUser.id) {
    return res.status(403).json({ error: 'Only the seller can upload proof of their proceeds account' });
  }

  try {
    const ext = mediaType === 'image/png' ? 'png' : 'jpg';
    const imageUrl = await storageService.uploadUserImage(imageBase64, mediaType, `${deal.id}/bank-proof-${Date.now()}.${ext}`);
    await supabaseAdmin.from('deals').update({ bank_proof_image_url: imageUrl }).eq('id', deal.id);
  } catch (uploadErr) {
    logger.warn('Bank proof image upload failed — continuing with extraction only', { error: uploadErr.message, dealId: deal.id });
  }

  const { data: seller } = await supabaseAdmin.from('users').select('full_name').eq('id', req.appUser.id).single();

  const result = await bankProofVerification.verifyBankProof({ imageBase64, mediaType, expectedHolderName: seller?.full_name });
  if (!result.success) return res.status(422).json({ extracted: false, error: result.reason, reason: result.reason });

  await supabaseAdmin.from('deals').update({ bank_proof_verified: true }).eq('id', deal.id);

  return res.json({
    extracted: true,
    data: { iban: result.iban, accountHolderName: result.accountHolderName, bankName: result.bankName },
  });
}

/**
 * POST /api/deals/:id/kyc/initiate — starts TrustIn/UAE Pass identity
 * verification for whichever party is calling (seller or buyer on this
 * deal, inferred from the logged-in user — never client-supplied, so a
 * party can only ever initiate their own verification). Returns a
 * verificationUrl to open in a popup; see trustInKycService.js. Replaces
 * the old manual Emirates ID upload + Claude Vision extraction flow for
 * this stage — TrustIn (ADGM/FSRA-regulated) legally requires direct
 * verification via UAE Pass, it cannot be white-labelled through us.
 */
async function initiateKyc(req, res) {
  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });

  const isSeller = deal.seller_id === req.appUser.id;
  const isBuyer = deal.buyer_id === req.appUser.id;
  if (!isSeller && !isBuyer) return res.status(403).json({ error: 'You are not a party to this deal' });

  const party = isSeller ? 'seller' : 'buyer';
  const backendBaseUrl = process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

  try {
    const result = await trustInKycService.initiateVerification({ deal, party, backendBaseUrl });
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Could not start identity verification — please try again' });
  }
}

/**
 * POST /api/deals/:id/generate-docs — manually (re)triggers document
 * generation for a deal. Normally this fires automatically on entering the
 * SIGNING stage (see dealFlowEngine), but this endpoint allows admin/manual re-generation.
 */
async function generateDocs(req, res) {
  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.seller_id !== req.appUser.id && req.appUser.role !== 'admin') {
    return res.status(403).json({ error: 'Only the seller or an admin can (re)generate documents' });
  }

  const [{ data: seller }, { data: buyer }, { data: partner }] = await Promise.all([
    deal.seller_id ? supabaseAdmin.from('users').select('*').eq('id', deal.seller_id).single() : { data: null },
    deal.buyer_id ? supabaseAdmin.from('users').select('*').eq('id', deal.buyer_id).single() : { data: null },
    deal.referral_partner_id ? supabaseAdmin.from('partners').select('*').eq('id', deal.referral_partner_id).single() : { data: null },
  ]);

  const doc001 = await docGen.generateDoc001(deal, seller, buyer);
  const doc002 = await docGen.generateDoc002(deal, seller);
  const doc003 = partner ? await docGen.generateDoc003(deal, partner) : null;
  const doc009 = deal.trustin_escrow_iban ? await docGen.generateDoc009(deal) : null;

  const updates = { doc001_url: doc001.url, doc002_url: doc002.url };
  if (doc003) updates.doc003_url = doc003.url;
  const { error: updateError } = await supabaseAdmin.from('deals').update(updates).eq('id', deal.id);
  if (updateError) {
    // Previously unchecked — a DB error here (e.g. the varchar(500) overflow
    // found in production) meant the response below claimed success with
    // real URLs while the deal row silently kept its old/null doc00X_url.
    return res.status(500).json({ error: `Documents were generated but failed to save: ${updateError.message}` });
  }

  return res.json({
    generated: { doc001: doc001.url, doc002: doc002.url, doc003: doc003?.url || null, doc009: doc009?.url || null },
  });
}

/** GET /api/deals/:id/docs — returns current document generation/signing status. */
async function getDocs(req, res) {
  const { data: deal, error } = await supabaseAdmin
    .from('deals')
    .select('seller_id, buyer_id, doc001_url, doc001_signed, doc002_url, doc002_signed, doc003_url, doc003_signed, transfer_cert_url')
    .eq('id', req.params.id)
    .single();

  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.seller_id !== req.appUser.id && deal.buyer_id !== req.appUser.id && req.appUser.role !== 'admin') {
    return res.status(403).json({ error: 'You do not have access to this deal' });
  }

  const { seller_id, buyer_id, ...docs } = deal;
  return res.json({ docs });
}

/**
 * POST /api/deals/:id/complete — seller has uploaded the RTA transfer
 * certificate; validates it and advances the deal to COMPLETE (which
 * triggers proceeds release + referral payout via dealFlowEngine).
 */
async function completeDeal(req, res) {
  const { transferCertUrl } = req.body;
  if (!transferCertUrl) return res.status(400).json({ error: 'transferCertUrl is required' });

  const { data: deal, error: dealErr } = await supabaseAdmin.from('deals').select('id, seller_id').eq('id', req.params.id).single();
  if (dealErr || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.seller_id !== req.appUser.id) {
    return res.status(403).json({ error: 'Only the seller can submit the transfer certificate' });
  }

  const { error: updateErr } = await supabaseAdmin.from('deals').update({ transfer_cert_url: transferCertUrl }).eq('id', req.params.id);
  if (updateErr) return res.status(500).json({ error: 'Could not save transfer certificate — please try again' });

  try {
    const updated = await dealFlowEngine.advanceStage(req.params.id, STAGES.COMPLETE);
    return res.json({ deal: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

const DETAILS_ALLOWED_FIELDS = [
  'vin',
  'plate',
  'loan_amount',
  'loan_account',
  'loan_bank',
  'seller_iban',
  'seller_acc_name',
  'seller_proc_bank',
  'make',
  'model',
  'year',
  'colour',
  'emirate',
  'mileage',
  'sale_price',
];

/**
 * PATCH /api/deals/:id/details — stage 4 (Vehicle & Financial Details): seller
 * submits VIN (from Mulkiya), loan account, agreed sale price, proceeds IBAN,
 * etc. Recalculates the ClearDrive fee and net proceeds if sale_price changes.
 */
async function updateDetails(req, res) {
  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.seller_id !== req.appUser.id) {
    return res.status(403).json({ error: 'Only the seller can edit these details' });
  }

  const updates = {};
  for (const field of DETAILS_ALLOWED_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: `No valid fields provided. Allowed: ${DETAILS_ALLOWED_FIELDS.join(', ')}` });
  }

  const salePrice = updates.sale_price ?? deal.sale_price;
  // Prefer a newly-submitted loan_amount (e.g. the authoritative figure just
  // confirmed from a bank settlement letter extraction) over the stored estimate.
  const loanAmount = updates.loan_amount !== undefined ? Number(updates.loan_amount) : deal.loan_amount || 0;
  const finesAmount = deal.fines_amount || 0;
  const cdFee = deal.product === 'loanclear' ? feeCalculator.calculateLoanClearFee(loanAmount) : feeCalculator.calculateSafePayFee(salePrice);
  updates.cd_fee = cdFee;
  updates.net_proceeds = feeCalculator.calculateNetProceeds({ salePrice, loanAmount, finesAmount, cdFee });

  const { data: updated, error: updateErr } = await supabaseAdmin.from('deals').update(updates).eq('id', deal.id).select().single();
  if (updateErr) return res.status(500).json({ error: 'Could not save deal details — please try again' });

  return res.json({ deal: updated });
}

const EDITABLE_ANYTIME_FIELDS = ['sale_price', 'mileage', 'emirate', 'seller_iban', 'seller_acc_name', 'seller_proc_bank'];

/**
 * PATCH /api/deals/:id/edit — lets the seller correct their own typed-in
 * details (sale price, mileage, emirate, proceeds bank account) at any point
 * before ESCROW, without reopening the whole stage flow. Deliberately excludes
 * every field sourced from a scanned document (plate/VIN/make/model/year/colour
 * from the Mulkiya, loan_amount/account/bank from the settlement letter) — those
 * are locked in once confirmed at the Details stage, so the official record
 * can't quietly be altered after the fact. A genuine misread there should be
 * fixed by re-uploading the document at that stage, not through this endpoint.
 *
 * If sale price/mileage/emirate change after DOC-001 was already generated
 * (deal currently in SIGNING), the document is regenerated and its signed
 * status reset, since DOC-001 prints those fields.
 */
async function editDealDetails(req, res) {
  const { data: deal, error } = await supabaseAdmin.from('deals').select('*').eq('id', req.params.id).single();
  if (error || !deal) return res.status(404).json({ error: 'Deal not found' });

  if (deal.seller_id !== req.appUser.id) {
    return res.status(403).json({ error: 'Only the seller can edit these details' });
  }

  if (stageIndex(deal.status) >= stageIndex(STAGES.ESCROW)) {
    return res.status(400).json({ error: 'This deal has moved into escrow — details can no longer be edited here' });
  }

  const updates = {};
  for (const field of EDITABLE_ANYTIME_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: `No valid fields provided. Allowed: ${EDITABLE_ANYTIME_FIELDS.join(', ')}` });
  }

  if (updates.sale_price !== undefined) {
    const salePrice = Number(updates.sale_price);
    const loanAmount = deal.loan_amount || 0;
    const finesAmount = deal.fines_amount || 0;
    const cdFee = deal.product === 'loanclear' ? feeCalculator.calculateLoanClearFee(loanAmount) : feeCalculator.calculateSafePayFee(salePrice);
    updates.cd_fee = cdFee;
    updates.net_proceeds = feeCalculator.calculateNetProceeds({ salePrice, loanAmount, finesAmount, cdFee });
  }

  // DOC-001 prints sale price / mileage / emirate — if it's already been
  // generated (deal at SIGNING) and one of those changed, it's now stale:
  // regenerate it and require both parties to sign again.
  const docPrintedFieldsChanged = ['sale_price', 'mileage', 'emirate'].some((f) => updates[f] !== undefined);
  const doc001AlreadyGenerated = deal.status === STAGES.SIGNING && deal.doc001_url;

  if (docPrintedFieldsChanged && doc001AlreadyGenerated) {
    const dealForDoc = { ...deal, ...updates };
    const [{ data: seller }, { data: buyer }] = await Promise.all([
      supabaseAdmin.from('users').select('*').eq('id', deal.seller_id).single(),
      deal.buyer_id ? supabaseAdmin.from('users').select('*').eq('id', deal.buyer_id).single() : { data: null },
    ]);
    updates.doc001_url = (await docGen.generateDoc001(dealForDoc, seller, buyer)).url;
    updates.doc001_signed = false;
    updates.doc001_signnow_id = null;
  }

  const { data: updated, error: updateErr } = await supabaseAdmin.from('deals').update(updates).eq('id', deal.id).select().single();
  if (updateErr) return res.status(500).json({ error: 'Could not save changes — please try again' });

  return res.json({ deal: updated });
}

module.exports = {
  createDeal,
  joinDeal,
  getDealByRef,
  attachBuyer,
  getDeal,
  listMine,
  advanceStage,
  verifyFines,
  extractMulkiya,
  extractMulkiyaBack,
  extractSettlement,
  extractBankProof,
  initiateKyc,
  generateDocs,
  getDocs,
  completeDeal,
  updateDetails,
  editDealDetails,
};
