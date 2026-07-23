// Claude Vision bank-proof verification service
// Reads a seller's online banking screenshot or bank statement, extracts the
// IBAN and account holder name, and cross-validates the holder name against
// the seller's own verified identity (users.full_name, populated during the
// KYC stage) — so a seller can't route proceeds to someone else's account.
// Mirrors finesVerificationService.js's extract + cross-validate + hard-reject
// pattern, adapted for fuzzy name matching (bank statements often show a name
// in a different word order or with a middle name abbreviated, unlike a plate
// number which must match exactly).

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VISION_PROMPT =
  'This is a screenshot of a UAE bank account (online banking app or a bank statement). Extract the IBAN and the ' +
  'account holder name exactly as shown. Return JSON only, no other text, in exactly this shape: ' +
  '{"iban": string, "account_holder_name": string, "bank_name": string (or null if not visible), "legible": boolean}. ' +
  'The account holder name must be transcribed in Latin script exactly as printed, without reordering or abbreviating any part of it. ' +
  'Set legible to true only if both the IBAN and the account holder name are clearly legible.';

/** Claude sometimes wraps JSON in prose or code fences — strip to the first {...} block. */
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : '{}';
}

// Normalises a name for fuzzy comparison: uppercase, strip anything that
// isn't a letter or space, collapse whitespace, split into word tokens.
// Bank statements sometimes print a name in a different order or drop a
// middle name that IS present on the Emirates ID (or vice versa), so an exact
// string match would reject too many genuine matches — instead we require
// every token of the SHORTER name to appear in the LONGER name.
function tokenise(name) {
  return (name || '')
    .toString()
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

function namesMatch(extractedName, expectedName) {
  const a = tokenise(extractedName);
  const b = tokenise(expectedName);
  if (a.length === 0 || b.length === 0) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.every((token) => longer.includes(token));
}

/**
 * Verifies a seller's bank proof screenshot against their own verified name.
 *
 * @param {object} params
 * @param {string} params.imageBase64 - raw base64 image data (no data: prefix)
 * @param {string} params.mediaType - e.g. 'image/png' or 'image/jpeg'
 * @param {string} params.expectedHolderName - the seller's verified full name (users.full_name, from KYC)
 * @returns {Promise<{success:boolean, iban?:string, accountHolderName?:string, bankName?:string, reason?:string}>}
 */
async function verifyBankProof({ imageBase64, mediaType, expectedHolderName }) {
  if (!imageBase64) {
    return { success: false, reason: 'No image provided' };
  }

  let extracted;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: imageBase64 } },
            { type: 'text', text: VISION_PROMPT },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    extracted = JSON.parse(extractJson(textBlock?.text || '{}'));
  } catch (err) {
    logger.error('Claude Vision bank proof extraction failed', { error: err.message });
    return { success: false, reason: 'Could not read the screenshot — please retry with a clearer image' };
  }

  if (!extracted.legible || !extracted.iban || !extracted.account_holder_name) {
    return { success: false, reason: 'Could not clearly read the IBAN and account holder name — please retry with a clearer photo' };
  }

  if (expectedHolderName && !namesMatch(extracted.account_holder_name, expectedHolderName)) {
    return {
      success: false,
      reason: `The account holder name on this screenshot (${extracted.account_holder_name}) doesn't match your verified name (${expectedHolderName}) — the proceeds account must be in your own name`,
    };
  }

  return {
    success: true,
    iban: extracted.iban,
    accountHolderName: extracted.account_holder_name,
    bankName: extracted.bank_name || null,
  };
}

module.exports = { verifyBankProof };
