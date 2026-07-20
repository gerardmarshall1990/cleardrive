// Client-side mirror of backend/services/feeCalculator.js — used only for the
// LIVE quote preview as the user types. The server recalculates and persists
// the authoritative figures on submit; this never needs to be trusted for money movement.
export function calculateLoanClearFee(loanAmount) {
  if (typeof loanAmount !== 'number' || isNaN(loanAmount) || loanAmount < 0) return 0;
  let fee;
  if (loanAmount < 150000) fee = 4000;
  else if (loanAmount < 300000) fee = loanAmount * 0.03;
  else if (loanAmount < 500000) fee = loanAmount * 0.025;
  else fee = loanAmount * 0.02;
  return roundToTwo(fee);
}

export function calculateSafePayFee(salePrice) {
  if (typeof salePrice !== 'number' || isNaN(salePrice) || salePrice < 0) return 0;
  return roundToTwo(salePrice * 0.015);
}

export function calculateNetProceeds({ salePrice, loanAmount = 0, finesAmount = 0, cdFee }) {
  if (typeof salePrice !== 'number' || isNaN(salePrice)) return 0;
  return roundToTwo(salePrice - (loanAmount || 0) - (finesAmount || 0) - (cdFee || 0));
}

function roundToTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatAed(value) {
  const n = Number(value || 0);
  return `AED ${n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
