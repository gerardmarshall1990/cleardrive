import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DarkCard } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Badge, ProductBadge } from '../../components/Badge';
import { ErrorBanner, SuccessBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { SkeletonCard } from '../../components/Skeleton';
import { STAGE_ORDER, STAGE_LABELS, stageIndex } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';

// Manual-override toggles — mirror backend/controllers/adminController.js's
// OVERRIDABLE_FIELDS. Used to unblock deals while TrustIn KYC / SignNow
// signing / Claude Vision fines extraction aren't yet live integrations (or
// are currently failing), or when a verification/signature/payment was
// collected outside the platform.
const OVERRIDE_FIELDS = [
  { key: 'fines_verified', label: 'Traffic fines verified' },
  { key: 'seller_kyc_complete', label: 'Seller KYC complete' },
  { key: 'buyer_kyc_complete', label: 'Buyer KYC complete' },
  { key: 'doc001_signed', label: 'DOC-001 signed (Transaction & Escrow Agreement)' },
  { key: 'doc002_signed', label: 'DOC-002 signed (Limited Power of Attorney)' },
  { key: 'doc003_signed', label: 'DOC-003 signed (Referral Agreement)', requiresPartner: true },
  { key: 'funds_confirmed', label: 'Escrow funds confirmed received' },
];

export default function AdminDealDetail() {
  const { id } = useParams();
  const [deal, setDeal] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [finesAmount, setFinesAmount] = useState('');
  const [transferCertUrl, setTransferCertUrl] = useState('');

  const load = useCallback(async () => {
    try {
      const { deal } = await api.get(`/api/admin/deals/${id}`);
      setDeal(deal);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleField(field) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body = { [field]: !deal[field] };
      // If admin is marking fines as verified and has entered a figure, include it
      // so cd_fee/net_proceeds get recalculated the same way the automated path does.
      if (field === 'fines_verified' && !deal.fines_verified && finesAmount !== '') {
        body.finesAmount = Number(finesAmount);
      }
      const { deal: updated } = await api.put(`/api/admin/deals/${id}/override`, body);
      setDeal(updated);
      setSuccess('Updated');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitTransferCert(e) {
    e.preventDefault();
    if (!transferCertUrl.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated } = await api.put(`/api/admin/deals/${id}/override`, { transferCertUrl: transferCertUrl.trim() });
      setDeal(updated);
      setSuccess('Transfer certificate saved');
      setTransferCertUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!deal) {
    return (
      <div className="mx-auto max-w-2xl flex flex-col gap-4">
        <SkeletonCard />
        <ErrorBanner message={error} />
      </div>
    );
  }

  const accent = deal.product === 'safepay' ? 'green' : 'gold';

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h2 className="font-display text-2xl font-bold text-white">{deal.ref}</h2>
        <ProductBadge product={deal.product} />
        {deal.stuck && <Badge variant="error">Stuck</Badge>}
      </div>
      <p className="text-sm text-white/40 mb-6">{deal.plate}</p>

      <ProgressSteps currentStage={deal.status} accent={accent} />

      {deal.blockedOn?.length > 0 && (
        <DarkCard className="mt-6 !border-error/30 !bg-error/6">
          <h4 className="font-display text-base font-semibold text-white mb-2">
            Why this deal is stuck at "{STAGE_LABELS[deal.status] || deal.status}"
          </h4>
          <ul className="flex flex-col gap-1.5">
            {deal.blockedOn.map((b) => (
              <li key={b.field} className="text-sm text-white/70 flex items-start gap-2">
                <span className="text-error mt-0.5">●</span>
                <span>{b.label}</span>
              </li>
            ))}
          </ul>
        </DarkCard>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <DarkCard>
          <h4 className="font-display text-base font-semibold text-white mb-3">Deal summary</h4>
          <Row label="Sale price" value={formatAed(deal.sale_price)} />
          {deal.product === 'loanclear' && <Row label="Loan amount" value={formatAed(deal.loan_amount)} />}
          <Row label="Fines" value={deal.fines_verified ? formatAed(deal.fines_amount) : 'Not verified'} />
          <Row label="ClearDrive fee" value={formatAed(deal.cd_fee)} />
          <Row label="Net proceeds" value={formatAed(deal.net_proceeds)} />
        </DarkCard>
        <DarkCard>
          <h4 className="font-display text-base font-semibold text-white mb-3">Parties & escrow</h4>
          <Row label="Seller ID" value={deal.seller_id?.slice(0, 8) || '—'} mono />
          <Row label="Buyer ID" value={deal.buyer_id ? deal.buyer_id.slice(0, 8) : 'Not attached'} mono />
          <Row label="Escrow IBAN" value={deal.trustin_escrow_iban || '—'} mono />
          <Row label="Funds confirmed" value={deal.funds_confirmed ? 'Yes' : 'No'} />
        </DarkCard>
      </div>

      <DarkCard className="mt-4">
        <h4 className="font-display text-base font-semibold text-white mb-1">Manual overrides</h4>
        <p className="text-sm text-white/50 mb-4">Use only for edge cases — e.g. a signature or ID check collected outside the platform.</p>
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />
        <div className="flex flex-col gap-3 mt-2">
          {OVERRIDE_FIELDS.filter((f) => !f.requiresPartner || deal.referral_partner_id).map((f) => (
            <div key={f.key} className="rounded-lg border border-white/8 bg-white/4 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">{f.label}</span>
                <Button variant={deal[f.key] ? 'secondary' : accent} loading={saving} onClick={() => toggleField(f.key)} className="!px-4 !py-2 !text-sm">
                  {deal[f.key] ? 'Undo' : 'Mark complete'}
                </Button>
              </div>
              {f.key === 'fines_verified' && !deal.fines_verified && (
                <Input
                  label="Fines amount (AED) — optional, e.g. read off the RTA screenshot yourself"
                  type="number"
                  min="0"
                  value={finesAmount}
                  onChange={(e) => setFinesAmount(e.target.value)}
                  className="mt-3"
                />
              )}
            </div>
          ))}
        </div>

        {deal.status === 'tasjeel' && !deal.transfer_cert_url && (
          <form onSubmit={submitTransferCert} className="mt-4 rounded-lg border border-white/8 bg-white/4 p-3">
            <p className="text-sm text-white/70 mb-2">Tasjeel transfer certificate URL/reference</p>
            <div className="flex gap-2">
              <Input value={transferCertUrl} onChange={(e) => setTransferCertUrl(e.target.value)} placeholder="https://... or manual reference" className="flex-1" />
              <Button type="submit" variant={accent} loading={saving} className="!px-4 !py-2 !text-sm">
                Save
              </Button>
            </div>
          </form>
        )}
        {deal.transfer_cert_url && (
          <p className="mt-3 text-xs text-white/40">Transfer certificate on file: <span className="font-mono text-white/60">{deal.transfer_cert_url}</span></p>
        )}
      </DarkCard>

      <div className="mt-8">
        <Timeline currentStage={deal.status} />
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-white/50">{label}</span>
      <span className={`text-white font-semibold ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
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
