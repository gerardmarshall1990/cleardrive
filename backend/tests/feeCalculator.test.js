const {
  calculateLoanClearFee,
  calculateSafePayFee,
  calculateNetProceeds,
  calculateReferralFee,
  isLoyaltyTier,
} = require('../services/feeCalculator');

describe('calculateLoanClearFee', () => {
  test('flat AED 4,000 below 150,000', () => {
    expect(calculateLoanClearFee(0)).toBe(4000);
    expect(calculateLoanClearFee(149999)).toBe(4000);
  });

  test('3% between 150,000 and 300,000', () => {
    expect(calculateLoanClearFee(150000)).toBe(4500);
    expect(calculateLoanClearFee(299999)).toBeCloseTo(8999.97, 2);
  });

  test('2.5% between 300,000 and 500,000', () => {
    expect(calculateLoanClearFee(300000)).toBe(7500);
    expect(calculateLoanClearFee(499999)).toBeCloseTo(12499.975, 2);
  });

  test('2% at or above 500,000', () => {
    expect(calculateLoanClearFee(500000)).toBe(10000);
    expect(calculateLoanClearFee(1000000)).toBe(20000);
  });

  test('throws on negative or non-numeric input', () => {
    expect(() => calculateLoanClearFee(-1)).toThrow();
    expect(() => calculateLoanClearFee(NaN)).toThrow();
    expect(() => calculateLoanClearFee('150000')).toThrow();
  });
});

describe('calculateSafePayFee', () => {
  test('flat 1.5% of sale price', () => {
    expect(calculateSafePayFee(150000)).toBe(2250);
    expect(calculateSafePayFee(100000)).toBe(1500);
  });

  test('throws on negative or non-numeric input', () => {
    expect(() => calculateSafePayFee(-1)).toThrow();
    expect(() => calculateSafePayFee(NaN)).toThrow();
  });
});

describe('calculateNetProceeds', () => {
  test('SafePay: sale price minus fines minus fee (no loan)', () => {
    expect(calculateNetProceeds({ salePrice: 150000, finesAmount: 0, cdFee: 2250 })).toBe(147750);
  });

  test('LoanClear: sale price minus loan minus fines minus fee', () => {
    expect(
      calculateNetProceeds({ salePrice: 220000, loanAmount: 100000, finesAmount: 500, cdFee: 4000 })
    ).toBe(115500);
  });

  test('defaults loanAmount/finesAmount to 0 when omitted', () => {
    expect(calculateNetProceeds({ salePrice: 100000, cdFee: 1500 })).toBe(98500);
  });

  test('throws when salePrice is missing or not a number', () => {
    expect(() => calculateNetProceeds({ cdFee: 100 })).toThrow();
  });
});

describe('calculateReferralFee', () => {
  test('standard tier thresholds', () => {
    expect(calculateReferralFee(149999)).toBe(500);
    expect(calculateReferralFee(150000)).toBe(750);
    expect(calculateReferralFee(300000)).toBe(1000);
    expect(calculateReferralFee(500000)).toBe(1500);
  });

  test('loyalty tier pays more at every bracket', () => {
    expect(calculateReferralFee(149999, true)).toBe(750);
    expect(calculateReferralFee(150000, true)).toBe(1000);
    expect(calculateReferralFee(300000, true)).toBe(1500);
    expect(calculateReferralFee(500000, true)).toBe(2000);
  });

  test('throws on negative or non-numeric input', () => {
    expect(() => calculateReferralFee(-1)).toThrow();
    expect(() => calculateReferralFee(NaN)).toThrow();
  });
});

describe('isLoyaltyTier', () => {
  test('true at and above 20 completed deals', () => {
    expect(isLoyaltyTier(20)).toBe(true);
    expect(isLoyaltyTier(25)).toBe(true);
  });

  test('false below 20, null, or undefined', () => {
    expect(isLoyaltyTier(19)).toBe(false);
    expect(isLoyaltyTier(0)).toBe(false);
    expect(isLoyaltyTier(null)).toBe(false);
    expect(isLoyaltyTier(undefined)).toBe(false);
  });
});
