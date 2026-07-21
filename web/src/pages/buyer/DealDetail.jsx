import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DarkCard, GoldCard } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Badge, ProductBadge } from '../../components/Badge';
import { ErrorBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { SkeletonCard } from '../../components/Skeleton';
import { STAGES, STAGE_ORDER, STAGE_LABELS, stageIndex } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { fileToBase64 } from '../../lib/files';
import { api } from '../../lib/api';

// Buyer view is read-only for most stages — all deal actions (fines upload,
// vehicle/financial details, transfer certificate) are the seller's job. The
// one exception is identity verification: the buyer uploads their own
// Emirates ID (Claude Vision autofill) directly on the KYC stage below. Other
// steps (signing) arrive via external WhatsApp/SignNow links, so we poll
// continuously to reflect their progress.
const POLL_STAGES = new Set([
  STAGES.QUOTE,
  STAGES.FINES_VERIFY,
  STAGES.KYC,
  STAGES.DETAILS,
  STAGES.SIGNING,
  STAGES.ESCROW,
  STAGES.TASJEEL,
]);

export default function BuyerDealDetail() {
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
        <StageCard deal={deal} onUpdate={setDeal} onError={setError} />
      </div>

      <div className="mt-8">
        <Timeline currentStage={deal.status} />
      </div>
    </div>
  );
}

function StageCard({ deal, onUpdate, onError }) {
  switch (deal.status) {
    case STAGES.QUOTE:
      return <WaitingCard title="Quote created" body="The seller is preparing this deal — check back soon." />;
    case STAGES.FINES_VERIFY:
      return <WaitingCard title="Verifying traffic fines" body="The seller is verifying the car's traffic fines." />;
    case STAGES.KYC:
      return <KycCard deal={deal} onUpdate={onUpdate} onError={onError} />;
    case STAGES.DETAILS:
      return <WaitingCard title="Vehicle & financial details" body="The seller is entering the vehicle and payment details." />;
    case STAGES.SIGNING:
      return <SigningCard deal={deal} />;
    case STAGES.ESCROW:
      return <EscrowCard deal={deal} />;
    case STAGES.TASJEEL:
      return <WaitingCard title="Tasjeel transfer" body="Once ownership is transferred at the RTA, the seller will submit the transfer certificate to finish the deal." />;
    case STAGES.COMPLETE:
      return <CompleteCard deal={deal} />;
    default:
      return null;
  }
}

function WaitingCard({ title, body }) {
  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white">{title}</h4>
      <p className="mt-1 text-sm text-white/50">{body}</p>
    </DarkCard>
  );
}

function KycCard({ deal, onUpdate, onError }) {
  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white mb-4">Identity verification</h4>
      <div className="grid grid-cols-2 gap-3">
        <PartyKycStatus label="Seller" complete={deal.seller_kyc_complete} />
        <PartyKycStatus label="You" complete={deal.buyer_kyc_complete} />
      </div>

      {!deal.buyer_kyc_complete && <EidVerifyForm deal={deal} onUpdate={onUpdate} onError={onError} />}

      {deal.buyer_kyc_complete && !deal.seller_kyc_complete && (
        <p className="mt-4 text-sm text-white/50">You're verified — waiting on the seller.</p>
      )}
    </DarkCard>
  );
}

