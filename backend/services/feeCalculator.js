// Fee calculator service
// All monetary values are in AED. All calculations are pure functions — no I/O —
// so they are trivially unit-testable and reusable across the deal flow.

/**
 * LoanClear fee — tiered flat/percentage structure based on loan amount.
 *   < 150,000            => flat AED 4,000
 *   150,000 - 300,000     => 3%
 *   300,000 - 500,000     => 2.5%
 *   500,000+              => 2%
 * @param {number} loanAmount
 * @returns {number} fee in AED, rounded to 2 decimals
 */
function calculateLoanClearFee(loanAmount) {
  if (typeof loanAmount !== 'number' || isNaN(loanAmount) || loanAmount < 0) {
    throw new Error('loanAmount must be a positive number');
  }

  let fee;
  if (loanAmount < 150000) {
    fee = 4000;
  } else if (loanAmount < 300000) {
    fee = loanAmount * 0.03;
  } else if (loanAmount < 500000) {
    fee = loanAmount * 0.025;
  } else {
    fee = loanAmount * 0.02;
  }

  return roundToTwo(fee);
}

/**
 * SafePay fee — flat 1.5% of sale price. Minimum transaction size AED 100,000
 * is enforced by the caller (quote controller), not here.
 * @param {number} salePrice
 * @returns {number} fee in AED
 */
function calculateSafePayFee(salePrice) {
  if (typeof salePrice !== 'number' || isNaN(salePrice) || salePrice < 0) {
    throw new Error('salePrice must be a positive number');
  }
  return roundToTwo(salePrice * 0.015);
}

/**
 * Net proceeds to the seller = sale price - outstanding loan - traffic fines - ClearDrive fee.
 * For SafePay deals, loanAmount is 0.
 * @param {object} params
 * @param {number} params.salePrice
 * @param {number} params.loanAmount
 * @param {number} params.finesAmount
 * @param {number} params.cdFee
 * @returns {number} net proceeds in AED
 */
function calculateNetProceeds({ salePrice, loanAmount = 0, finesAmount = 0, cdFee }) {
  if (typeof salePrice !== 'number' || isNaN(salePrice)) {
    throw new Error('salePrice must be a number');
  }
  const net = salePrice - (loanAmount || 0) - (finesAmount || 0) - (cdFee || 0);
  return roundToTwo(net);
}

/**
 * Dealer/Broker referral fee — tiered by loan/sale amount, with a loyalty
 * tier (after 20 completed referrals) paying a higher flat fee.
 * @param {number} dealValue - loanAmount for LoanClear, salePrice for SafePay
 * @param {boolean} isLoyaltyTier
 * @returns {number} referral fee in AED
 */
function calculateReferralFee(dealValue, isLoyaltyTier = false) {
  if (typeof dealValue !== 'number' || isNaN(dealValue) || dealValue < 0) {
    throw new Error('dealValue must be a positive number');
  }

  if (dealValue < 150000) return isLoyaltyTier ? 750 : 500;
  if (dealValue < 300000) return isLoyaltyTier ? 1000 : 750;
  if (dealValue < 500000) return isLoyaltyTier ? 1500 : 1000;
  return isLoyaltyTier ? 2000 : 1500;
}

/**
 * A partner becomes "loyalty" tier after 20 completed referrals.
 * @param {number} totalCompletedDeals
 * @returns {boolean}
 */
function isLoyaltyTier(totalCompletedDeals) {
  return (totalCompletedDeals || 0) >= 20;
}

function roundToTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = {
  calculateLoanClearFee,
  calculateSafePayFee,
  calculateNetProceeds,
  calculateReferralFee,
  isLoyaltyTier,
};
