import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DarkCard, GoldCard } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Badge, ProductBadge } from '../../components/Badge';
import { ErrorBanner, SuccessBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { SkeletonCard } from '../../components/Skeleton';
import { STAGES, STAGE_ORDER, STAGE_LABELS, stageIndex } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { fileToBase64 } from '../../lib/files';
import { api } from '../../lib/api';

const POLL_STAGES = new Set([STAGES.KYC, STAGES.SIGNING, STAGES.ESCROW, STAGES.TASJEEL]);

export default function SellerDealDetail() {
  const { id } = useParams();
  const [deal, setDeal] = useState(null);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { deal } = await api.get(`/api/deals/${id}`);
      setDeal(deal);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    clearInterval(pollRef.current);
    if (deal && POLL_STAGES.has(deal.status)) {
      pollRef.current = setInterval(load, 6000);
    }
    return () => clearInterval(pollRef.current);
  }, [deal?.status, load]);

  if (!deal) {
    return (
      <div className="mx-auto max-w-xl flex flex-col gap-4">
        <SkeletonCard />
        <ErrorBanner message={error} />
      </div>
    );
  }

  const accent = deal.product === 'safepay' ? 'green' : 'gold';

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="font-display text-2xl font-bold text-white">{deal.ref}</h2>
        <ProductBadge product={deal.product} />
      </div>
      <p className="text-sm text-white/40 mb-6">{deal.plate}</p>

      <ProgressSteps currentStage={deal.status} accent={accent} />

      <div className="mt-6">
        <ErrorBanner message={error} />
        <StageCard deal={deal} accent={accent} onUpdate={setDeal} onError={setError} reload={load} />
      </div>

      <div className="mt-8">
        <Timeline currentStage={deal.status} />
      </div>
    </div>
  );
}

function StageCard({ deal, accent, onUpdate, onError, reload }) {
  switch (deal.status) {
    case STAGES.QUOTE:
      return <ContinueCard deal={deal} accent={accent} target={STAGES.FINES_VERIFY} onUpdate={onUpdate} onError={onError} title="Quote created" body="Ready to verify traffic fines." />;
    case STAGES.FINES_VERIFY:
      return <FinesVerifyCard deal={deal} accent={accent} onUpdate={onUpdate} onError={onError} />;
    case STAGES.KYC:
      return <KycCard deal={deal} accent={accent} onUpdate={onUpdate} onError={onError} />;
    case STAGES.DETAILS:
      return <DetailsCard deal={deal} accent={accent} onUpdate={onUpdate} onError={onError} />;
    case STAGES.SIGNING:
      return <SigningCard deal={deal} />;
    case STAGES.ESCROW:
      return <EscrowCard deal={deal} />;
    case STAGES.TASJEEL:
      return <TasjeelCard deal={deal} accent={accent} onUpdate={onUpdate} onError={onError} />;
    case STAGES.COMPLETE:
      return <CompleteCard deal={deal} />;
    default:
      return null;
  }
}

