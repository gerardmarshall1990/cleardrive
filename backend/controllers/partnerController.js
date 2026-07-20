// Partner controller — dealer/broker registration and referral tracking.

const { supabaseAdmin } = require('../config/supabase');
const logger = require('../utils/logger');

/** POST /api/partners */
async function createPartner(req, res) {
  const { name, company, phone, email, type, bankDetails } = req.body;

  if (!name || !phone || !['dealer', 'broker'].includes(type)) {
    return res.status(400).json({ error: 'name, phone, and type ("dealer" or "broker") are required' });
  }

  const { data: partner, error } = await supabaseAdmin
    .from('partners')
    .insert({ name, company, phone, email, type, bank_details: bankDetails || null })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create partner', { error: error.message });
    return res.status(500).json({ error: 'Could not create partner — please try again' });
  }

  return res.status(201).json({ partner });
}

/**
 * Looks up the calling dealer/broker's own partner row. There's no partners.user_id
 * column, so the link is by phone number (set to match at signup — see authController.js).
 */
async function findMyPartner(appUser) {
  return supabaseAdmin.from('partners').select('*').eq('phone', appUser.phone).eq('type', appUser.role).maybeSingle();
}

/** GET /api/partners/mine — the calling dealer/broker's own partner profile. */
async function getMyPartner(req, res) {
  const { data: partner, error } = await findMyPartner(req.appUser);
  if (error || !partner) return res.status(404).json({ error: 'No partner profile found for this account' });
  return res.json({ partner });
}

/** GET /api/partners/mine/deals — the calling dealer/broker's referred deals + earnings. */
async function getMyPartnerDeals(req, res) {
  const { data: partner, error: partnerErr } = await findMyPartner(req.appUser);
  if (partnerErr || !partner) return res.status(404).json({ error: 'No partner profile found for this account' });

  req.params.id = partner.id;
  return getPartnerDeals(req, res);
}

/** GET /api/partners/:id */
async function getPartner(req, res) {
  const { data: partner, error } = await supabaseAdmin.from('partners').select('*').eq('id', req.params.id).single();
  if (error || !partner) return res.status(404).json({ error: 'Partner not found' });
  return res.json({ partner });
}

/** GET /api/partners/:id/deals — all deals referred by this partner, with earnings summary. */
async function getPartnerDeals(req, res) {
  const { data: partner, error: partnerErr } = await supabaseAdmin.from('partners').select('*').eq('id', req.params.id).single();
  if (partnerErr || !partner) return res.status(404).json({ error: 'Partner not found' });

  const { data: deals, error } = await supabaseAdmin
    .from('deals')
    .select('*')
    .eq('referral_partner_id', req.params.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Could not load partner deals — please try again' });

  const earningsThisMonth = deals
    .filter((d) => d.referral_fee_paid && isThisMonth(d.updated_at))
    .reduce((sum, d) => sum + Number(d.referral_fee || 0), 0);

  return res.json({
    partner,
    deals,
    earnings: {
      thisMonth: earningsThisMonth,
      allTime: Number(partner.total_earned || 0),
    },
  });
}

function isThisMonth(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

module.exports = { createPartner, getPartner, getPartnerDeals, getMyPartner, getMyPartnerDeals };
