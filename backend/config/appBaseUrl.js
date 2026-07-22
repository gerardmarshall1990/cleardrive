// Single source of truth for the frontend base URL used to build links sent
// out in emails/WhatsApp messages (join links, KYC links, signing links).
//
// Previously this was duplicated with two different, inconsistent fallbacks
// (dealController.js used 'http://localhost:5173', dealFlowEngine.js used
// 'https://app.cleardriveuae.com') — meaning some links would silently
// resolve to a dev-only address in production depending on which file built
// them, while others pointed at a domain that was never confirmed live.
// Set APP_BASE_URL explicitly for every real deployment.
const logger = require('../utils/logger');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

if (!process.env.APP_BASE_URL && process.env.NODE_ENV === 'production') {
  logger.warn('APP_BASE_URL is not set in production — links sent via email/WhatsApp will point at http://localhost:5173');
}

module.exports = { APP_BASE_URL };
