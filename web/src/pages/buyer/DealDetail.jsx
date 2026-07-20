import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DarkCard, GoldCard } from '../../components/Card';
import { Badge, ProductBadge } from '../../components/Badge';
import { ErrorBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { SkeletonCard } from '../../components/Skeleton';
import { STAGES, STAGE_ORDER, STAGE_LABELS, stageIndex } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';

// Buyer view is read-only for every stage — all deal actions (fines upload,
// vehicle/financial details, transfer certificate) are the seller's job.
// The buyer just tracks progress and completes identity/signing steps that
// arrive via external WhatsApp/SignNow links, so we poll continuously.
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
        <StageCard deal={deal} />
      </div>

      <div className="mt-8">
        <Timeline currentStage={deal.status} />
      </div>
    </div>
  );
}

function StageCard({ deal }) {
  switch (deal.status) {
    case STAGES.QUOTE:
      return <WaitingCard title="Quote created" body="The seller is preparing this deal — check back soon." />;
    case STAGES.FINES_VERIFY:
      return <WaitingCard title="Verifying traffic fines" body="The seller is verifying the car's traffic fines." />;
    case STAGES.KYC:
      return <KycCard deal={deal} />;
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

function KycCard({ deal }) {
  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white mb-4">Identity verification</h4>
      <div className="grid grid-cols-2 gap-3">
        <PartyKycStatus label="Seller" complete={deal.seller_kyc_complete} />
        <PartyKycStatus label="You" complete={deal.buyer_kyc_complete} />
      </div>
      {!deal.buyer_kyc_complete && (
        <p className="mt-4 text-sm text-white/50">Check WhatsApp for a link to complete your identity verification.</p>
      )}
      {deal.buyer_kyc_complete && !deal.seller_kyc_complete && (
        <p className="mt-4 text-sm text-white/50">You're verified — waiting on the seller.</p>
      )}
    </DarkCard>
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