function ContinueCard({ deal, accent, target, onUpdate, onError, title, body }) {
  const [loading, setLoading] = useState(false);
  async function handleContinue() {
    setLoading(true);
    onError('');
    try {
      const { deal: updated } = await api.put(`/api/deals/${deal.id}/stage`, { targetStage: target });
      onUpdate(updated);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white">{title}</h4>
      <p className="mt-1 text-sm text-white/50">{body}</p>
      <Button variant={accent} loading={loading} onClick={handleContinue} className="mt-4 w-full">
        Continue →
      </Button>
    </DarkCard>
  );
}

function FinesVerifyCard({ deal, accent, onUpdate, onError }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    onError('');
    setResult(null);
    try {
      const { base64, mediaType } = await fileToBase64(file);
      const res = await api.post(`/api/deals/${deal.id}/fines-verify`, { imageBase64: base64, mediaType });
      setResult({ ok: true, plate: res.deal.plate, fines: res.deal.fines_amount });
      // Required field to leave fines_verify (fines_verified) is now true — advance.
      const { deal: advanced } = await api.put(`/api/deals/${deal.id}/stage`, { targetStage: STAGES.KYC });
      onUpdate(advanced);
    } catch (err) {
      setResult({ ok: false, reason: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white">Verify traffic fines</h4>
      <div className="mt-3 rounded-lg bg-white/4 border border-white/8 p-4 text-sm text-white/60 space-y-1">
        <p>1. Open your RTA Dubai app</p>
        <p>2. Tap Vehicle Services → Traffic Fines</p>
        <p>3. Screenshot the results screen</p>
        <p>4. Upload it below</p>
      </div>

      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gold/40 py-10 text-center hover:border-gold transition-colors">
        {busy ? (
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        ) : (
          <>
            <span className="text-2xl">📤</span>
            <span className="text-sm text-white/60">Tap to upload screenshot</span>
          </>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={busy} />
      </label>

      {result?.ok && (
        <div className="mt-4 cd-verified-pulse rounded-lg border border-green/30 bg-green/12 p-4 text-sm text-green">
          <p>✓ Plate: {result.plate}</p>
          <p>✓ Fines: {formatAed(result.fines)}</p>
          <p>✓ Verified — moving to identity check…</p>
        </div>
      )}
      {result && !result.ok && <ErrorBanner message={result.reason} />}
    </DarkCard>
  );
}

function KycCard({ deal, accent, onUpdate, onError }) {
  const [loading, setLoading] = useState(false);
  const bothComplete = deal.seller_kyc_complete && deal.buyer_kyc_complete;

  async function handleContinue() {
    setLoading(true);
    onError('');
    try {
      const { deal: updated } = await api.put(`/api/deals/${deal.id}/stage`, { targetStage: STAGES.DETAILS });
      onUpdate(updated);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white mb-4">Identity verification</h4>
      <div className="grid grid-cols-2 gap-3">
        <PartyKycStatus label="Seller" complete={deal.seller_kyc_complete} />
        <PartyKycStatus label="Buyer" complete={deal.buyer_kyc_complete} note={!deal.buyer_id ? 'No buyer attached yet' : undefined} />
      </div>
      <p className="mt-4 text-sm text-white/50">Both parties must complete identity verification before proceeding.</p>
      <Button variant={accent} loading={loading} disabled={!bothComplete} onClick={handleContinue} className="mt-4 w-full">
        {bothComplete ? 'Continue →' : 'Waiting for verification…'}
      </Button>
    </DarkCard>
  );
}

function PartyKycStatus({ label, complete, note }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/4 p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-white/40 font-sans font-bold">{label}</p>
      <div className="mt-2">
        {complete ? <Badge variant="verified">Complete ✓</Badge> : <Badge variant="pending">Pending</Badge>}
      </div>
      {note && <p className="mt-2 text-xs text-white/30">{note}</p>}
    </div>
  );
}

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

function DetailsCard({ deal, accent, onUpdate, onError }) {
  const [form, setForm] = useState({
    vin: deal.vin || '',
    make: deal.make || '',
    model: deal.model || '',
    year: deal.year || '',
    colour: deal.colour || '',
    emirate: deal.emirate || EMIRATES[0],
    mileage: deal.mileage || '',
    loan_account: deal.loan_account || '',
    seller_iban: deal.seller_iban || '',
    seller_acc_name: deal.seller_acc_name || '',
    seller_proc_bank: deal.seller_proc_bank || '',
  });
  const [buyerPhone, setBuyerPhone] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    onError('');
    try {
      if (!deal.buyer_id) {
        if (!buyerPhone.trim()) throw new Error('Buyer phone is required — the buyer must sign up first');
        await api.patch(`/api/deals/${deal.id}/buyer`, { buyerPhone: buyerPhone.trim() });
      }
      await api.patch(`/api/deals/${deal.id}/details`, form);
      const { deal: updated } = await api.put(`/api/deals/${deal.id}/stage`, { targetStage: STAGES.SIGNING });
      onUpdate(updated);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white mb-4">Vehicle & financial details</h4>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {!deal.buyer_id && (
          <Input label="Buyer's phone (must already have an account)" type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} required />
        )}
        <Input label="VIN (from Mulkiya)" value={form.vin} onChange={set('vin')} required />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Make" value={form.make} onChange={set('make')} required />
          <Input label="Model" value={form.model} onChange={set('model')} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Year" value={form.year} onChange={set('year')} required />
          <Input label="Colour" value={form.colour} onChange={set('colour')} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Mileage (km)" value={form.mileage} onChange={set('mileage')} required />
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-white/50 font-sans">Emirate</span>
            <select
              className="w-full rounded-lg border-[1.5px] border-white/12 bg-white/5 px-4 py-3.5 text-[15px] text-white font-sans outline-none focus:border-gold"
              value={form.emirate}
              onChange={set('emirate')}
            >
              {EMIRATES.map((em) => (
                <option key={em} value={em} className="bg-navy">
                  {em}
                </option>
              ))}
            </select>
          </label>
        </div>
        {deal.product === 'loanclear' && <Input label="Loan account number" value={form.loan_account} onChange={set('loan_account')} required />}
        <p className="text-xs uppercase tracking-wide text-white/40 font-sans font-bold mt-2">Your proceeds account</p>
        <Input label="IBAN" value={form.seller_iban} onChange={set('seller_iban')} required />
        <Input label="Account holder name" value={form.seller_acc_name} onChange={set('seller_acc_name')} required />
        <Input label="Bank" value={form.seller_proc_bank} onChange={set('seller_proc_bank')} required />

        <Button type="submit" variant={accent} loading={loading} className="w-full mt-2">
          Save & Continue →
        </Button>
      </form>
    </DarkCard>
  );
}

function SigningCard({ deal }) {
  const docs = [
    { label: 'DOC-001 — Transaction & Escrow Agreement', url: deal.doc001_url, signed: deal.doc001_signed },
    { label: 'DOC-002 — Limited Power of Attorney', url: deal.doc002_url, signed: deal.doc002_signed },
  ];
  if (deal.referral_partner_id) docs.push({ label: 'DOC-003 — Referral Agreement', url: deal.doc003_url, signed: deal.doc003_signed });

  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white mb-1">Documents & signing</h4>
      <p className="text-sm text-white/50 mb-4">Review and sign each document. We'll notify you when everyone has signed.</p>
      <div className="flex flex-col gap-3">
        {docs.map((doc) => (
          <div key={doc.label} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/4 p-3">
            <span className="text-sm text-white/70">{doc.label}</span>
            {doc.signed ? <Badge variant="verified">Signed ✓</Badge> : <Badge variant="pending">Awaiting signature</Badge>}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-white/30">Documents are generated automatically — your ClearDrive contact will confirm once all signatures are collected.</p>
    </DarkCard>
  );
}

function EscrowCard({ deal }) {
  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white mb-1">Escrow</h4>
      <p className="text-sm text-white/50 mb-4">Waiting for the buyer's funds to reach the secure escrow account.</p>
      {deal.trustin_escrow_iban && (
        <div className="rounded-lg border border-gold/25 bg-gold/6 p-4 text-sm">
          <p className="text-white/50">Escrow IBAN</p>
          <p className="font-mono text-white mt-1">{deal.trustin_escrow_iban}</p>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-white/50">Funds received</span>
        {deal.funds_confirmed ? <Badge variant="verified">Confirmed ✓</Badge> : <Badge variant="pending">Pending</Badge>}
      </div>
    </DarkCard>
  );
}

function TasjeelCard({ deal, accent, onUpdate, onError }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim()) return onError('Enter the transfer certificate reference/URL');
    setLoading(true);
    onError('');
    try {
      const { deal: updated } = await api.post(`/api/deals/${deal.id}/complete`, { transferCertUrl: url.trim() });
      onUpdate(updated);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white mb-1">Tasjeel transfer</h4>
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-white/50">Loan cleared</span>
        {deal.product === 'safepay' ? <Badge variant="verified">N/A</Badge> : deal.loan_cleared ? <Badge variant="verified">Cleared ✓</Badge> : <Badge variant="pending">Pending</Badge>}
      </div>
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-white/50">Fines cleared</span>
        {deal.fines_cleared ? <Badge variant="verified">Cleared ✓</Badge> : <Badge variant="pending">Pending</Badge>}
      </div>
      <p className="text-sm text-white/50 mb-3">Once you've completed the RTA ownership transfer, submit your transfer certificate to finish the deal.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input label="Transfer certificate reference" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <Button type="submit" variant={accent} loading={loading} className="w-full">
          Complete deal →
        </Button>
      </form>
    </DarkCard>
  );
}

function CompleteCard({ deal }) {
  return (
    <GoldCard>
      <h4 className="font-display text-lg font-semibold text-white mb-1">🎉 Deal complete</h4>
      <p className="text-sm text-white/60 mb-4">Your proceeds have been released to your account.</p>
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/50">Net proceeds released</span>
        <span className="font-display text-xl font-bold text-gold">{formatAed(deal.net_proceeds)}</span>
      </div>
    </GoldCard>
  );
}

function Timeline({ currentStage }) {
  const currentIdx = stageIndex(currentStage);
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wide text-white/40 font-sans font-bold mb-3">Timeline</h4>
      <div className="flex flex-col gap-2">
        {STAGE_ORDER.map((stage, idx) => (
          <div key={stage} className="flex items-center gap-3 text-sm">
            <span className={idx <= currentIdx ? 'text-green' : 'text-white/20'}>{idx < currentIdx ? '✓' : idx === currentIdx ? '●' : '○'}</span>
            <span className={idx <= currentIdx ? 'text-white/70' : 'text-white/30'}>{STAGE_LABELS[stage]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
