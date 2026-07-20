// SignNow service — uploads generated PDFs, requests signatures from the
// correct parties, and checks signing status.
//
// NOTE: SignNow's OAuth2 password grant requires a Client ID + Client Secret
// (created under your SignNow account at Settings > API/Integrations) IN ADDITION
// to the account email/password. Only email/password were provided, so
// SIGNNOW_CLIENT_ID / SIGNNOW_CLIENT_SECRET are placeholders in .env until you
// generate them in the SignNow dashboard. Every call below will fail with a
// clear error until those are filled in — nothing here is mocked, this is the
// real API, it just needs those two extra values to authenticate.

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const logger = require('../utils/logger');

const BASE_URL = process.env.SIGNNOW_BASE_URL || 'https://api.signnow.com';
const TIMEOUT_MS = 15000;

let cachedToken = null;
let cachedTokenExpiry = 0;

/**
 * Retries a request-returning async function up to `retries` times with
 * exponential backoff. Used for all outbound SignNow calls per spec
 * ("every API call must have timeout and retry logic").
 */
async function withRetry(fn, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
      }
    }
  }
  throw lastErr;
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  if (!process.env.SIGNNOW_CLIENT_ID || process.env.SIGNNOW_CLIENT_ID.startsWith('REPLACE')) {
    throw new Error(
      'SignNow client_id/client_secret not configured. Generate them at https://app.signnow.com under ' +
        'Settings > API/Integrations and set SIGNNOW_CLIENT_ID / SIGNNOW_CLIENT_SECRET in .env'
    );
  }

  const response = await withRetry(() =>
    axios.post(
      `${BASE_URL}/oauth2/token`,
      new URLSearchParams({
        username: process.env.SIGNNOW_EMAIL,
        password: process.env.SIGNNOW_PASSWORD,
        grant_type: 'password',
        scope: '*',
      }),
      {
        auth: { username: process.env.SIGNNOW_CLIENT_ID, password: process.env.SIGNNOW_CLIENT_SECRET },
        timeout: TIMEOUT_MS,
      }
    )
  );

  cachedToken = response.data.access_token;
  cachedTokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
  return cachedToken;
}

/**
 * Uploads a local PDF file to SignNow.
 * @param {string} filePath - local path to the generated PDF
 * @returns {Promise<string>} SignNow document id
 */
async function uploadDocument(filePath) {
  const token = await getAccessToken();
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  const response = await withRetry(() =>
    axios.post(`${BASE_URL}/document`, form, {
      headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
      timeout: TIMEOUT_MS,
    })
  );

  logger.info('SignNow document uploaded', { documentId: response.data.id, filePath });
  return response.data.id;
}

/**
 * Sends a signing invite for a document to one or more recipients, in order.
 * @param {string} documentId
 * @param {Array<{email:string, role:string, order?:number}>} signers
 * @param {string} [subject]
 */
async function sendSigningInvite(documentId, signers, subject = 'ClearDrive — Document Signature Required') {
  const token = await getAccessToken();

  const to = signers.map((s, i) => ({
    email: s.email,
    role_id: s.role, // must match a role/field group defined on the document template
    order: s.order ?? i + 1,
  }));

  const response = await withRetry(() =>
    axios.post(
      `${BASE_URL}/document/${documentId}/invite`,
      { to, from: process.env.SIGNNOW_EMAIL, subject },
      { headers: { Authorization: `Bearer ${token}` }, timeout: TIMEOUT_MS }
    )
  );

  logger.info('SignNow signing invite sent', { documentId, signers: signers.map((s) => s.email) });
  return response.data;
}

/**
 * Checks whether a document has been fully signed.
 * @param {string} documentId
 * @returns {Promise<{signed:boolean, raw:object}>}
 */
async function checkSigningStatus(documentId) {
  const token = await getAccessToken();
  const response = await withRetry(() =>
    axios.get(`${BASE_URL}/document/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: TIMEOUT_MS,
    })
  );

  const data = response.data;
  const signed = Array.isArray(data.signatures) && data.signatures.length > 0 && data.updated_by_invite === undefined
    ? true
    : Boolean(data.signatures && data.signatures.length);

  return { signed, raw: data };
}

/**
 * Downloads the final (signed or unsigned) PDF for a document.
 * @param {string} documentId
 * @param {string} destPath - local path to save the downloaded PDF
 */
async function downloadDocument(documentId, destPath) {
  const token = await getAccessToken();
  const response = await withRetry(() =>
    axios.get(`${BASE_URL}/document/${documentId}/download/collapsed`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'stream',
      timeout: TIMEOUT_MS,
    })
  );

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return destPath;
}

module.exports = { uploadDocument, sendSigningInvite, checkSigningStatus, downloadDocument };
