// Regression coverage for the mobile mirror of backend/services/feeCalculator.js.
// This copy only drives the live quote preview (never the money that actually
// moves — the server recalculates authoritatively), but if it drifts from the
// backend's tiers, the quote a client sees on their phone would misquote the
// deal before the server's real figure ever appears.
const {
  calculateLoanClearFee,
  calculateSafePayFee,
  calculateNetProceeds,
  formatAed,
} = require('../src/lib/feeCalculator');

describe('calculateLoanClearFee', () => {
  it('flat AED 4,000 under 150k', () => {
    expect(calculateLoanClearFee(100000)).toBe(4000);
    expect(calculateLoanClearFee(149999)).toBe(4000);
  });
  it('3% between 150k and 300k', () => {
    expect(calculateLoanClearFee(200000)).toBe(6000);
  });
  it('2.5% between 300k and 500k', () => {
    expect(calculateLoanClearFee(400000)).toBe(10000);
  });
  it('2% at or above 500k', () => {
    expect(calculateLoanClearFee(600000)).toBe(12000);
  });
  it('returns 0 for invalid input', () => {
    expect(calculateLoanClearFee(-1)).toBe(0);
    expect(calculateLoanClearFee(NaN)).toBe(0);
    expect(calculateLoanClearFee('abc')).toBe(0);
  });
});

describe('calculateSafePayFee', () => {
  it('is 1.5% of sale price', () => {
    expect(calculateSafePayFee(100000)).toBe(1500);
    expect(calculateSafePayFee(250000)).toBe(3750);
  });
  it('returns 0 for invalid input', () => {
    expect(calculateSafePayFee(-1)).toBe(0);
    expect(calculateSafePayFee(NaN)).toBe(0);
  });
});

describe('calculateNetProceeds', () => {
  it('subtracts loan, fines, and fee from sale price', () => {
    expect(calculateNetProceeds({ salePrice: 200000, loanAmount: 50000, finesAmount: 500, cdFee: 6000 })).toBe(143500);
  });
  it('defaults loan/fines to 0 when omitted', () => {
    expect(calculateNetProceeds({ salePrice: 100000, cdFee: 1500 })).toBe(98500);
  });
  it('returns 0 for invalid sale price', () => {
    expect(calculateNetProceeds({ salePrice: NaN, cdFee: 0 })).toBe(0);
  });
});

describe('formatAed', () => {
  it('formats a number with AED prefix', () => {
    expect(formatAed(1500)).toBe('AED 1,500');
  });
  it('treats missing/undefined as 0', () => {
    expect(formatAed(undefined)).toBe('AED 0');
  });
});