// Emirates ID upload → Claude Vision extraction → editable review → explicit
// confirm-and-lock via PATCH /:id/kyc. Mirrors the seller-side flow — never
// auto-saves; the buyer reviews/edits the extracted fields before confirming.
function EidVerifyForm({ deal, onUpdate, onError }) {
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fullName: '', eidNumber: '', nationality: '' });
  const [extractMsg, setExtractMsg] = useState(null);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    onError('');
    setExtractMsg(null);
    try {
      const { base64, mediaType } = await fileToBase64(file);
      const { data } = await api.post(`/api/deals/${deal.id}/extract-eid`, { imageBase64: base64, mediaType });
      setForm({ fullName: data.fullName || '', eidNumber: data.eidNumber || '', nationality: data.nationality || '' });
      setExtractMsg({ ok: true, text: 'Extracted from your Emirates ID — check the fields below and edit anything that looks wrong, then confirm.' });
    } catch (err) {
      setExtractMsg({ ok: false, text: `${err.message} — enter your details manually below.` });
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    if (!form.fullName.trim() || !form.eidNumber.trim()) return onError('Full name and Emirates ID number are required');
    setSaving(true);
    onError('');
    try {
      const { deal: updated } = await api.patch(`/api/deals/${deal.id}/kyc`, form);
      onUpdate(updated);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-white/8 bg-white/4 p-4">
      <p className="text-sm text-white/70 mb-3">Your identity verification (Emirates ID)</p>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gold/40 py-6 text-center hover:border-gold transition-colors">
        {busy ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        ) : (
          <>
            <span className="text-xl">📤</span>
            <span className="text-xs text-white/60">Tap to upload your Emirates ID photo</span>
          </>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={busy} />
      </label>
      {extractMsg && (extractMsg.ok ? <p className="mt-2 text-xs text-green">{extractMsg.text}</p> : <ErrorBanner message={extractMsg.text} />)}

      <form onSubmit={handleConfirm} className="flex flex-col gap-3 mt-3">
        <Input label="Full name" value={form.fullName} onChange={set('fullName')} />
        <Input label="Emirates ID number" value={form.eidNumber} onChange={set('eidNumber')} />
        <Button type="submit" variant="secondary" loading={saving} className="w-full">
          Confirm & verify identity
        </Button>
      </form>
    </div>
  );
}

function PartyKycStatus({ label, complete }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/4 p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-white/40 font-sans font-bold">{label}</p>
      <div className="mt-2">
        {complete ? <Badge variant="verified">Complete ✓</Badge> : <Badge variant="pending">Pending</Badge>}
      </div>
    </div>
  );
}

function SigningCard({ deal }) {
  const docs = [
    { label: 'DOC-001 — Transaction & Escrow Agreement', signed: deal.doc001_signed },
    { label: 'DOC-002 — Limited Power of Attorney', signed: deal.doc002_signed },
  ];
  if (deal.referral_partner_id) docs.push({ label: 'DOC-003 — Referral Agreement', signed: deal.doc003_signed });

  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white mb-1">Documents & signing</h4>
      <p className="text-sm text-white/50 mb-4">Check your email for signing links. We'll notify you once everyone has signed.</p>
      <div className="flex flex-col gap-3">
        {docs.map((doc) => (
          <div key={doc.label} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/4 p-3">
            <span className="text-sm text-white/70">{doc.label}</span>
            {doc.signed ? <Badge variant="verified">Signed ✓</Badge> : <Badge variant="pending">Awaiting signature</Badge>}
          </div>
        ))}
      </div>
    </DarkCard>
  );
}

function EscrowCard({ deal }) {
  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white mb-1">Escrow</h4>
      <p className="text-sm text-white/50 mb-4">Transfer the agreed sale price to the secure escrow account below.</p>
      {deal.trustin_escrow_iban && (
        <div className="rounded-lg border border-gold/25 bg-gold/6 p-4 text-sm">
          <p className="text-white/50">Escrow IBAN</p>
          <p className="font-mono text-white mt-1">{deal.trustin_escrow_iban}</p>
          <p className="text-white/50 mt-3">Amount</p>
          <p className="font-mono text-white mt-1">{formatAed(deal.sale_price)}</p>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-white/50">Funds received</span>
        {deal.funds_confirmed ? <Badge variant="verified">Confirmed ✓</Badge> : <Badge variant="pending">Pending</Badge>}
      </div>
    </DarkCard>
  );
}

function CompleteCard({ deal }) {
  return (
    <GoldCard>
      <h4 className="font-display text-lg font-semibold text-white mb-1">🎉 Deal complete</h4>
      <p className="text-sm text-white/60">The vehicle transfer is complete and funds have been released to the seller.</p>
      {deal.transfer_cert_url && (
        <a href={deal.transfer_cert_url} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-gold hover:underline">
          View transfer certificate →
        </a>
      )}
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
