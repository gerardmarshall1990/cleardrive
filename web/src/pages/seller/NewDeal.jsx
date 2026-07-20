import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Input, Select } from '../../components/Input';
import { Button } from '../../components/Button';
import { DarkCard, GoldCard } from '../../components/Card';
import { ErrorBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { UAE_BANKS } from '../../lib/banks';
import { calculateLoanClearFee, calculateSafePayFee, calculateNetProceeds, formatAed } from '../../lib/feeCalculator';
import { STAGES } from '../../lib/dealStages';
import { api } from '../../lib/api';

const SAFEPAY_MIN = 100000;

export default function NewDeal() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [product, setProduct] = useState(params.get('product') === 'safepay' ? 'safepay' : 'loanclear');

  const [plate, setPlate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanBank, setLoanBank] = useState(UAE_BANKS[0]);
  const [buyerPhone, setBuyerPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const salePriceNum = parseFloat(salePrice) || 0;
  const loanAmountNum = parseFloat(loanAmount) || 0;
  const accent = product === 'safepay' ? 'green' : 'gold';

  const { cdFee, netProceeds } = useMemo(() => {
    const fee = product === 'loanclear' ? calculateLoanClearFee(loanAmountNum) : calculateSafePayFee(salePriceNum);
    const net = calculateNetProceeds({ salePrice: salePriceNum, loanAmount: product === 'loanclear' ? loanAmountNum : 0, finesAmount: 0, cdFee: fee });
    return { cdFee: fee, netProceeds: net };
  }, [product, salePriceNum, loanAmountNum]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!plate.trim()) return setError('Plate number is required');
    if (!salePriceNum || salePriceNum <= 0) return setError('Enter a valid sale price');
    if (product === 'safepay' && salePriceNum < SAFEPAY_MIN) return setError(`SafePay requires a minimum sale price of ${formatAed(SAFEPAY_MIN)}`);
    if (product === 'loanclear' && (!loanAmountNum || loanAmountNum < 0)) return setError('Enter the approximate outstanding loan amount');

    setLoading(true);
    try {
      const { deal } = await api.post('/api/deals', {
        product,
        plate: plate.trim().toUpperCase(),
        salePrice: salePriceNum,
        loanAmount: product === 'loanclear' ? loanAmountNum : undefined,
        loanBank: product === 'loanclear' ? loanBank : undefined,
        buyerPhone: buyerPhone.trim() || undefined,
      });
      // Required fields to leave "quote" (plate, sale_price, seller_id) are already
      // satisfied at creation, so advance immediately into fines verification.
      await api.put(`/api/deals/${deal.id}/stage`, { targetStage: STAGES.FINES_VERIFY });
      navigate(`/seller/deals/${deal.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <ProgressSteps currentStage={STAGES.QUOTE} accent={accent} />
      <h2 className="mt-6 font-display text-2xl font-bold text-white">Get your quote</h2>
      <p className="mt-1 text-sm text-white/50">Tell us about the car and sale — we'll calculate your net proceeds instantly.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        <ErrorBanner message={error} />

        <Select label="Product" value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="loanclear" className="bg-navy">LoanClear — car has a bank loan</option>
          <option value="safepay" className="bg-navy">SafePay — no loan, any private sale</option>
        </Select>

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

        <Input
          label="Buyer's phone (optional — they must already have a ClearDrive account)"
          type="tel"
          placeholder="+9715XXXXXXXX"
          value={buyerPhone}
          onChange={(e) => setBuyerPhone(e.target.value)}
        />

        <DarkCard>
          <div className="flex flex-col gap-2 text-sm font-sans">
            <Row label="Sale Price" value={formatAed(salePriceNum)} />
            {product === 'loanclear' && <Row label="Loan Balance" value={formatAed(loanAmountNum)} />}
            <Row label="Traffic Fines" value="Pending verification" muted />
            <Row label={`${product === 'loanclear' ? 'LoanClear' : 'SafePay'} Fee`} value={formatAed(cdFee)} />
          </div>
          <div className="my-3 border-t border-white/10" />
          <GoldCard className="!bg-transparent !border-0 !p-0 flex items-center justify-between">
            <span className="text-sm font-semibold text-white/70">Your Net Proceeds</span>
            <span className={`font-display text-2xl font-bold ${accent === 'green' ? 'text-green' : 'text-gold'}`}>
              {formatAed(netProceeds)}
            </span>
          </GoldCard>
        </DarkCard>

        <Button type="submit" variant={accent} loading={loading} className="w-full">
          Get Started →
        </Button>
      </form>
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/50">{label}</span>
      <span className={muted ? 'text-white/40 italic' : 'text-white font-semibold'}>{value}</span>
    </div>
  );
}
