import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Select } from '../../components/Input';
import { Button } from '../../components/Button';
import { DarkCard } from '../../components/Card';
import { ErrorBanner } from '../../components/Alert';
import { UAE_BANKS } from '../../lib/banks';
import { calculateLoanClearFee, calculateSafePayFee, formatAed } from '../../lib/feeCalculator';
import { STAGES } from '../../lib/dealStages';
import { api } from '../../lib/api';

const SAFEPAY_MIN = 100000;

export default function NewReferral() {
  const navigate = useNavigate();
  const [product, setProduct] = useState('loanclear');
  const [sellerPhone, setSellerPhone] = useState('');
  const [plate, setPlate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanBank, setLoanBank] = useState(UAE_BANKS[0]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const salePriceNum = parseFloat(salePrice) || 0;
  const loanAmountNum = parseFloat(loanAmount) || 0;
  const accent = product === 'safepay' ? 'green' : 'gold';

  const cdFee = useMemo(
    () => (product === 'loanclear' ? calculateLoanClearFee(loanAmountNum) : calculateSafePayFee(salePriceNum)),
    [product, salePriceNum, loanAmountNum]
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!sellerPhone.trim()) return setError("Seller's phone number is required");
    if (!plate.trim()) return setError('Plate number is required');
    if (!salePriceNum || salePriceNum <= 0) return setError('Enter a valid sale price');
    if (product === 'safepay' && salePriceNum < SAFEPAY_MIN) return setError(`SafePay requires a minimum sale price of ${formatAed(SAFEPAY_MIN)}`);
    if (product === 'loanclear' && (!loanAmountNum || loanAmountNum < 0)) return setError('Enter the approximate outstanding loan amount');

    setLoading(true);
    try {
      const { deal } = await api.post('/api/deals', {
        product,
        sellerPhone: sellerPhone.trim(),
        plate: plate.trim().toUpperCase(),
        salePrice: salePriceNum,
        loanAmount: product === 'loanclear' ? loanAmountNum : undefined,
        loanBank: product === 'loanclear' ? loanBank : undefined,
      });
      await api.put(`/api/deals/${deal.id}/stage`, { targetStage: STAGES.FINES_VERIFY });
      navigate(`/partner/deals/${deal.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="font-display text-2xl font-bold text-white">New referral</h2>
      <p className="mt-1 text-sm text-white/50">
        The seller must already have a ClearDrive account — enter their phone number to attach them to this deal.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        <ErrorBanner message={error} />

        <Select label="Product" value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="loanclear" className="bg-navy">LoanClear — car has a bank loan</option>
          <option value="safepay" className="bg-navy">SafePay — no loan, any private sale</option>
        </Select>

        <Input label="Seller's phone (must already have an account)" type="tel" placeholder="+9715XXXXXXXX" value={sellerPhone} onChange={(e) => setSellerPhone(e.target.value)} required />

        <Input label="Plate number" placeholder="e.g. A 12345" value={plate} onChange={(e) => setPlate(e.target.value)} required />

        <Input
          label="Agreed sale price (AED)"
          type="number"
          min="0"
          value={salePrice}
          onChange={(e) => setSalePrice(e.target.value)}
          required
        />

        {product === 'loanclear' && (
          <>
            <Select label="Bank" value={loanBank} onChange={(e) => setLoanBank(e.target.value)}>
              {UAE_BANKS.map((b) => (
                <option key={b} value={b} className="bg-navy">
                  {b}
                </option>
              ))}
            </Select>
            <Input
              label="Approximate outstanding loan amount (AED)"
              type="number"
              min="0"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              required
            />
          </>
        )}

        <DarkCard>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">{product === 'loanclear' ? 'LoanClear' : 'SafePay'} Fee</span>
            <span className="text-white font-semibold">{formatAed(cdFee)}</span>
          </div>
        </DarkCard>

        <Button type="submit" variant={accent} loading={loading} className="w-full">
          Create Referral →
        </Button>
      </form>
    </div>
  );
}
