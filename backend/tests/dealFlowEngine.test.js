// dealFlowEngine.js requires config/supabase.js at import time, which throws
// if these are unset. Dummy values only need to satisfy that startup check —
// none of the pure-logic tests below actually call supabaseAdmin.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const { validateRequiredFields, REQUIRED_FIELDS_TO_LEAVE } = require('../services/dealFlowEngine');
const { STAGES } = require('../utils/dealStages');

describe('validateRequiredFields', () => {
  test('QUOTE requires plate, sale_price, seller_id', () => {
    expect(validateRequiredFields({}, STAGES.QUOTE)).toEqual(
      expect.arrayContaining(['plate', 'sale_price', 'seller_id'])
    );
    expect(
      validateRequiredFields({ plate: 'A12345', sale_price: 150000, seller_id: 'x' }, STAGES.QUOTE)
    ).toEqual([]);
  });

  test('boolean fields treat anything other than true as missing', () => {
    expect(validateRequiredFields({ fines_verified: false }, STAGES.FINES_VERIFY)).toEqual(['fines_verified']);
    expect(validateRequiredFields({ fines_verified: undefined }, STAGES.FINES_VERIFY)).toEqual(['fines_verified']);
    expect(validateRequiredFields({ fines_verified: true }, STAGES.FINES_VERIFY)).toEqual([]);
  });

  test('empty string counts as missing, not just null/undefined', () => {
    expect(validateRequiredFields({ vin: '', sale_price: 1, seller_iban: 'x', seller_acc_name: 'x' }, STAGES.DETAILS)).toEqual(
      expect.arrayContaining(['vin'])
    );
  });

  test('KYC requires both seller and buyer KYC complete', () => {
    expect(validateRequiredFields({ seller_kyc_complete: true, buyer_kyc_complete: false }, STAGES.KYC)).toEqual([
      'buyer_kyc_complete',
    ]);
    expect(
      validateRequiredFields({ seller_kyc_complete: true, buyer_kyc_complete: true }, STAGES.KYC)
    ).toEqual([]);
  });

  test('SIGNING requires both doc001_signed and doc002_signed', () => {
    expect(validateRequiredFields({ doc001_signed: true, doc002_signed: false }, STAGES.SIGNING)).toEqual([
      'doc002_signed',
    ]);
  });

  describe('ESCROW exit — product-conditional loan/fines requirement', () => {
    // Regression coverage: this conditional check was added after discovering
    // that only funds_confirmed was validated here, letting a deal reach
    // TASJEEL before the loan/fines were actually settled via any caller
    // other than the TrustIn webhook (e.g. the generic PUT /:id/stage route
    // or an admin manual override bypassed the real check entirely).
    test('SafePay only requires fines_cleared, not loan_cleared', () => {
      const deal = { product: 'safepay', funds_confirmed: true, fines_cleared: true };
      expect(validateRequiredFields(deal, STAGES.ESCROW)).toEqual([]);
    });

    test('SafePay missing fines_cleared is blocked', () => {
      const deal = { product: 'safepay', funds_confirmed: true, fines_cleared: false };
      expect(validateRequiredFields(deal, STAGES.ESCROW)).toEqual(
        expect.arrayContaining(['fines_cleared'])
      );
    });

    test('LoanClear requires both loan_cleared and fines_cleared', () => {
      const deal = { product: 'loanclear', funds_confirmed: true, fines_cleared: true, loan_cleared: false };
      expect(validateRequiredFields(deal, STAGES.ESCROW)).toEqual(
        expect.arrayContaining(['loan_cleared'])
      );
    });

    test('LoanClear with everything cleared passes', () => {
      const deal = { product: 'loanclear', funds_confirmed: true, fines_cleared: true, loan_cleared: true };
      expect(validateRequiredFields(deal, STAGES.ESCROW)).toEqual([]);
    });

    test('funds_confirmed missing is still caught alongside the conditional fields', () => {
      const deal = { product: 'loanclear', funds_confirmed: false, fines_cleared: false, loan_cleared: false };
      const missing = validateRequiredFields(deal, STAGES.ESCROW);
      expect(missing).toEqual(expect.arrayContaining(['funds_confirmed', 'loan_cleared', 'fines_cleared']));
    });
  });

  test('an unknown "from" stage has no required fields (defaults to empty list)', () => {
    expect(validateRequiredFields({}, 'not-a-real-stage')).toEqual([]);
  });

  test('every real stage in REQUIRED_FIELDS_TO_LEAVE is a genuine STAGES value', () => {
    const validStages = Object.values(STAGES);
    Object.keys(REQUIRED_FIELDS_TO_LEAVE).forEach((stage) => {
      expect(validStages).toContain(stage);
    });
  });
});
