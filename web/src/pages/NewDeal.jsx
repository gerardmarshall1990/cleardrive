import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Input, Select } from '../components/Input';
import { Button } from '../components/Button';
import { DarkCard, GoldCard } from '../components/Card';
import { ErrorBanner } from '../components/Alert';
import { ProgressSteps } from '../components/ProgressSteps';
import { UAE_BANKS } from '../lib/banks';
import { calculateLoanClearFee, calculateSafePayFee, calculateNetProceeds, formatAed } from '../lib/feeCalculator';
import { STAGES } from '../lib/dealStages';
import { api } from '../lib/api';

const SAFEPAY_MIN = 100000;

// Single "Create Deal" form for both sides of the trade — no separate
// seller-only vs buyer-only creation code paths. Which side you're playing on
// THIS deal is picked here, per-deal, rather than being fixed on your
// account — the same account can create one deal as the seller and another
// as the buyer. Everything else is shared. The moment the deal is created, an
// invite link is auto-sent (WhatsApp + email) to the other party so they can
// join with zero extra steps on either side.
export default function NewDeal() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get('role') === 'buyer' ? 'buyer' : 'seller');
  const isBuyer = role === 'buyer';

  const [product, setProduct] = useState(params.get('product') === 'safepay' ? 'safepay' : 'loanclear');
  const [plate, setPlate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanBank, setLoanBank] = useState(UAE_BANKS[0]);
  const [otherPartyPhone, setOtherPartyPhone] = useState('');
  const [otherPartyEmail, setOtherPartyEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const salePriceNum = parseFloat(salePrice) || 0;
  const loanAmountNum = parseFloat(loanAmount) || 0;
  const accent = product === 'safepay' ? 'green' : 'gold';
  const otherRoleLabel = isBuyer ? 'seller' : 'buyer';

  const { cdFee, netProceeds } = useMemo(() => {
    const fee = product === 'loanclear' ? calculateLoanClearFee(loanAmountNum) : calculateSafePayFee(salePriceNum);
    const net = calculateNetProceeds({ salePrice: salePriceNum, loanAmount: product === 'loanclear' ? loanAmountNum : 0, finesAmount: 0, cdFee: fee });
    return { cdFee: fee, netProceeds: net };
  }, [product, salePriceNum, loanAmountNum]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!plate.trim()) return setError('Plate number is required');
    if (!salePriceNum || salePriceNum <= 0) return setError(isBuyer ? 'Enter your proposed price' : 'Enter a valid sale price');
    if (product === 'safepay' && salePriceNum < SAFEPAY_MIN) return setError(`SafePay requires a minimum sale price of ${formatAed(SAFEPAY_MIN)}`);
    if (!isBuyer && product === 'loanclear' && (!loanAmountNum || loanAmountNum < 0)) return setError('Enter the approximate outstanding loan amount');
    if (!otherPartyPhone.trim() && !otherPartyEmail.trim()) {
      return setError(`Enter the ${otherRoleLabel}'s phone or email so we can send them the join link`);
    }

    setLoading(true);
    try {
      const { deal } = await api.post('/api/deals', {
        role,
        product,
        plate: plate.trim().toUpperCase(),
        salePrice: salePriceNum,
        loanAmount: product === 'loanclear' && loanAmountNum ? loanAmountNum : undefined,
        loanBank: product === 'loanclear' ? loanBank : undefined,
        otherPartyPhone: otherPartyPhone.trim() || undefined,
        otherPartyEmail: otherPartyEmail.trim() || undefined,
      });
      // Required fields to leave "quote" (plate, sale_price, seller_id) are only
      // satisfied once a seller is attached — a buyer-created deal stays at QUOTE
      // until the invited seller joins, so only advance the stage when we're the seller.
      if (!isBuyer) {
        await api.put(`/api/deals/${deal.id}/stage`, { targetStage: STAGES.FINES_VERIFY });
      }
      navigate(`/deals/${deal.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <ProgressSteps currentStage={STAGES.QUOTE} accent={accent} />
      <h2 className="mt-6 font-display text-2xl font-bold text-white">
        {isBuyer ? 'Propose a deal' : 'Get your quote'}
      </h2>
      <p className="mt-1 text-sm text-white/50">
        {isBuyer
          ? "Tell us what you've agreed with the seller — they'll confirm the exact figures once they join."
          : "Tell us about the car and sale — we'll calculate your net proceeds instantly."}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        <ErrorBanner message={error} />

        <Select label="On this deal, you are the..." value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="seller" className="bg-navy">Seller</option>
          <option value="buyer" className="bg-navy">Buyer</option>
        </Select>

        <Select label="Product" value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="loanclear" className="bg-navy">LoanClear — car has a bank loan</option>
          <option value="safepay" className="bg-navy">SafePay — no loan, any private sale</option>
        </Select>

        <Input label="Plate number" placeholder="e.g. A 12345" value={plate} onChange={(e) => setPlate(e.target.value)} required />

        <Input
          label={isBuyer ? 'Proposed sale price (AED)' : 'Agreed sale price (AED)'}
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
              label={isBuyer ? 'Outstanding loan amount, if known (AED)' : 'Approximate outstanding loan amount (AED)'}
              type="number"
              min="0"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              required={!isBuyer}
            />
          </>
        )}

        <div className="rounded-lg border border-white/8 bg-white/4 p-4">
          <p className="text-sm text-white/70 mb-3 capitalize">{otherRoleLabel}'s contact — we'll send them a join link right away</p>
          <div className="flex flex-col gap-3">
            <Input
              label={`${otherRoleLabel === 'seller' ? "Seller's" : "Buyer's"} phone`}
              type="tel"
              placeholder="+9715XXXXXXXX"
              value={otherPartyPhone}
              onChange={(e) => setOtherPartyPhone(e.target.value)}
            />
            <Input
              label={`${otherRoleLabel === 'seller' ? "Seller's" : "Buyer's"} email`}
              type="email"
              placeholder="name@example.com"
              value={otherPartyEmail}
              onChange={(e) => setOtherPartyEmail(e.target.value)}
            />
          </div>
        </div>

        <DarkCard>
          <div className="flex flex-col gap-2 text-sm font-sans">
            <Row label="Sale Price" value={formatAed(salePriceNum)} />
            {product === 'loanclear' && <Row label="Loan Balance" value={formatAed(loanAmountNum)} />}
            <Row label="Traffic Fines" value="Pending verification" muted />
            <Row label={`${product === 'loanclear' ? 'LoanClear' : 'SafePay'} Fee`} value={formatAed(cdFee)} />
          </div>
          <div className="my-3 border-t border-white/10" />
          <GoldCard className="!bg-transparent !border-0 !p-0 flex items-center justify-between">
            <span className="text-sm font-semibold text-white/70">{isBuyer ? 'Estimated Net Proceeds (seller)' : 'Your Net Proceeds'}</span>
            <span className={`font-display text-2xl font-bold ${accent === 'green' ? 'text-green' : 'text-gold'}`}>
              {formatAed(netProceeds)}
            </span>
          </GoldCard>
        </DarkCard>

        <Button type="submit" variant={accent} loading={loading} className="w-full">
          {isBuyer ? 'Send proposal →' : 'Get Started →'}
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
