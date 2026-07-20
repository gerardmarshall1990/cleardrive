// Claude Vision fines verification service
// Reads a seller's RTA Dubai app screenshot and extracts the plate number and
// total traffic fines in AED, then cross-validates against the deal record.

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');
const { isOlderThanHours } = require('../utils/timezone');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VISION_PROMPT =
  'Extract the vehicle plate number and total traffic fines amount in AED from this RTA Dubai app screenshot. ' +
  'Return JSON only, no other text, in exactly this shape: ' +
  '{"plate": string, "fines_aed": number, "screenshot_date": string (ISO 8601 if visible, else null), "verified": boolean}. ' +
  'Set verified to true only if both a plate number and a fines amount (which may be 0) are clearly legible in the screenshot.';

/**
 * Verifies an RTA fines screenshot against the deal's expected plate number.
 *
 * @param {object} params
 * @param {string} params.imageBase64 - raw base64 image data (no data: prefix)
 * @param {string} params.mediaType - e.g. 'image/png' or 'image/jpeg'
 * @param {string} params.expectedPlate - plate number on the deal record
 * @returns {Promise<{success:boolean, plate?:string, finesAed?:number, screenshotDate?:string, reason?:string}>}
 */
async function verifyFinesScreenshot({ imageBase64, mediaType, expectedPlate }) {
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
    logger.error('Claude Vision fines extraction failed', { error: err.message });
    return { success: false, reason: 'Could not read screenshot — please retry with a clearer image' };
  }

  if (!extracted.verified || !extracted.plate || extracted.fines_aed === undefined || extracted.fines_aed === null) {
    return { success: false, reason: 'Could not clearly read plate number and fines amount — please retry' };
  }

  // Normalise plates for comparison: strip spaces/dashes, uppercase
  const normalise = (p) => (p || '').toString().toUpperCase().replace(/[\s-]/g, '');
  if (expectedPlate && normalise(extracted.plate) !== normalise(expectedPlate)) {
    return { success: false, reason: `Plate mismatch — screenshot shows ${extracted.plate}, expected ${expectedPlate}` };
  }

  // Validate screenshot is not older than 24 hours, if a date was extracted
  if (extracted.screenshot_date) {
    if (isOlderThanHours(extracted.screenshot_date, 24)) {
      return { success: false, reason: 'Screenshot is older than 24 hours — please take a fresh screenshot and retry' };
    }
  }

  return {
    success: true,
    plate: extracted.plate,
    finesAed: Number(extracted.fines_aed),
    screenshotDate: extracted.screenshot_date || new Date().toISOString(),
  };
}

/** Claude sometimes wraps JSON in prose or code fences — strip to the first {...} block. */
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : '{}';
}

module.exports = { verifyFinesScreenshot };
