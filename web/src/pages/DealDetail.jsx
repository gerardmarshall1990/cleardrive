import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DarkCard, GoldCard } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Badge, ProductBadge } from '../components/Badge';
import { ErrorBanner } from '../components/Alert';
import { ProgressSteps } from '../components/ProgressSteps';
import { SkeletonCard } from '../components/Skeleton';
import { STAGES, STAGE_ORDER, STAGE_LABELS, stageIndex } from '../lib/dealStages';
import { formatAed } from '../lib/feeCalculator';
import { fileToBase64 } from '../lib/files';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';

// One deal-detail page for both sides of the trade. Which view renders
// (seller's full action flow, or the buyer's lighter/read-only flow) is
// decided per-deal from `deal.seller_id`/`deal.buyer_id` vs the logged-in
// user's id — not from an account-level role, since the same individual
// account can be the seller on one deal and the buyer on another.
const POLL_STAGES = new Set([
  STAGES.QUOTE,
  STAGES.FINES_VERIFY,
  STAGES.KYC,
  STAGES.DETAILS,
  STAGES.SIGNING,
  STAGES.ESCROW,
  STAGES.TASJEEL,
]);

export default function DealDetail() {
  const { id } = useParams();
  const { user } = useAuth();
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
  const myRole = deal.seller_id === user?.id ? 'seller' : 'buyer';

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="font-display text-2xl font-bold text-white">{deal.ref}</h2>
        <ProductBadge product={deal.product} />
      </div>
      <p className="text-sm text-white/40 mb-6">{deal.plate}</p>

      <ProgressSteps currentStage={deal.status} accent={accent} />

      {myRole === 'seller' && stageIndex(deal.status) < stageIndex(STAGES.ESCROW) && (
        <EditDealDetails deal={deal} onUpdate={setDeal} onError={setError} />
      )}

      <div className="mt-6">
        <ErrorBanner message={error} />
        {myRole === 'seller' ? (
          <SellerStageCard deal={deal} accent={accent} onUpdate={setDeal} onError={setError} />
        ) : (
          <BuyerStageCard deal={deal} onUpdate={setDeal} onError={setError} />
        )}
      </div>

      <div className="mt-8">
        <Timeline currentStage={deal.status} />
      </div>
    </div>
  );
}

// Lets the seller fix a mistake in their own typed-in details (sale price,
// mileage, emirate, proceeds bank account) at any point before escrow, without
// reopening the whole stage flow. Deliberately excludes anything sourced from
// a scanned document (plate/VIN/make/model/year/colour from the Mulkiya,
// loan details from the settlement letter) — those are locked in once
// confirmed at the Details stage; a misread there gets fixed by re-uploading
// the document at that stage, not here.
function EditDealDetails({ deal, onUpdate, onError }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    sale_price: deal.sale_price || '',
    mileage: deal.mileage || '',
    emirate: deal.emirate || EMIRATES[0],
    seller_iban: deal.seller_iban || '',
    seller_acc_name: deal.seller_acc_name || '',
    seller_proc_bank: deal.seller_proc_bank || '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    onError('');
    setMsg('');
    try {
      const { deal: updated } = await api.patch(`/api/deals/${deal.id}/edit`, form);
      onUpdate(updated);
      setMsg('Saved.');
      setOpen(false);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-xs font-semibold text-gold hover:underline"
      >
        Edit deal details
      </button>
    );
  }

  return (
    <DarkCard className="mt-3">
      <h4 className="font-display text-base font-semibold text-white mb-3">Edit deal details</h4>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input label="Sale price (AED)" type="number" min="0" value={form.sale_price} onChange={set('sale_price')} />
        <Input label="Mileage (km)" value={form.mileage} onChange={set('mileage')} />
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
        <p className="text-xs uppercase tracking-wide text-white/40 font-sans font-bold mt-2">Your proceeds account</p>
        <Input label="IBAN" value={form.seller_iban} onChange={set('seller_iban')} />
        <Input label="Account holder name" value={form.seller_acc_name} onChange={set('seller_acc_name')} />
        <Input label="Bank" value={form.seller_proc_bank} onChange={set('seller_proc_bank')} />
        {msg && <p className="text-xs text-green">{msg}</p>}
        <div className="flex gap-2 mt-1">
          <Button type="submit" loading={saving} className="flex-1">
            Save changes
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)} className="flex-1">
            Cancel
          </Button>
        </div>
      </form>
    </DarkCard>
  );
}

