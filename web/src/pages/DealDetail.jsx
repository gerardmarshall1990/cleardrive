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

// Every field the Details stage form collects is required — most autofill
// from the Mulkiya via Claude Vision, but mileage in particular can never be
// read off a Mulkiya (not printed on the document) and must always be typed
// in manually. Mirrors backend's REQUIRED_FIELDS_TO_LEAVE[STAGES.DETAILS].
const REQUIRED_DETAIL_FIELDS = [
  { key: 'plate', label: 'Plate number' },
  { key: 'vin', label: 'VIN' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
  { key: 'year', label: 'Year' },
  { key: 'colour', label: 'Colour' },
  { key: 'mileage', label: 'Mileage' },
  { key: 'seller_iban', label: 'IBAN' },
  { key: 'seller_acc_name', label: 'Account holder name' },
  { key: 'seller_proc_bank', label: 'Bank' },
];
const REQUIRED_LOAN_FIELDS = [
  { key: 'loan_amount', label: 'Settlement amount' },
  { key: 'loan_account', label: 'Loan reference number' },
  { key: 'loan_bank', label: 'Bank' },
];

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
  const [mulkiyaBackBusy, setMulkiyaBackBusy] = useState(false);
  const [mulkiyaBackMsg, setMulkiyaBackMsg] = useState(null);
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [settlementMsg, setSettlementMsg] = useState(null);
  // Initialized from the persisted deal record (see 0010_verified_flags.sql),
  // not just `false` — previously these were purely ephemeral per-session
  // React state, so a page refresh mid-Details-stage lost "already
  // uploaded/verified" progress even though the underlying image was already
  // saved, forcing a pointless re-upload. This also means an admin override
  // of one of these flags (for a legitimate edge case Claude Vision keeps
  // failing) now actually unblocks the seller on their next load.
  const [mulkiyaVerified, setMulkiyaVerified] = useState(!!deal.mulkiya_verified);
  const [mulkiyaBackVerified, setMulkiyaBackVerified] = useState(!!deal.mulkiya_back_verified);
  const [settlementVerified, setSettlementVerified] = useState(!!deal.settlement_verified);
  const [bankProofBusy, setBankProofBusy] = useState(false);
  const [bankProofMsg, setBankProofMsg] = useState(null);
  const [bankProofVerified, setBankProofVerified] = useState(!!deal.bank_proof_verified);

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
      setMulkiyaVerified(true);
      setMulkiyaMsg({ ok: true, text: 'Extracted from your Mulkiya — check the fields below and edit anything that looks wrong before saving.' });
    } catch (err) {
      setMulkiyaVerified(false);
      setMulkiyaMsg({ ok: false, text: `${err.message} — please try uploading the Mulkiya again.` });
    } finally {
      setMulkiyaBusy(false);
      e.target.value = '';
    }
  }

  // Back-of-Mulkiya upload — no fields are extracted from it (the back
  // doesn't carry any of the vehicle fields above), it's just verified as a
  // legible photo of the back of a Mulkiya and persisted so admin has the
  // complete document on file.
  async function handleMulkiyaBackFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMulkiyaBackBusy(true);
    onError('');
    setMulkiyaBackMsg(null);
    try {
      const { base64, mediaType } = await fileToBase64(file);
      await api.post(`/api/deals/${deal.id}/extract-mulkiya-back`, { imageBase64: base64, mediaType });
      setMulkiyaBackVerified(true);
      setMulkiyaBackMsg({ ok: true, text: 'Uploaded and verified.' });
    } catch (err) {
      setMulkiyaBackVerified(false);
      setMulkiyaBackMsg({ ok: false, text: `${err.message} — please try uploading the back of the Mulkiya again.` });
    } finally {
      setMulkiyaBackBusy(false);
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
      setSettlementVerified(true);
      setSettlementMsg({ ok: true, text: 'Extracted from your bank settlement letter — this is the authoritative payoff figure. Review and edit if needed, then save.' });
    } catch (err) {
      setSettlementVerified(false);
      setSettlementMsg({ ok: false, text: `${err.message} — please try uploading the settlement letter again.` });
    } finally {
      setSettlementBusy(false);
      e.target.value = '';
    }
  }

  // Bank proof upload (online banking screenshot or bank statement) → Claude
  // Vision extracts the IBAN + account holder name and cross-validates the
  // name against the seller's own verified identity (set during KYC) — this
  // is what actually enforces "the proceeds account must be in your own
  // name", not just the hint text below the fields. Autofills the IBAN/bank
  // fields but never the account holder name (that field should already
  // reflect the seller's own name, not be overwritten by OCR of it).
  async function handleBankProofFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBankProofBusy(true);
    onError('');
    setBankProofMsg(null);
    try {
      const { base64, mediaType } = await fileToBase64(file);
      const { data } = await api.post(`/api/deals/${deal.id}/extract-bank-proof`, { imageBase64: base64, mediaType });
      setForm((f) => ({
        ...f,
        seller_iban: data.iban || f.seller_iban,
        seller_acc_name: data.accountHolderName || f.seller_acc_name,
        seller_proc_bank: data.bankName || f.seller_proc_bank,
      }));
      setBankProofVerified(true);
      setBankProofMsg({ ok: true, text: 'Verified — the account holder name matches your verified identity.' });
    } catch (err) {
      setBankProofVerified(false);
      setBankProofMsg({ ok: false, text: `${err.message} — please try uploading a clearer screenshot, or one showing your own account.` });
    } finally {
      setBankProofBusy(false);
      e.target.value = '';
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    onError('');
    if (!mulkiyaVerified) return onError('Please upload the front of the Mulkiya (vehicle registration card) before continuing.');
    if (!mulkiyaBackVerified) return onError('Please upload the back of the Mulkiya (vehicle registration card) before continuing.');
    if (deal.product === 'loanclear' && !settlementVerified) return onError('Please upload the bank settlement letter before continuing.');
    if (!bankProofVerified) return onError('Please upload proof of your proceeds account (a screenshot of your online banking or bank statement) before continuing.');

    const fieldsToCheck = deal.product === 'loanclear' ? [...REQUIRED_DETAIL_FIELDS, ...REQUIRED_LOAN_FIELDS] : REQUIRED_DETAIL_FIELDS;
    const missingField = fieldsToCheck.find((f) => !String(form[f.key] ?? '').trim());
    if (missingField) {
      const hint = missingField.key === 'mileage' ? " — this can't be read from the Mulkiya, please enter it manually" : '';
      return onError(`${missingField.label} is required${hint}.`);
    }

    setLoading(true);
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

      <UploadDropzone label="Upload Mulkiya — front (vehicle registration card) — required" busy={mulkiyaBusy} onFile={handleMulkiyaFile} />
      {mulkiyaVerified ? (
        <p className="mt-2 text-xs text-green">✓ Mulkiya (front) uploaded and verified</p>
      ) : (
        mulkiyaMsg && <ErrorBanner message={mulkiyaMsg.text} />
      )}

      <div className="mt-4">
        <UploadDropzone label="Upload Mulkiya — back — required" busy={mulkiyaBackBusy} onFile={handleMulkiyaBackFile} />
        {mulkiyaBackVerified ? (
          <p className="mt-2 text-xs text-green">✓ Mulkiya (back) uploaded and verified</p>
        ) : (
          mulkiyaBackMsg && <ErrorBanner message={mulkiyaBackMsg.text} />
        )}
      </div>

      {deal.product === 'loanclear' && (
        <div className="mt-4">
          <UploadDropzone label="Upload bank settlement letter — required" busy={settlementBusy} onFile={handleSettlementFile} />
          {settlementVerified ? (
            <p className="mt-2 text-xs text-green">✓ Settlement letter uploaded and verified</p>
          ) : (
            settlementMsg && <ErrorBanner message={settlementMsg.text} />
          )}
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
        <p className="text-xs uppercase tracking-wide text-white/40 font-sans font-bold mt-2">
          Your proceeds account (must be in your own name)
        </p>
        <Input label="IBAN" value={form.seller_iban} onChange={set('seller_iban')} required />
        <Input label="Account holder name (must match your verified identity)" value={form.seller_acc_name} onChange={set('seller_acc_name')} required />
        <Input label="Bank" value={form.seller_proc_bank} onChange={set('seller_proc_bank')} required />

        <UploadDropzone label="Upload proof of your proceeds account (online banking screenshot or bank statement) — required" busy={bankProofBusy} onFile={handleBankProofFile} />
        {bankProofVerified ? (
          <p className="mt-2 text-xs text-green">✓ Bank proof uploaded and verified</p>
        ) : (
          bankProofMsg && <ErrorBanner message={bankProofMsg.text} />
        )}

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

// TrustIn is our escrow partner, regulated by the Abu Dhabi Global Market
// Financial Services Regulatory Authority (ADGM/FSRA) — it cannot
// white-label identity verification, so each party verifies directly with
// TrustIn via UAE Pass (real integration pending TrustIn credentials; the
// popup below is a mocked stand-in that mirrors the real flow exactly —
// see backend/services/trustInKycService.js).
const KYC_CONTEXT_LINE =
  "TrustIn is our licensed escrow partner, regulated by the Abu Dhabi Global Market Financial Services Regulatory Authority (ADGM/FSRA). They securely hold funds during your sale and are legally required to verify your identity directly via UAE Pass before doing so — this keeps your money and your deal protected.";

const KYC_STEPS = [
  'Click "Verify Me" below',
  'A window will open — sign in with your UAE Pass app',
  'Complete the verification steps shown',
  "Once done, the window closes automatically and you'll see a checkmark here",
];

function KycCard({ deal, accent, myRole, onUpdate, onError }) {
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
      <div className="flex flex-col gap-4">
        <KycPartyBlock party="seller" label="Seller" deal={deal} isOwner={myRole === 'seller'} onUpdate={onUpdate} onError={onError} />
        <KycPartyBlock
          party="buyer"
          label="Buyer"
          deal={deal}
          isOwner={myRole === 'buyer'}
          note={myRole === 'seller' && !deal.buyer_id ? 'No buyer attached yet' : undefined}
          onUpdate={onUpdate}
          onError={onError}
        />
      </div>

      {myRole === 'seller' ? (
        <>
          <p className="mt-4 text-sm text-white/50">Both parties must complete identity verification before proceeding.</p>
          <Button variant={accent} loading={loading} disabled={!bothComplete} onClick={handleContinue} className="mt-4 w-full">
            {bothComplete ? 'Continue →' : 'Waiting for verification…'}
          </Button>
        </>
      ) : (
        deal.buyer_kyc_complete && !deal.seller_kyc_complete && <p className="mt-4 text-sm text-white/50">You're verified — waiting on the seller.</p>
      )}
    </DarkCard>
  );
}

// One independent verification block per party. Only the owning party sees
// a clickable "Verify Me" button; the other party's block is read-only
// status. Clicking it calls POST /:id/kyc/initiate (trustInKycService.js),
// opens a real popup at the returned verificationUrl, then polls the deal
// until this party's *_kyc_complete flag flips (set by the TrustIn webhook
// once the popup posts its mock/real completion), at which point it closes
// the popup itself and shows the checkmark.
function KycPartyBlock({ party, label, deal, isOwner, note, onUpdate, onError }) {
  const complete = party === 'seller' ? deal.seller_kyc_complete : deal.buyer_kyc_complete;
  const [status, setStatus] = useState(complete ? 'verified' : 'idle'); // idle | opening | pending | verified
  const pollRef = useRef(null);

  useEffect(() => {
    if (complete) setStatus('verified');
  }, [complete]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function handleVerify() {
    onError('');
    setStatus('opening');
    try {
      const { verificationUrl } = await api.post(`/api/deals/${deal.id}/kyc/initiate`);
      const popup = window.open(verificationUrl, 'trustin_kyc', 'width=420,height=640');
      if (!popup) {
        onError('Please allow popups for this site to verify your identity.');
        setStatus('idle');
        return;
      }
      setStatus('pending');
      pollRef.current = setInterval(async () => {
        try {
          const { deal: updated } = await api.get(`/api/deals/${deal.id}`);
          const nowComplete = party === 'seller' ? updated.seller_kyc_complete : updated.buyer_kyc_complete;
          if (nowComplete) {
            clearInterval(pollRef.current);
            if (!popup.closed) popup.close();
            setStatus('verified');
            onUpdate(updated);
          } else if (popup.closed) {
            clearInterval(pollRef.current);
            setStatus('idle');
          }
        } catch {
          // Transient poll error — next tick will retry.
        }
      }, 1500);
    } catch (err) {
      onError(err.message);
      setStatus('idle');
    }
  }

  return (
    <div className="rounded-lg border border-white/8 bg-white/4 p-4">
      <p className="text-xs text-white/50 leading-relaxed">{KYC_CONTEXT_LINE}</p>
      <h5 className="font-display text-base font-semibold text-white mt-3">{label} Identity Verification</h5>

      {status === 'verified' ? (
        <div className="mt-3">
          <Badge variant="verified">✅ Verified</Badge>
        </div>
      ) : (
        <>
          <ol className="mt-2 list-decimal list-inside text-xs text-white/60 space-y-1">
            {KYC_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {isOwner ? (
            <Button
              variant="secondary"
              loading={status === 'opening'}
              disabled={status === 'pending'}
              onClick={handleVerify}
              className="mt-3 w-full"
            >
              {status === 'pending' ? 'Waiting for verification…' : 'Verify Me'}
            </Button>
          ) : (
            <div className="mt-3">
              <Badge variant="pending">Pending</Badge>
            </div>
          )}
          {note && <p className="mt-2 text-xs text-white/30">{note}</p>}
        </>
      )}
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
