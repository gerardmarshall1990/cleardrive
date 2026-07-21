// Email service — Resend REST API (single API key, no SDK needed — sent via the
// already-present axios dependency). MOCK implementation until a real Resend
// API key is provided. Every email is logged to the console AND persisted to
// automation_log so behaviour is fully auditable during testing. Swapping to
// real sending later means: set EMAIL_MOCK_MODE=false and provide
// RESEND_API_KEY — only sendRaw() below needs to change its implementation.

const axios = require('axios');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../config/supabase');

const MOCK_MODE = process.env.EMAIL_MOCK_MODE !== 'false';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || 'ClearDrive <no-reply@cleardriveuae.com>';
const TIMEOUT_MS = 15000;

/**
 * Sends a raw email. In mock mode, logs to console + DB only.
 * @param {string} to - recipient email address
 * @param {string} subject
 * @param {string} html
 * @param {string} templateName - identifier used in automation_log.action
 * @param {string|null} dealId
 */
async function sendRaw(to, subject, html, templateName, dealId = null) {
  if (!to) {
    logger.warn('Email send skipped — no recipient address', { templateName, dealId });
    await logAction(dealId, templateName, 'skipped', { reason: 'no email address', subject });
    return { success: false, reason: 'no email address' };
  }

  if (MOCK_MODE) {
    logger.mock('Email', `-> ${to} [${templateName}] ${subject}`, { html });
    await logAction(dealId, templateName, 'sent', { to, subject, html });
    return { success: true, mock: true };
  }

  try {
    await axios.post(
      'https://api.resend.com/emails',
      { from: FROM_EMAIL, to, subject, html },
      { headers: { Authorization: `Bearer ${RESEND_API_KEY}` }, timeout: TIMEOUT_MS }
    );
    await logAction(dealId, templateName, 'sent', { to, subject, html });
    return { success: true };
  } catch (err) {
    logger.error('Email send failed', { error: err.message, to, templateName });
    await logAction(dealId, templateName, 'failed', { to, subject, html, error: err.message });
    return { success: false, reason: err.message };
  }
}

async function logAction(dealId, action, status, payload) {
  await supabaseAdmin.from('automation_log').insert({ deal_id: dealId, action: `email_${action}`, status, payload });
}

// ---------- Message templates ----------

const templates = {
  joinInvite: (deal, role, link) => ({
    subject: `You're invited to Deal ${deal.ref} on ClearDrive`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0a1a3a;">You've been invited to a ClearDrive deal</h2>
        <p>You've been added as the <strong>${role}</strong> on Deal <strong>${deal.ref}</strong>
        (${deal.product === 'loanclear' ? 'LoanClear' : 'SafePay'} — plate ${deal.plate}).</p>
        <p><a href="${link}" style="display:inline-block;background:#d4af37;color:#0a1a3a;padding:12px 24px;
        border-radius:8px;text-decoration:none;font-weight:bold;">Open the deal</a></p>
        <p style="color:#666;font-size:13px;">If you don't have a ClearDrive account yet, this link will take you
        through a quick sign-up, then straight into the deal. Already have an account? Just log in and you'll be
        attached automatically.</p>
      </div>`,
  }),
};

// ---------- Convenience senders ----------

async function sendJoinInvite(deal, email, role, link) {
  const { subject, html } = templates.joinInvite(deal, role, link);
  return sendRaw(email, subject, html, `join_invite_${role}`, deal.id);
}

module.exports = {
  sendRaw,
  templates,
  sendJoinInvite,
  MOCK_MODE,
};