// ---------------------------------------------------------------------------
// Seller-side stages — full action flow (fines upload, vehicle/financial
// details, transfer certificate completion).
// ---------------------------------------------------------------------------

function SellerStageCard({ deal, accent, onUpdate, onError }) {
  switch (deal.status) {
    case STAGES.QUOTE:
      return <ContinueCard deal={deal} accent={accent} target={STAGES.FINES_VERIFY} onUpdate={onUpdate} onError={onError} title="Quote created" body="Ready to verify traffic fines." />;
    case STAGES.FINES_VERIFY:
      return <FinesVerifyCard deal={deal} onUpdate={onUpdate} onError={onError} />;
    case STAGES.KYC:
      return <KycCard deal={deal} accent={accent} myRole="seller" onUpdate={onUpdate} onError={onError} />;
    case STAGES.DETAILS:
      return <DetailsCard deal={deal} accent={accent} onUpdate={onUpdate} onError={onError} />;
    case STAGES.SIGNING:
      return <SigningCard deal={deal} showUrls />;
    case STAGES.ESCROW:
      return <EscrowCard deal={deal} isBuyer={false} />;
    case STAGES.TASJEEL:
      return <TasjeelCard deal={deal} accent={accent} onUpdate={onUpdate} onError={onError} />;
    case STAGES.COMPLETE:
      return <CompleteCard deal={deal} isBuyer={false} />;
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

function FinesVerifyCard({ deal, onUpdate, onError }) {
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

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

// Shared upload dropzone for the two document-driven autofill flows below
// (Mulkiya, settlement letter) — visually mirrors FinesVerifyCard's dropzone.
function UploadDropzone({ label, busy, onFile }) {
  return (
    <div>
      <p className="text-sm text-white/60 mb-2">{label}</p>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gold/40 py-6 text-center hover:border-gold transition-colors">
        {busy ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        ) : (
          <>
            <span className="text-xl">📤</span>
            <span className="text-xs text-white/60">Tap to upload photo</span>
          </>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={busy} />
      </label>
    </div>
  );
}

function DetailsCard({ deal, accent, onUpdate, onError }) {
  const [form, setForm] = useState({
    plate: deal.plate || '',
    vin: deal.vin || '',
    make: deal.make || '',
    model: deal.model || '',
    year: deal.year || '',
    colour: deal.colour || '',
    emirate: deal.emirate || EMIRATES[0],
    mileage: deal.mileage || '',
    loan_amount: deal.loan_amount || '',
    loan_account: deal.loan_account || '',
    loan_bank: deal.loan_bank || '',
    seller_iban: deal.seller_iban || '',
    seller_acc_name: deal.seller_acc_name || '',
    seller_proc_bank: deal.seller_proc_bank || '',
  });
  const [buyerPhone, setBuyerPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [mulkiyaBusy, setMulkiyaBusy] = useState(false);
  const [mulkiyaMsg, setMulkiyaMsg] = useState(null);
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [settlementMsg, setSettlementMsg] = useState(null);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  // Mulkiya upload → Claude Vision extraction → autofills the editable fields
  // below (plate, VIN, make, model, year, colour). Nothing is saved until the
  // seller reviews/edits and hits "Save & Continue" — extraction is the
  // primary source, manual typing remains the fallback if it fails.
  async function handleMulkiyaFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMulkiyaBusy(true);
    onError('');
    setMulkiyaMsg(null);
    try {
      const { base64, mediaType } = await fileToBase64(file);
      const { data } = await api.post(`/api/deals/${deal.id}/extract-mulkiya`, { imageBase64: base64, mediaType });
      setForm((f) => ({
        ...f,
        plate: data.plate || f.plate,
        vin: data.chassisNumber || f.vin,
        make: data.make || f.make,
        model: data.model || f.model,
        year: data.year || f.year,
        colour: data.colour || f.colour,
      }));
      setMulkiyaMsg({ ok: true, text: 'Extracted from your Mulkiya — check the fields below and edit anything that looks wrong before saving.' });
    } catch (err) {
      setMulkiyaMsg({ ok: false, text: `${err.message} — enter vehicle details manually below.` });
    } finally {
      setMulkiyaBusy(false);
      e.target.value = '';
    }
  }

  // Settlement letter upload (LoanClear only) → Claude Vision extraction → the
  // exact bank payoff figure and reference become the authoritative loan
  // amount, superseding the estimate entered at quote time. Only saved once
  // the seller reviews/edits and hits "Save & Continue".
  async function handleSettlementFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSettlementBusy(true);
    onError('');
    setSettlementMsg(null);
    try {
      const { base64, mediaType } = await fileToBase64(file);
      const { data } = await api.post(`/api/deals/${deal.id}/extract-settlement`, { imageBase64: base64, mediaType });
      setForm((f) => ({
        ...f,
        loan_amount: data.settlementAmount ?? f.loan_amount,
        loan_account: data.loanReferenceNumber || f.loan_account,
        loan_bank: data.bankName || f.loan_bank,
      }));
      setSettlementMsg({ ok: true, text: 'Extracted from your bank settlement letter — this is the authoritative payoff figure. Review and edit if needed, then save.' });
    } catch (err) {
      setSettlementMsg({ ok: false, text: `${err.message} — enter the settlement amount manually below.` });
    } finally {
      setSettlementBusy(false);
      e.target.value = '';
    }
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

      <UploadDropzone label="Upload Mulkiya (vehicle registration card) to autofill vehicle details" busy={mulkiyaBusy} onFile={handleMulkiyaFile} />
      {mulkiyaMsg && (mulkiyaMsg.ok ? <p className="mt-2 text-xs text-green">{mulkiyaMsg.text}</p> : <ErrorBanner message={mulkiyaMsg.text} />)}

      {deal.product === 'loanclear' && (
        <div className="mt-4">
          <UploadDropzone label="Upload bank settlement letter to autofill the loan payoff amount" busy={settlementBusy} onFile={handleSettlementFile} />
          {settlementMsg && (settlementMsg.ok ? <p className="mt-2 text-xs text-green">{settlementMsg.text}</p> : <ErrorBanner message={settlementMsg.text} />)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-5">
        {!deal.buyer_id && (
          <Input label="Buyer's phone (must already have an account)" type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} required />
        )}
        <Input label="Plate number" value={form.plate} onChange={set('plate')} required />
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
        {deal.product === 'loanclear' && (
          <>
            <p className="text-xs uppercase tracking-wide text-white/40 font-sans font-bold mt-2">Loan settlement (from bank letter)</p>
            <Input label="Settlement amount (AED)" type="number" min="0" value={form.loan_amount} onChange={set('loan_amount')} required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Loan reference number" value={form.loan_account} onChange={set('loan_account')} required />
              <Input label="Bank" value={form.loan_bank} onChange={set('loan_bank')} required />
            </div>
          </>
        )}
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

// ---------------------------------------------------------------------------
// Buyer-side stages — read-only for most of the flow (all deal actions are
// the seller's job); the buyer's own steps are identity verification and
// transferring funds to escrow.
// ---------------------------------------------------------------------------

function BuyerStageCard({ deal, onUpdate, onError }) {
  switch (deal.status) {
    case STAGES.QUOTE:
      return <WaitingCard title="Quote created" body="The seller is preparing this deal — check back soon." />;
    case STAGES.FINES_VERIFY:
      return <WaitingCard title="Verifying traffic fines" body="The seller is verifying the car's traffic fines." />;
    case STAGES.KYC:
      return <KycCard deal={deal} myRole="buyer" onUpdate={onUpdate} onError={onError} />;
    case STAGES.DETAILS:
      return <WaitingCard title="Vehicle & financial details" body="The seller is entering the vehicle and payment details." />;
    case STAGES.SIGNING:
      return <SigningCard deal={deal} showUrls={false} />;
    case STAGES.ESCROW:
      return <EscrowCard deal={deal} isBuyer />;
    case STAGES.TASJEEL:
      return <WaitingCard title="Tasjeel transfer" body="Once ownership is transferred at the RTA, the seller will submit the transfer certificate to finish the deal." />;
    case STAGES.COMPLETE:
      return <CompleteCard deal={deal} isBuyer />;
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

// ---------------------------------------------------------------------------
// Shared between both roles — identity verification, signing, escrow, complete.
// ---------------------------------------------------------------------------

function KycCard({ deal, accent, myRole, onUpdate, onError }) {
  const [loading, setLoading] = useState(false);
  const bothComplete = deal.seller_kyc_complete && deal.buyer_kyc_complete;
  const myComplete = myRole === 'seller' ? deal.seller_kyc_complete : deal.buyer_kyc_complete;

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
        <PartyKycStatus label={myRole === 'seller' ? 'You (seller)' : 'Seller'} complete={deal.seller_kyc_complete} />
        <PartyKycStatus
          label={myRole === 'buyer' ? 'You (buyer)' : 'Buyer'}
          complete={deal.buyer_kyc_complete}
          note={myRole === 'seller' && !deal.buyer_id ? 'No buyer attached yet' : undefined}
        />
      </div>

      {!myComplete && <EidVerifyForm deal={deal} onUpdate={onUpdate} onError={onError} />}

      {myRole === 'seller' ? (
        <>
          <p className="mt-4 text-sm text-white/50">Both parties must complete identity verification before proceeding.</p>
          <Button variant={accent} loading={loading} disabled={!bothComplete} onClick={handleContinue} className="mt-4 w-full">
            {bothComplete ? 'Continue →' : 'Waiting for verification…'}
          </Button>
        </>
      ) : (
        myComplete && !deal.seller_kyc_complete && <p className="mt-4 text-sm text-white/50">You're verified — waiting on the seller.</p>
      )}
    </DarkCard>
  );
}

// Emirates ID upload → Claude Vision extraction → editable review → explicit
// confirm-and-lock via PATCH /:id/kyc. Extraction never auto-saves — the
// extracted fields populate the form below for the user to check/edit before
// they hit "Confirm". Manual typing (leaving the upload step unused) remains
// a full fallback if extraction fails or the photo isn't available.
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

      <p className="mt-3 text-xs font-semibold text-gold">
        Double-check this matches your Emirates ID exactly, letter for letter — this name is used on legally binding deal documents.
      </p>

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

function SigningCard({ deal, showUrls }) {
  const docs = [
    { label: 'DOC-001 — Transaction & Escrow Agreement', url: deal.doc001_url, signed: deal.doc001_signed },
    { label: 'DOC-002 — Limited Power of Attorney', url: deal.doc002_url, signed: deal.doc002_signed },
  ];
  if (deal.referral_partner_id) docs.push({ label: 'DOC-003 — Referral Agreement', url: deal.doc003_url, signed: deal.doc003_signed });

  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white mb-1">Documents & signing</h4>
      <p className="text-sm text-white/50 mb-4">
        {showUrls ? "Review and sign each document. We'll notify you when everyone has signed." : "Check your email for signing links. We'll notify you once everyone has signed."}
      </p>
      <div className="flex flex-col gap-3">
        {docs.map((doc) => (
          <div key={doc.label} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/4 p-3">
            <span className="text-sm text-white/70">{doc.label}</span>
            {doc.signed ? <Badge variant="verified">Signed ✓</Badge> : <Badge variant="pending">Awaiting signature</Badge>}
          </div>
        ))}
      </div>
      {showUrls && (
        <p className="mt-4 text-xs text-white/30">Documents are generated automatically — your ClearDrive contact will confirm once all signatures are collected.</p>
      )}
    </DarkCard>
  );
}

function EscrowCard({ deal, isBuyer }) {
  return (
    <DarkCard>
      <h4 className="font-display text-lg font-semibold text-white mb-1">Escrow</h4>
      <p className="text-sm text-white/50 mb-4">
        {isBuyer ? 'Transfer the agreed sale price to the secure escrow account below.' : "Waiting for the buyer's funds to reach the secure escrow account."}
      </p>
      {deal.trustin_escrow_iban && (
        <div className="rounded-lg border border-gold/25 bg-gold/6 p-4 text-sm">
          <p className="text-white/50">Escrow IBAN</p>
          <p className="font-mono text-white mt-1">{deal.trustin_escrow_iban}</p>
          {isBuyer && (
            <>
              <p className="text-white/50 mt-3">Amount</p>
              <p className="font-mono text-white mt-1">{formatAed(deal.sale_price)}</p>
            </>
          )}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-white/50">Funds received</span>
        {deal.funds_confirmed ? <Badge variant="verified">Confirmed ✓</Badge> : <Badge variant="pending">Pending</Badge>}
      </div>
    </DarkCard>
  );
}

function CompleteCard({ deal, isBuyer }) {
  if (isBuyer) {
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
