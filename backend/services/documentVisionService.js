// Claude Vision document extraction service — generic OCR/extraction for the
// three document-driven autofill flows: Mulkiya (vehicle registration card),
// bank settlement letters (LoanClear only), and Emirates ID (seller + buyer KYC).
//
// Design mirrors finesVerificationService.js: each function calls Claude Vision
// with a strict JSON-only prompt, parses the result defensively (Claude
// sometimes wraps JSON in prose/code fences), and returns a uniform
// { success, data, reason } shape. Extraction never writes to the DB directly —
// callers show the extracted data to the user for a confirm/edit step, then
// save it via the normal deal/detail/KYC update endpoints. This keeps document
// extraction as the primary data source while manual typing remains a fallback
// if extraction fails or the user needs to correct something.

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-5';

/** Claude sometimes wraps JSON in prose or code fences — strip to the first {...} block. */
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : '{}';
}

async function callVision({ imageBase64, mediaType, prompt, maxTokens = 512 }) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return JSON.parse(extractJson(textBlock?.text || '{}'));
}

const MULKIYA_PROMPT =
  'This is a UAE vehicle registration card (Mulkiya). Extract the following fields exactly as printed. ' +
  'Return JSON only, no other text, in exactly this shape: ' +
  '{"plate": string, "chassis_number": string, "make": string, "model": string, "year": string, "colour": string, "legible": boolean}. ' +
  'The plate should include the emirate name if shown (e.g. "Dubai A 12345"). ' +
  'chassis_number is the VIN. Set legible to true only if you could clearly read plate, chassis_number, make, model, and year.';

/**
 * Extracts vehicle details from a Mulkiya (UAE vehicle registration card) photo.
 * @returns {Promise<{success:boolean, data?:{plate,chassisNumber,make,model,year,colour}, reason?:string}>}
 */
async function extractMulkiya({ imageBase64, mediaType }) {
  if (!imageBase64) return { success: false, reason: 'No image provided' };

  let extracted;
  try {
    extracted = await callVision({ imageBase64, mediaType, prompt: MULKIYA_PROMPT });
  } catch (err) {
    logger.error('Claude Vision Mulkiya extraction failed', { error: err.message });
    return { success: false, reason: 'Could not read the Mulkiya photo — please retry with a clearer image, or enter details manually' };
  }

  if (!extracted.legible || !extracted.chassis_number || !extracted.make || !extracted.model) {
    return { success: false, reason: 'Could not clearly read the Mulkiya — please retry with a clearer photo, or enter details manually' };
  }

  return {
    success: true,
    data: {
      plate: extracted.plate || '',
      chassisNumber: extracted.chassis_number,
      make: extracted.make,
      model: extracted.model,
      year: extracted.year || '',
      colour: extracted.colour || '',
    },
  };
}

const SETTLEMENT_PROMPT =
  'This is a bank loan settlement letter for a vehicle finance account in the UAE. Extract the exact settlement/payoff amount ' +
  'and the loan/finance account reference number. Return JSON only, no other text, in exactly this shape: ' +
  '{"settlement_amount_aed": number, "loan_reference_number": string, "bank_name": string (or null if not visible), "legible": boolean}. ' +
  'The settlement amount must be the exact figure stated in the letter (in AED), not rounded or estimated. ' +
  'Set legible to true only if both the settlement amount and loan reference number are clearly printed in the document.';

/**
 * Extracts the authoritative settlement amount + loan reference from a bank
 * settlement letter (LoanClear only). This figure supersedes the seller's
 * approximate loan-amount estimate entered at quote time.
 * @returns {Promise<{success:boolean, data?:{settlementAmount,loanReferenceNumber,bankName}, reason?:string}>}
 */
async function extractSettlementLetter({ imageBase64, mediaType }) {
  if (!imageBase64) return { success: false, reason: 'No image provided' };

  let extracted;
  try {
    extracted = await callVision({ imageBase64, mediaType, prompt: SETTLEMENT_PROMPT });
  } catch (err) {
    logger.error('Claude Vision settlement letter extraction failed', { error: err.message });
    return { success: false, reason: 'Could not read the settlement letter — please retry with a clearer image, or enter the amount manually' };
  }

  if (!extracted.legible || extracted.settlement_amount_aed === undefined || extracted.settlement_amount_aed === null || !extracted.loan_reference_number) {
    return { success: false, reason: 'Could not clearly read the settlement amount and loan reference — please retry with a clearer photo, or enter details manually' };
  }

  return {
    success: true,
    data: {
      settlementAmount: Number(extracted.settlement_amount_aed),
      loanReferenceNumber: extracted.loan_reference_number,
      bankName: extracted.bank_name || null,
    },
  };
}

const EMIRATES_ID_PROMPT =
  'This is a UAE Emirates ID card (front side). Extract the full name and the Emirates ID number exactly as printed. ' +
  'Return JSON only, no other text, in exactly this shape: ' +
  '{"full_name": string, "eid_number": string, "nationality": string (or null if not visible), "legible": boolean}. ' +
  'The eid_number should be in the format 784-YYYY-XXXXXXX-X. Set legible to true only if both full name and EID number are clearly legible.';

/**
 * Extracts identity fields from an Emirates ID photo, for either the seller or
 * buyer's KYC step (both share the same document format and users.emirates_id /
 * users.full_name columns).
 * @returns {Promise<{success:boolean, data?:{fullName,eidNumber,nationality}, reason?:string}>}
 */
async function extractEmiratesId({ imageBase64, mediaType }) {
  if (!imageBase64) return { success: false, reason: 'No image provided' };

  let extracted;
  try {
    extracted = await callVision({ imageBase64, mediaType, prompt: EMIRATES_ID_PROMPT });
  } catch (err) {
    logger.error('Claude Vision Emirates ID extraction failed', { error: err.message });
    return { success: false, reason: 'Could not read the Emirates ID — please retry with a clearer image, or enter details manually' };
  }

  if (!extracted.legible || !extracted.full_name || !extracted.eid_number) {
    return { success: false, reason: 'Could not clearly read the name and EID number — please retry with a clearer photo, or enter details manually' };
  }

  return {
    success: true,
    data: {
      fullName: extracted.full_name,
      eidNumber: extracted.eid_number,
      nationality: extracted.nationality || null,
    },
  };
}

module.exports = { extractMulkiya, extractSettlementLetter, extractEmiratesId };
