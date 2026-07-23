import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DarkCard } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input, Select } from '../../components/Input';
import { Badge, ProductBadge } from '../../components/Badge';
import { ErrorBanner, SuccessBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { SkeletonCard } from '../../components/Skeleton';
import { STAGES, STAGE_ORDER, STAGE_LABELS, stageIndex } from '../../lib/dealStages';
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
  { key: 'mulkiya_verified', label: 'Mulkiya (front) verified' },
  { key: 'mulkiya_back_verified', label: 'Mulkiya (back) verified' },
  { key: 'settlement_verified', label: 'Bank settlement letter verified', loanOnly: true },
  { key: 'bank_proof_verified', label: 'Proceeds account proof verified' },
  { key: 'doc001_signed', label: 'DOC-001 signed (Transaction & Escrow Agreement)' },
  { key: 'doc002_signed', label: 'DOC-002 signed (Limited Power of Attorney)' },
  { key: 'doc003_signed', label: 'DOC-003 signed (Referral Agreement)', requiresPartner: true },
  { key: 'funds_confirmed', label: 'Escrow funds confirmed received' },
];

// Every stage the state machine knows about, including the terminal ones
// (dealFlowEngine's normal PUT /:id/stage route only ever allows moving one
// step forward, or to "cancelled" from a non-terminal stage — there's no way
// to reopen a cancelled deal, revert a stage, or un-complete a deal through
// it). This list backs the "Force stage" escape hatch below.
const ALL_STAGES = [...STAGE_ORDER, STAGES.CANCELLED];

// Mirrors backend's REFERRAL_SOURCES / the referral_source column comment.
const REFERRAL_SOURCES = ['dealer', 'broker', 'dubizzle', 'facebook', 'direct'];

