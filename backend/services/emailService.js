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

function formatAed(value) {
  if (value === null || value === undefined || isNaN(value)) return null;
  return `AED ${Number(value).toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function vehicleTitle(deal) {
  const parts = [deal.year, deal.make, deal.model].filter(Boolean);
  return parts.length ? parts.join(' ') : deal.plate;
}

// ---------- Message templates ----------

const templates = {
  joinInvite: (deal, role, link) => {
    const productLabel = deal.product === 'loanclear' ? 'LoanClear' : 'SafePay';
    const priceLabel = formatAed(deal.sale_price);
    const title = vehicleTitle(deal);
    const isBuyer = role === 'buyer';
    const introLine = isBuyer
      ? `You've been named as the <strong>buyer</strong> on a vehicle sale — the seller is ready to proceed as soon as you confirm.`
      : `You've been named as the <strong>seller</strong> on a vehicle sale — the buyer is ready to proceed as soon as you confirm.`;

    return {
      subject: `${title} — AED ${deal.sale_price ? Number(deal.sale_price).toLocaleString('en-AE') : ''} — you're invited to Deal ${deal.ref}`,
      html: `
      <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff;">
        <div style="background: #0a1a3a; padding: 28px 32px; border-radius: 12px 12px 0 0;">
          <span style="color: #d4af37; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600;">ClearDrive</span>
          <h1 style="color: #ffffff; font-size: 20px; margin: 10px 0 0; font-weight: 700;">Welcome — you've been invited to a deal</h1>
        </div>

        <div style="border: 1px solid #e7e7ee; border-top: none; border-radius: 0 0 12px 12px; padding: 32px;">
          <p style="color: #333333; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">${introLine}</p>

          <div style="border: 1px solid #e7e7ee; border-radius: 10px; overflow: hidden; margin-bottom: 24px;">
            <div style="background: #f7f7fa; padding: 14px 20px; border-bottom: 1px solid #e7e7ee; display: flex; justify-content: space-between;">
              <span style="color: #0a1a3a; font-weight: 700; font-size: 15px;">${title}</span>
              <span style="float: right; color: #0a1a3a; font-weight: 700; font-size: 15px;">Deal ${deal.ref}</span>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              ${deal.make || deal.model ? `
              <tr>
                <td style="padding: 12px 20px; color: #888888; border-bottom: 1px solid #f0f0f4;">Make / Model</td>
                <td style="padding: 12px 20px; color: #0a1a3a; font-weight: 600; text-align: right; border-bottom: 1px solid #f0f0f4;">${[deal.make, deal.model].filter(Boolean).join(' ') || '—'}</td>
              </tr>` : ''}
              ${deal.year ? `
              <tr>
                <td style="padding: 12px 20px; color: #888888; border-bottom: 1px solid #f0f0f4;">Year</td>
                <td style="padding: 12px 20px; color: #0a1a3a; font-weight: 600; text-align: right; border-bottom: 1px solid #f0f0f4;">${deal.year}</td>
              </tr>` : ''}
              <tr>
                <td style="padding: 12px 20px; color: #888888; border-bottom: 1px solid #f0f0f4;">Plate</td>
                <td style="padding: 12px 20px; color: #0a1a3a; font-weight: 600; text-align: right; border-bottom: 1px solid #f0f0f4;">${deal.plate}</td>
              </tr>
              <tr>
                <td style="padding: 12px 20px; color: #888888; border-bottom: 1px solid #f0f0f4;">Sale Price</td>
                <td style="padding: 12px 20px; color: #0a1a3a; font-weight: 600; text-align: right; border-bottom: 1px solid #f0f0f4;">${priceLabel || 'To be confirmed'}</td>
              </tr>
              <tr>
                <td style="padding: 12px 20px; color: #888888;">Product</td>
                <td style="padding: 12px 20px; color: #0a1a3a; font-weight: 600; text-align: right;">${productLabel}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${link}" style="display: inline-block; background: #d4af37; color: #0a1a3a; padding: 14px 32px;
            border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px;">
              Confirm you're the ${role} for this deal
            </a>
          </div>

          <p style="color: #888888; font-size: 13px; line-height: 1.6; margin: 0;">
            If you don't have a ClearDrive account yet, this link will take you through a quick sign-up, then straight
            into the deal. Already have an account? Just log in and you'll be attached automatically.
          </p>
        </div>

        <p style="color: #aaaaaa; font-size: 12px; text-align: center; margin: 20px 0 0;">
          ClearDrive · LUXE F.Z.E · This invitation was sent because someone entered your contact details when
          creating Deal ${deal.ref}. If this wasn't expected, you can safely ignore this email.
        </p>
      </div>`,
    };
  },
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
