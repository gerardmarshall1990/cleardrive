import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DarkCard } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input, Select } from '../../components/Input';
import { Badge, ProductBadge } from '../../components/Badge';
import { ErrorBanner, SuccessBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { SkeletonCard } from '../../components/Skeleton';
import { STAGE_ORDER, STAGE_LABELS, stageIndex } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';

function vehicleTitle(deal) {
  const parts = [deal.year, deal.make, deal.model].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

// Manual-override toggles — mirror backend/controllers/adminController.js's
// OVERRIDABLE_FIELDS. Used to unblock deals while TrustIn KYC / SignNow
// signing / Claude Vision fines extraction aren't yet live integrations (or
// are currently failing), or when a verification/signature/payment was
// collected outside the platform.
const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

// Vehicle/financial fields admin can manually correct — mirrors backend's
// ADMIN_DETAIL_FIELDS in adminController.js. Exists as a safety net for when
// Claude Vision misreads the Mulkiya or bank settlement letter photo — admin
// can pull up the source photo below (mulkiya_image_url/settlement_image_url)
// and type the correct value in here instead of what was auto-extracted.
const DETAIL_FIELDS = [
  { key: 'plate', label: 'Plate number' },
  { key: 'vin', label: 'VIN' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
  { key: 'year', label: 'Year', type: 'number' },
  { key: 'colour', label: 'Colour' },
  { key: 'mileage', label: 'Mileage (km)', type: 'number' },
  { key: 'sale_price', label: 'Sale price (AED)', type: 'number' },
  { key: 'loan_amount', label: 'Loan/settlement amount (AED)', type: 'number', loanOnly: true },
  { key: 'loan_account', label: 'Loan reference number', loanOnly: true },
  { key: 'loan_bank', label: 'Loan bank', loanOnly: true },
  { key: 'seller_iban', label: 'Seller payout IBAN' },
  { key: 'seller_acc_name', label: 'Seller payout account name' },
  { key: 'seller_proc_bank', label: 'Seller payout bank' },
];

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
  const [detailsForm, setDetailsForm] = useState(null);

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

  // Populate the manual-correction form once when the deal first loads (or
  // after a save resets it to null) — never overwrite while admin is mid-edit.
  useEffect(() => {
    if (deal && !detailsForm) {
      setDetailsForm({
        plate: deal.plate || '',
        vin: deal.vin || '',
        make: deal.make || '',
        model: deal.model || '',
        year: deal.year || '',
        colour: deal.colour || '',
        emirate: deal.emirate || EMIRATES[0],
        mileage: deal.mileage || '',
        sale_price: deal.sale_price || '',
        loan_amount: deal.loan_amount || '',
        loan_account: deal.loan_account || '',
        loan_bank: deal.loan_bank || '',
        seller_iban: deal.seller_iban || '',
        seller_acc_name: deal.seller_acc_name || '',
        seller_proc_bank: deal.seller_proc_bank || '',
      });
    }
  }, [deal, detailsForm]);

  function setDetailField(field, value) {
    setDetailsForm((f) => ({ ...f, [field]: value }));
  }

  async function submitDetailsForm(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated, documentsRegenerated, warning } = await api.put(`/api/admin/deals/${id}/override`, detailsForm);
      setDeal(updated);
      setDetailsForm(null);
      if (documentsRegenerated?.length > 0) {
        setSuccess(`Details updated. Regenerated and re-sent for signature: ${documentsRegenerated.join(', ')}.`);
      } else {
        setSuccess('Vehicle & financial details updated');
      }
      if (warning) setError(warning);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

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
      {vehicleTitle(deal) ? (
        <p className="text-sm text-white/60 mb-6">
          {vehicleTitle(deal)} <span className="text-white/40">· {deal.plate}</span>
        </p>
      ) : (
        <p className="text-sm text-white/40 mb-6">{deal.plate}</p>
      )}

      <ProgressSteps currentStage={deal.status} accent={accent} />

      <div className="mt-4">
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />
      </div>

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
          <h4 className="font-display text-base font-semibold text-white mb-3">Vehicle</h4>
          <Row label="Plate" value={deal.plate || '—'} />
          <Row label="VIN" value={deal.vin || '—'} mono />
          <Row label="Make / Model" value={[deal.make, deal.model].filter(Boolean).join(' ') || '—'} />
          <Row label="Year" value={deal.year || '—'} />
          <Row label="Colour" value={deal.colour || '—'} />
          <Row label="Mileage" value={deal.mileage ? `${Number(deal.mileage).toLocaleString('en-AE')} km` : '—'} />
          <Row label="Emirate" value={deal.emirate || '—'} />
        </DarkCard>
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

      {(deal.mulkiya_image_url || deal.mulkiya_back_image_url || deal.settlement_image_url || deal.bank_proof_image_url) && (
        <DarkCard className="mt-4">
          <h4 className="font-display text-base font-semibold text-white mb-1">Uploaded attachments</h4>
          <p className="text-sm text-white/50 mb-3">Check the original photo if the fields below look wrong — Claude Vision extraction isn't perfect.</p>
          <div className="flex flex-col gap-2">
            {deal.mulkiya_image_url && (
              <a href={deal.mulkiya_image_url} target="_blank" rel="noreferrer" className="text-sm text-gold underline">
                View uploaded Mulkiya — front (vehicle registration card)
              </a>
            )}
            {deal.mulkiya_back_image_url && (
              <a href={deal.mulkiya_back_image_url} target="_blank" rel="noreferrer" className="text-sm text-gold underline">
                View uploaded Mulkiya — back
              </a>
            )}
            {deal.settlement_image_url && (
              <a href={deal.settlement_image_url} target="_blank" rel="noreferrer" className="text-sm text-gold underline">
                View uploaded bank settlement letter
              </a>
            )}
            {deal.bank_proof_image_url && (
              <a href={deal.bank_proof_image_url} target="_blank" rel="noreferrer" className="text-sm text-gold underline">
                View uploaded proof of proceeds account (IBAN/name match)
              </a>
            )}
          </div>
        </DarkCard>
      )}

      <DarkCard className="mt-4">
        <h4 className="font-display text-base font-semibold text-white mb-1">Vehicle & financial details — manual correction</h4>
        <p className="text-sm text-white/50 mb-4">
          Use this if Claude Vision misread the Mulkiya or settlement letter — check the attachment above, then correct the field(s) here. Saving
          re-checks whether the deal can now advance. If DOC-001 and/or DOC-002 were already generated (even already signed), correcting a field
          they print automatically regenerates the document and re-sends it for signature — no need to restart the deal.
        </p>
        {detailsForm && (
          <form onSubmit={submitDetailsForm} className="grid gap-3 sm:grid-cols-2">
            {DETAIL_FIELDS.filter((f) => !f.loanOnly || deal.product === 'loanclear').map((f) => (
              <Input
                key={f.key}
                label={f.label}
                type={f.type || 'text'}
                value={detailsForm[f.key]}
                onChange={(e) => setDetailField(f.key, e.target.value)}
              />
            ))}
            <Select label="Emirate" value={detailsForm.emirate} onChange={(e) => setDetailField('emirate', e.target.value)}>
              {EMIRATES.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-2">
              <Button type="submit" variant={accent} loading={saving} className="!px-4 !py-2 !text-sm">
                Save corrections
              </Button>
            </div>
          </form>
        )}
      </DarkCard>

      <DarkCard className="mt-4">
        <h4 className="font-display text-base font-semibold text-white mb-1">Manual overrides</h4>
        <p className="text-sm text-white/50 mb-4">Use only for edge cases — e.g. a signature or ID check collected outside the platform.</p>
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