export default function AdminDealDetail() {
  const { id } = useParams();
  const [deal, setDeal] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [finesAmount, setFinesAmount] = useState('');
  const [transferCertUrl, setTransferCertUrl] = useState('');
  const [detailsForm, setDetailsForm] = useState(null);
  const [links, setLinks] = useState(null);
  const [auditLog, setAuditLog] = useState(null);
  const [forceStageTarget, setForceStageTarget] = useState('');
  const [forceStageReason, setForceStageReason] = useState('');
  const [reassignRole, setReassignRole] = useState('buyer');
  const [reassignPhone, setReassignPhone] = useState('');
  const [identityRole, setIdentityRole] = useState('seller');
  const [identityForm, setIdentityForm] = useState({ full_name: '', emirates_id: '', nationality: '', phone: '', email: '' });
  const [receivedAmount, setReceivedAmount] = useState('');
  const [referralPhone, setReferralPhone] = useState('');
  const [referralSource, setReferralSource] = useState('direct');
  const [referralFee, setReferralFee] = useState('');

  const load = useCallback(async () => {
    try {
      const { deal, links } = await api.get(`/api/admin/deals/${id}`);
      setDeal(deal);
      setLinks(links);
    } catch (err) {
      setError(err.message);
    }
    try {
      const { log } = await api.get(`/api/admin/deals/${id}/audit-log`);
      setAuditLog(log);
    } catch {
      // Non-critical — the audit log is a diagnostic convenience, don't block the page on it.
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
      // Lets admin record what was actually received when manually confirming
      // funds after a trustin_funds_mismatch (see Audit log below) — logged
      // alongside the override for reconciliation, doesn't change sale_price.
      if (field === 'funds_confirmed' && !deal.funds_confirmed && receivedAmount !== '') {
        body.receivedAmount = Number(receivedAmount);
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

  async function submitForceStage(e) {
    e.preventDefault();
    if (!forceStageTarget) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated, warning } = await api.put(`/api/admin/deals/${id}/force-stage`, {
        targetStage: forceStageTarget,
        reason: forceStageReason,
      });
      setDeal(updated);
      setDetailsForm(null);
      setForceStageTarget('');
      setForceStageReason('');
      setSuccess(`Stage force-set to "${STAGE_LABELS[updated.status] || updated.status}"`);
      if (warning) setError(warning);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancelDeal() {
    if (!window.confirm(`Cancel deal ${deal.ref}? This can be reversed later using "Force stage" below if needed.`)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated } = await api.put(`/api/deals/${id}/stage`, { targetStage: 'cancelled' });
      setDeal(updated);
      setSuccess('Deal cancelled');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitReassign(e) {
    e.preventDefault();
    if (!reassignPhone.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated, documentsRegenerated, warning } = await api.put(`/api/admin/deals/${id}/reassign`, {
        role: reassignRole,
        phone: reassignPhone.trim(),
      });
      setDeal(updated);
      setDetailsForm(null);
      setReassignPhone('');
      setSuccess(
        documentsRegenerated?.length > 0
          ? `${reassignRole === 'seller' ? 'Seller' : 'Buyer'} reassigned. Regenerated and re-sent for signature: ${documentsRegenerated.join(', ')}.`
          : `${reassignRole === 'seller' ? 'Seller' : 'Buyer'} reassigned.`
      );
      if (warning) setError(warning);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitIdentity(e) {
    e.preventDefault();
    const body = {};
    for (const [k, v] of Object.entries(identityForm)) {
      if (v.trim()) body[k] = v.trim();
    }
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { documentsRegenerated, warning } = await api.put(`/api/admin/deals/${id}/party/${identityRole}/identity`, body);
      setIdentityForm({ full_name: '', emirates_id: '', nationality: '', phone: '', email: '' });
      setSuccess(
        documentsRegenerated?.length > 0
          ? `${identityRole === 'seller' ? 'Seller' : 'Buyer'} identity updated. Regenerated and re-sent for signature: ${documentsRegenerated.join(', ')}.`
          : `${identityRole === 'seller' ? 'Seller' : 'Buyer'} identity updated.`
      );
      if (warning) setError(warning);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function resendInvite(doc) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { regenerated, warning } = await api.post(`/api/admin/deals/${id}/resend-signing-invite`, { doc });
      setSuccess(`Re-sent for signature: ${regenerated.join(', ')}.`);
      if (warning) setError(warning);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitReferral(e) {
    e.preventDefault();
    const body = {};
    if (referralPhone.trim()) body.partnerPhone = referralPhone.trim();
    if (referralSource) body.referralSource = referralSource;
    if (referralFee !== '') body.referralFee = Number(referralFee);
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated, documentsRegenerated, warning } = await api.put(`/api/admin/deals/${id}/referral`, body);
      setDeal(updated);
      setReferralPhone('');
      setReferralFee('');
      setSuccess(
        documentsRegenerated?.length > 0
          ? `Referral info updated. Regenerated and re-sent for signature: ${documentsRegenerated.join(', ')}.`
          : 'Referral info updated.'
      );
      if (warning) setError(warning);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeReferralPartner() {
    if (!window.confirm('Remove the referral partner from this deal? Any DOC-003 already generated will be cleared.')) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated, warning } = await api.put(`/api/admin/deals/${id}/referral`, { partnerPhone: '' });
      setDeal(updated);
      setSuccess('Referral partner removed.');
      if (warning) setError(warning);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyLink(link) {
    try {
      await navigator.clipboard.writeText(link);
      setSuccess('Link copied to clipboard');
    } catch {
      setError('Could not copy — copy the link manually');
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
        {deal.status !== 'complete' && deal.status !== 'cancelled' && (
          <Button variant="secondary" loading={saving} onClick={cancelDeal} className="!px-3 !py-1.5 !text-xs ml-auto">
            Cancel deal
          </Button>
        )}
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
          {OVERRIDE_FIELDS.filter((f) => (!f.requiresPartner || deal.referral_partner_id) && (!f.loanOnly || deal.product === 'loanclear')).map((f) => (
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
              {f.key === 'funds_confirmed' && !deal.funds_confirmed && (
                <Input
                  label={`Amount actually received (AED) — optional, e.g. to reconcile a trustin_funds_mismatch (expected ${formatAed(deal.sale_price)})`}
                  type="number"
                  min="0"
                  value={receivedAmount}
                  onChange={(e) => setReceivedAmount(e.target.value)}
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

      {links && Object.values(links).some(Boolean) && (
        <DarkCard className="mt-4">
          <h4 className="font-display text-base font-semibold text-white mb-1">Links (manual copy/send)</h4>
          <p className="text-sm text-white/50 mb-3">
            WhatsApp delivery is mocked in this environment — copy these to send manually until it's live.
          </p>
          <div className="flex flex-col gap-2">
            {links.join && <LinkRow label="Join link" link={links.join} onCopy={copyLink} />}
            {links.kycSeller && <LinkRow label="Seller KYC link" link={links.kycSeller} onCopy={copyLink} />}
            {links.kycBuyer && <LinkRow label="Buyer KYC link" link={links.kycBuyer} onCopy={copyLink} />}
            {links.signingSeller && <LinkRow label="Seller signing link" link={links.signingSeller} onCopy={copyLink} />}
            {links.signingBuyer && <LinkRow label="Buyer signing link" link={links.signingBuyer} onCopy={copyLink} />}
          </div>
        </DarkCard>
      )}

      {(deal.doc001_url || deal.doc002_url) && (
        <DarkCard className="mt-4">
          <h4 className="font-display text-base font-semibold text-white mb-1">Resend signing invite</h4>
          <p className="text-sm text-white/50 mb-3">
            Regenerates the document fresh and re-sends it via SignNow — use if a party says they never received it, or the original SignNow
            upload failed.
          </p>
          <div className="flex gap-2 flex-wrap">
            {deal.doc001_url && (
              <Button variant="secondary" loading={saving} onClick={() => resendInvite('doc001')} className="!px-4 !py-2 !text-sm">
                Resend DOC-001
              </Button>
            )}
            {deal.doc002_url && (
              <Button variant="secondary" loading={saving} onClick={() => resendInvite('doc002')} className="!px-4 !py-2 !text-sm">
                Resend DOC-002
              </Button>
            )}
          </div>
        </DarkCard>
      )}

      <DarkCard className="mt-4">
        <h4 className="font-display text-base font-semibold text-white mb-1">Reassign seller/buyer</h4>
        <p className="text-sm text-white/50 mb-4">
          Use if the wrong person was attached (e.g. a seller invited the wrong buyer's phone number). Any KYC/signature already collected under
          the old identity is reset — it doesn't represent the actual party anymore.
        </p>
        <form onSubmit={submitReassign} className="flex gap-2 flex-wrap items-end">
          <Select label="Role" value={reassignRole} onChange={(e) => setReassignRole(e.target.value)} className="w-32">
            <option value="seller">Seller</option>
            <option value="buyer">Buyer</option>
          </Select>
          <Input label="New phone number" value={reassignPhone} onChange={(e) => setReassignPhone(e.target.value)} placeholder="+9715..." className="flex-1 min-w-[200px]" />
          <Button type="submit" variant={accent} loading={saving} className="!px-4 !py-2 !text-sm">
            Reassign
          </Button>
        </form>
      </DarkCard>

      <DarkCard className="mt-4">
        <h4 className="font-display text-base font-semibold text-white mb-1">Correct seller/buyer identity</h4>
        <p className="text-sm text-white/50 mb-4">
          Fixes a KYC misread name/Emirates ID/nationality, or a typo'd phone/email. These fields print on DOC-001/DOC-002 — correcting them
          regenerates and re-sends any document already generated.
        </p>
        <form onSubmit={submitIdentity} className="grid gap-3 sm:grid-cols-2">
          <Select label="Party" value={identityRole} onChange={(e) => setIdentityRole(e.target.value)}>
            <option value="seller">Seller</option>
            <option value="buyer">Buyer</option>
          </Select>
          <div />
          <Input label="Full name" value={identityForm.full_name} onChange={(e) => setIdentityForm((f) => ({ ...f, full_name: e.target.value }))} />
          <Input label="Emirates ID" value={identityForm.emirates_id} onChange={(e) => setIdentityForm((f) => ({ ...f, emirates_id: e.target.value }))} />
          <Input label="Nationality" value={identityForm.nationality} onChange={(e) => setIdentityForm((f) => ({ ...f, nationality: e.target.value }))} />
          <Input label="Phone" value={identityForm.phone} onChange={(e) => setIdentityForm((f) => ({ ...f, phone: e.target.value }))} />
          <Input label="Email" value={identityForm.email} onChange={(e) => setIdentityForm((f) => ({ ...f, email: e.target.value }))} />
          <div className="sm:col-span-2">
            <Button type="submit" variant={accent} loading={saving} className="!px-4 !py-2 !text-sm">
              Save identity correction
            </Button>
          </div>
        </form>
      </DarkCard>

      <DarkCard className="mt-4">
        <h4 className="font-display text-base font-semibold text-white mb-1">Referral partner</h4>
        <p className="text-sm text-white/50 mb-4">
          Attach, correct, or remove the dealer/broker who referred this deal — sellers often only mention this after the deal has already started,
          or the wrong one gets entered. Attaching/changing a partner on a deal that already has DOC-001 generates DOC-003 (or regenerates it if a
          fee override is also saved) and sends it for signature.
        </p>
        <div className="rounded-lg border border-white/8 bg-white/4 p-3 mb-4">
          <Row label="Partner ID" value={deal.referral_partner_id ? deal.referral_partner_id.slice(0, 8) : 'None attached'} mono />
          <Row label="Source" value={deal.referral_source || '—'} />
          <Row label="Referral fee" value={deal.referral_fee ? formatAed(deal.referral_fee) : '—'} />
          <Row label="Fee paid" value={deal.referral_fee_paid ? 'Yes' : 'No'} />
          {deal.referral_partner_id && (
            <Button variant="secondary" loading={saving} onClick={removeReferralPartner} className="!px-3 !py-1.5 !text-xs mt-2">
              Remove referral partner
            </Button>
          )}
        </div>
        <form onSubmit={submitReferral} className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Partner phone (attach or change)"
            value={referralPhone}
            onChange={(e) => setReferralPhone(e.target.value)}
            placeholder="+9715... — leave blank to only change source/fee"
          />
          <Select label="Referral source" value={referralSource} onChange={(e) => setReferralSource(e.target.value)}>
            {REFERRAL_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Input
            label="Referral fee override (AED) — optional"
            type="number"
            min="0"
            value={referralFee}
            onChange={(e) => setReferralFee(e.target.value)}
          />
          <div className="sm:col-span-2">
            <Button type="submit" variant={accent} loading={saving} className="!px-4 !py-2 !text-sm">
              Save referral info
            </Button>
          </div>
        </form>
      </DarkCard>

      <DarkCard className="mt-4 !border-error/30">
        <h4 className="font-display text-base font-semibold text-white mb-1">Force stage (advanced)</h4>
        <p className="text-sm text-white/50 mb-4">
          Bypasses the normal forward-only flow — the only way to reopen a cancelled deal, revert a stage, or un-complete a deal. Does NOT
          re-trigger automation for the new stage (no WhatsApp, no document generation, no TrustIn/escrow calls) — use the tools above afterwards
          if the new stage needs any of that. Moving to an <em>earlier</em> stage automatically resets the verification flag(s) that stage
          requires (e.g. KYC-complete, signed, funds-confirmed), so the deal can't silently skip back past it — you'll still need to manually
          send the affected party the relevant link (see Links card above) since no notification is sent automatically.
        </p>
        <form onSubmit={submitForceStage} className="flex flex-col gap-3">
          <Select label="Target stage" value={forceStageTarget} onChange={(e) => setForceStageTarget(e.target.value)}>
            <option value="">Select a stage…</option>
            {ALL_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s] || s}
              </option>
            ))}
          </Select>
          <Input
            label="Reason (required, for the audit log)"
            value={forceStageReason}
            onChange={(e) => setForceStageReason(e.target.value)}
            placeholder="e.g. cancelled by mistake, both parties want to resume"
          />
          <Button type="submit" variant="secondary" loading={saving} className="!px-4 !py-2 !text-sm self-start" disabled={!forceStageTarget || !forceStageReason.trim()}>
            Force stage change
          </Button>
        </form>
      </DarkCard>

      {auditLog?.length > 0 && (
        <DarkCard className="mt-4">
          <h4 className="font-display text-base font-semibold text-white mb-3">Audit log</h4>
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {auditLog.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-white/8 bg-white/4 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white/80 font-semibold">{entry.action}</span>
                  <span className={entry.status === 'failed' ? 'text-error' : 'text-white/40'}>{entry.status}</span>
                </div>
                <div className="text-white/40 mt-0.5">{new Date(entry.created_at).toLocaleString('en-AE')}</div>
                {entry.payload && <pre className="text-white/50 mt-1 whitespace-pre-wrap break-all">{JSON.stringify(entry.payload)}</pre>}
              </div>
            ))}
          </div>
        </DarkCard>
      )}

      <div className="mt-8">
        <Timeline currentStage={deal.status} />
      </div>
    </div>
  );
}

function LinkRow({ label, link, onCopy }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/4 p-2.5">
      <div className="min-w-0">
        <div className="text-xs text-white/40">{label}</div>
        <div className="text-sm text-white/70 font-mono truncate">{link}</div>
      </div>
      <Button variant="secondary" onClick={() => onCopy(link)} className="!px-3 !py-1.5 !text-xs shrink-0">
        Copy
      </Button>
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
