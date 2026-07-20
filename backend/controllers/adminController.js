// Admin controller — dashboard stats and full deal listing for the ops team.

const { supabaseAdmin } = require('../config/supabase');
const { STAGES } = require('../utils/dealStages');
const dealFlowEngine = require('../services/dealFlowEngine');
const logger = require('../utils/logger');

// Fields an admin may manually flip while TrustIn KYC / SignNow signing aren't
// yet live integrations. Deliberately not exposed to sellers/buyers directly —
// this is the "manual override for edge cases" control from the admin dashboard spec.
const OVERRIDABLE_FIELDS = ['seller_kyc_complete', 'buyer_kyc_complete', 'doc001_signed', 'doc002_signed', 'doc003_signed'];

const STUCK_THRESHOLD_MS = 2 * 60 * 60 * 1000; // flag if unchanged >2hrs, per design spec

/** GET /api/admin/deals — all deals, most recent first, with a "stuck" flag. */
async function getAllDeals(req, res) {
  const { status, product } = req.query;

  let query = supabaseAdmin.from('deals').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (product) query = query.eq('product', product);

  const { data: deals, error } = await query;
  if (error) return res.status(500).json({ error: 'Could not load deals — please try again' });

  const now = Date.now();
  const enriched = deals.map((d) => ({
    ...d,
    stuck: ![STAGES.COMPLETE, STAGES.CANCELLED].includes(d.status) && now - new Date(d.updated_at).getTime() > STUCK_THRESHOLD_MS,
  }));

  return res.json({ deals: enriched });
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
 * PUT /api/admin/deals/:id/override — manually flips KYC-complete / document-signed
 * flags for edge cases (e.g. TrustIn/SignNow not yet integrated, or a signature
 * collected outside the platform). Only fields in OVERRIDABLE_FIELDS are accepted.
 * If a doc*_signed override completes the signing stage, the deal auto-advances to ESCROW.
 */
async function manualOverride(req, res) {
  const updates = {};
  for (const field of OVERRIDABLE_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = Boolean(req.body[field]);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: `No valid fields provided. Allowed: ${OVERRIDABLE_FIELDS.join(', ')}` });
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

  const afterSignCheck = await dealFlowEngine.checkAndAdvanceIfAllSigned(updated.id);
  return res.json({ deal: afterSignCheck || updated });
}

module.exports = { getAllDeals, getStats, manualOverride };
