import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Linking, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { DarkCard, GoldCard } from '../components/Card';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import { Badge, ProductBadge } from '../components/Badge';
import { ErrorBanner } from '../components/Alert';
import { ProgressSteps } from '../components/ProgressSteps';
import { SkeletonCard } from '../components/Skeleton';
import { STAGES, STAGE_ORDER, STAGE_LABELS, stageIndex } from '../lib/dealStages';
import { formatAed } from '../lib/feeCalculator';
import { assetToBase64 } from '../lib/files';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { colors, fonts } from '../theme/theme';

// Buyer's superset of poll stages, used for everyone — mirrors web DealDetail.
const POLL_STAGES = new Set([
  STAGES.QUOTE,
  STAGES.FINES_VERIFY,
  STAGES.KYC,
  STAGES.DETAILS,
  STAGES.SIGNING,
  STAGES.ESCROW,
  STAGES.TASJEEL,
]);

export default function DealDetail({ route }) {
  const { id } = route.params;
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
      <ScrollView style={{ backgroundColor: colors.navy }} contentContainerStyle={styles.wrap}>
        <SkeletonCard />
        <ErrorBanner message={error} />
      </ScrollView>
    );
  }

  const accent = deal.product === 'safepay' ? 'green' : 'gold';
  const myRole = deal.seller_id === user?.id ? 'seller' : 'buyer';

  return (
    <ScrollView style={{ backgroundColor: colors.navy }} contentContainerStyle={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.ref}>{deal.ref}</Text>
        <ProductBadge product={deal.product} />
      </View>
      <Text style={styles.plate}>{deal.plate}</Text>

      <ProgressSteps currentStage={deal.status} accent={accent} />

      {myRole === 'seller' && stageIndex(deal.status) < stageIndex(STAGES.ESCROW) && (
        <EditDealDetails deal={deal} onUpdate={setDeal} onError={setError} />
      )}

      <ErrorBanner message={error} />

      {myRole === 'seller' ? (
        <SellerStageCard deal={deal} accent={accent} onUpdate={setDeal} onError={setError} />
      ) : (
        <BuyerStageCard deal={deal} onUpdate={setDeal} onError={setError} />
      )}

      <View style={{ marginTop: 24 }}>
        <Timeline currentStage={deal.status} />
      </View>
    </ScrollView>
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
    sale_price: deal.sale_price ? String(deal.sale_price) : '',
    mileage: deal.mileage ? String(deal.mileage) : '',
    emirate: deal.emirate || EMIRATES[0],
    seller_iban: deal.seller_iban || '',
    seller_acc_name: deal.seller_acc_name || '',
    seller_proc_bank: deal.seller_proc_bank || '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
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
      <Pressable onPress={() => setOpen(true)}>
        <Text style={styles.editLink}>Edit deal details</Text>
      </Pressable>
    );
  }

  return (
    <DarkCard style={{ marginTop: 12 }}>
      <Text style={styles.editTitle}>Edit deal details</Text>
      <View style={{ gap: 10 }}>
        <Input label="Sale price (AED)" keyboardType="numeric" value={form.sale_price} onChangeText={(v) => set('sale_price', v)} />
        <Input label="Mileage (km)" value={form.mileage} onChangeText={(v) => set('mileage', v)} />
        <Select label="Emirate" selectedValue={form.emirate} onValueChange={(v) => set('emirate', v)}>
          {EMIRATES.map((em) => (
            <Select.Item key={em} label={em} value={em} />
          ))}
        </Select>
        <Text style={styles.sectionLabel}>Your proceeds account</Text>
        <Input label="IBAN" value={form.seller_iban} onChangeText={(v) => set('seller_iban', v)} />
        <Input label="Account holder name" value={form.seller_acc_name} onChangeText={(v) => set('seller_acc_name', v)} />
        <Input label="Bank" value={form.seller_proc_bank} onChangeText={(v) => set('seller_proc_bank', v)} />
        {msg ? <Text style={styles.savedMsg}>{msg}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Button loading={saving} onPress={handleSubmit} style={{ flex: 1 }}>
            Save changes
          </Button>
          <Button variant="secondary" onPress={() => setOpen(false)} style={{ flex: 1 }}>
            Cancel
          </Button>
        </View>
      </View>
    </DarkCard>
  );
}

function SellerStageCard({ deal, accent, onUpdate, onError }) {
  switch (deal.status) {
    case STAGES.QUOTE:
      return <ContinueCard deal={deal} accent={accent} target={STAGES.FINES_VERIFY} onUpdate={onUpdate} onError={onError} title="Quote created" body="Ready to verify traffic fines." />;
    case STAGES.FINES_VERIFY:
      return <FinesVerifyCard deal={deal} onUpdate={onUpdate} onError={onError} />;
    case STAGES.KYC:
      return <KycCard deal={deal} myRole="seller" accent={accent} onUpdate={onUpdate} onError={onError} />;
    case STAGES.DETAILS:
      return <DetailsCard deal={deal} accent={accent} onUpdate={onUpdate} onError={onError} />;
    case STAGES.SIGNING:
      return <SigningCard deal={deal} isBuyer={false} />;
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
      return <SigningCard deal={deal} isBuyer />;
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
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </DarkCard>
  );
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
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
      <Button variant={accent} loading={loading} onPress={handleContinue} style={{ marginTop: 16 }}>
        Continue →
      </Button>
    </DarkCard>
  );
}

function FinesVerifyCard({ deal, onUpdate, onError }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function handlePick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return onError('Photo library permission is required to upload a screenshot');

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setBusy(true);
    onError('');
    setResult(null);
    try {
      const { base64, mediaType } = await assetToBase64(res.assets[0]);
      const fv = await api.post(`/api/deals/${deal.id}/fines-verify`, { imageBase64: base64, mediaType });
      setResult({ ok: true, plate: fv.deal.plate, fines: fv.deal.fines_amount });
      const { deal: advanced } = await api.put(`/api/deals/${deal.id}/stage`, { targetStage: STAGES.KYC });
      onUpdate(advanced);
    } catch (err) {
      setResult({ ok: false, reason: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>Verify traffic fines</Text>
      <View style={styles.instructions}>
        <Text style={styles.instructionLine}>1. Open your RTA Dubai app</Text>
        <Text style={styles.instructionLine}>2. Tap Vehicle Services → Traffic Fines</Text>
        <Text style={styles.instructionLine}>3. Screenshot the results screen</Text>
        <Text style={styles.instructionLine}>4. Upload it below</Text>
      </View>

      <Pressable onPress={handlePick} disabled={busy} style={styles.dropzone}>
        {busy ? (
          <ActivityIndicator color={colors.gold} />
        ) : (
          <>
            <Text style={{ fontSize: 24 }}>📤</Text>
            <Text style={styles.dropzoneText}>Tap to upload screenshot</Text>
          </>
        )}
      </Pressable>

      {result?.ok && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>✓ Plate: {result.plate}</Text>
          <Text style={styles.successText}>✓ Fines: {formatAed(result.fines)}</Text>
          <Text style={styles.successText}>✓ Verified — moving to identity check…</Text>
        </View>
      )}
      {result && !result.ok && <ErrorBanner message={result.reason} />}
    </DarkCard>
  );
}

// TrustIn is our escrow partner, regulated by the Abu Dhabi Global Market
// Financial Services Regulatory Authority (ADGM/FSRA) — it cannot
// white-label identity verification, so each party verifies directly with
// TrustIn via UAE Pass (real integration pending TrustIn credentials; the
// popup below is a mocked stand-in that mirrors the real flow exactly —
// see backend/services/trustInKycService.js).
const KYC_CONTEXT_LINE =
  "TrustIn is our licensed escrow partner, regulated by the Abu Dhabi Global Market Financial Services Regulatory Authority (ADGM/FSRA). They securely hold funds during your sale and are legally required to verify your identity directly via UAE Pass before doing so — this keeps your money and your deal protected.";

const KYC_STEPS = [
  'Tap "Verify Me" below',
  'A window will open — sign in with your UAE Pass app',
  'Complete the verification steps shown',
  "Once done, the window closes automatically and you'll see a checkmark here",
];

function KycCard({ deal, myRole, accent, onUpdate, onError }) {
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
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Identity verification</Text>
      <View style={{ gap: 12 }}>
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
      </View>

      {myRole === 'seller' ? (
        <>
          <Text style={[styles.cardBody, { marginTop: 12 }]}>Both parties must complete identity verification before proceeding.</Text>
          <Button variant={accent} loading={loading} disabled={!bothComplete} onPress={handleContinue} style={{ marginTop: 16 }}>
            {bothComplete ? 'Continue →' : 'Waiting for verification…'}
          </Button>
        </>
      ) : (
        deal.buyer_kyc_complete && !deal.seller_kyc_complete && (
          <Text style={[styles.cardBody, { marginTop: 12 }]}>You're verified — waiting on the seller.</Text>
        )
      )}
    </DarkCard>
  );
}

// One independent verification block per party. Only the owning party sees
// a clickable "Verify Me" button; the other party's block is read-only
// status. Tapping it calls POST /:id/kyc/initiate (trustInKycService.js),
// opens the returned verificationUrl in an in-app browser (WebBrowser —
// the RN equivalent of a real popup window), then polls the deal until this
// party's *_kyc_complete flag flips (set by the TrustIn webhook once the
// popup posts its mock/real completion), at which point it dismisses the
// browser itself and shows the checkmark.
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
      setStatus('pending');

      pollRef.current = setInterval(async () => {
        try {
          const { deal: updated } = await api.get(`/api/deals/${deal.id}`);
          const nowComplete = party === 'seller' ? updated.seller_kyc_complete : updated.buyer_kyc_complete;
          if (nowComplete) {
            clearInterval(pollRef.current);
            WebBrowser.dismissBrowser();
            setStatus('verified');
            onUpdate(updated);
          }
        } catch {
          // Transient poll error — next tick will retry.
        }
      }, 1500);

      const result = await WebBrowser.openBrowserAsync(verificationUrl);
      clearInterval(pollRef.current);
      if (result.type !== 'dismiss' && result.type !== 'cancel') return;
      // Final check in case the flag flipped right as the browser closed.
      const { deal: updated } = await api.get(`/api/deals/${deal.id}`);
      const nowComplete = party === 'seller' ? updated.seller_kyc_complete : updated.buyer_kyc_complete;
      setStatus(nowComplete ? 'verified' : 'idle');
      if (nowComplete) onUpdate(updated);
    } catch (err) {
      clearInterval(pollRef.current);
      onError(err.message);
      setStatus('idle');
    }
  }

  return (
    <View style={styles.kycBlock}>
      <Text style={styles.kycContextLine}>{KYC_CONTEXT_LINE}</Text>
      <Text style={styles.kycHeadline}>{label} Identity Verification</Text>

      {status === 'verified' ? (
        <View style={{ marginTop: 10 }}>
          <Badge variant="verified">✅ Verified</Badge>
        </View>
      ) : (
        <>
          <View style={{ marginTop: 6, gap: 3 }}>
            {KYC_STEPS.map((step, i) => (
              <Text key={step} style={styles.kycStep}>
                {i + 1}. {step}
              </Text>
            ))}
          </View>
          {isOwner ? (
            <Button
              variant="secondary"
              loading={status === 'opening' || status === 'pending'}
              disabled={status === 'pending'}
              onPress={handleVerify}
              style={{ marginTop: 10 }}
            >
              {status === 'pending' ? 'Waiting for verification…' : 'Verify Me'}
            </Button>
          ) : (
            <View style={{ marginTop: 10 }}>
              <Badge variant="pending">Pending</Badge>
            </View>
          )}
          {note && <Text style={styles.kycNote}>{note}</Text>}
        </>
      )}
    </View>
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

// Shared dropzone for the document-driven autofill flows (Mulkiya, settlement
// letter, Emirates ID) — mirrors FinesVerifyCard's dropzone, sized down.
function UploadDropzone({ label, text = 'Tap to upload photo', busy, onPick }) {
  return (
    <View>
      {label && <Text style={styles.uploadLabel}>{label}</Text>}
      <Pressable onPress={onPick} disabled={busy} style={styles.dropzoneSmall}>
        {busy ? (
          <ActivityIndicator color={colors.gold} />
        ) : (
          <>
            <Text style={{ fontSize: 20 }}>📤</Text>
            <Text style={styles.dropzoneTextSmall}>{text}</Text>
          </>
        )}
      </Pressable>
    </View>
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
  // Initialized from the persisted deal record (see 0010_verified_flags.sql),
  // not just `false` — previously these were purely ephemeral per-session
  // state, so a screen reload mid-Details-stage lost "already
  // uploaded/verified" progress even though the underlying image was already
  // saved, forcing a pointless re-upload. Also means an admin override of one
  // of these flags now actually unblocks the seller on their next load.
  const [mulkiyaVerified, setMulkiyaVerified] = useState(!!deal.mulkiya_verified);
  const [mulkiyaBackBusy, setMulkiyaBackBusy] = useState(false);
  const [mulkiyaBackMsg, setMulkiyaBackMsg] = useState(null);
  const [mulkiyaBackVerified, setMulkiyaBackVerified] = useState(!!deal.mulkiya_back_verified);
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [settlementMsg, setSettlementMsg] = useState(null);
  const [settlementVerified, setSettlementVerified] = useState(!!deal.settlement_verified);
  const [bankProofBusy, setBankProofBusy] = useState(false);
  const [bankProofMsg, setBankProofMsg] = useState(null);
  const [bankProofVerified, setBankProofVerified] = useState(!!deal.bank_proof_verified);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Mulkiya upload → Claude Vision extraction → autofills the editable fields
  // below (plate, VIN, make, model, year, colour). Nothing is saved until the
  // seller reviews/edits and hits "Save & Continue" — extraction is the
  // primary source, manual typing remains the fallback if it fails.
  async function handleMulkiyaFile() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return onError('Photo library permission is required to upload a photo');

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setMulkiyaBusy(true);
    onError('');
    setMulkiyaMsg(null);
    try {
      const { base64, mediaType } = await assetToBase64(res.assets[0]);
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
    }
  }

  // Back-of-Mulkiya upload — no fields are extracted from it (the back
  // doesn't carry any of the vehicle fields above), it's just verified as a
  // legible photo of the back of a Mulkiya and persisted so admin has the
  // complete document on file.
  async function handleMulkiyaBackFile() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return onError('Photo library permission is required to upload a photo');

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setMulkiyaBackBusy(true);
    onError('');
    setMulkiyaBackMsg(null);
    try {
      const { base64, mediaType } = await assetToBase64(res.assets[0]);
      await api.post(`/api/deals/${deal.id}/extract-mulkiya-back`, { imageBase64: base64, mediaType });
      setMulkiyaBackVerified(true);
      setMulkiyaBackMsg({ ok: true, text: 'Uploaded and verified.' });
    } catch (err) {
      setMulkiyaBackVerified(false);
      setMulkiyaBackMsg({ ok: false, text: `${err.message} — please try uploading the back of the Mulkiya again.` });
    } finally {
      setMulkiyaBackBusy(false);
    }
  }

  // Settlement letter upload (LoanClear only) → Claude Vision extraction → the
  // exact bank payoff figure and reference become the authoritative loan
  // amount, superseding the estimate entered at quote time. Only saved once
  // the seller reviews/edits and hits "Save & Continue".
  async function handleSettlementFile() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return onError('Photo library permission is required to upload a photo');

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setSettlementBusy(true);
    onError('');
    setSettlementMsg(null);
    try {
      const { base64, mediaType } = await assetToBase64(res.assets[0]);
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
    }
  }

  // Bank proof upload (online banking screenshot or bank statement) → Claude
  // Vision extracts the IBAN + account holder name and cross-validates the
  // name against the seller's own verified identity (set during KYC) — this
  // is what actually enforces "the proceeds account must be in your own
  // name", not just the label text below. Autofills IBAN/bank but never the
  // account holder name (that field should already reflect the seller's own
  // name, not be overwritten by OCR of it).
  async function handleBankProofFile() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return onError('Photo library permission is required to upload a photo');

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setBankProofBusy(true);
    onError('');
    setBankProofMsg(null);
    try {
      const { base64, mediaType } = await assetToBase64(res.assets[0]);
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
    }
  }

  async function handleSubmit() {
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
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Vehicle & financial details</Text>

      <UploadDropzone
        label="Upload Mulkiya — front (vehicle registration card) — required"
        busy={mulkiyaBusy}
        onPick={handleMulkiyaFile}
      />
      {mulkiyaVerified ? (
        <Text style={styles.savedMsg}>✓ Mulkiya (front) uploaded and verified</Text>
      ) : (
        mulkiyaMsg && <ErrorBanner message={mulkiyaMsg.text} />
      )}

      <View style={{ marginTop: 14 }}>
        <UploadDropzone label="Upload Mulkiya — back — required" busy={mulkiyaBackBusy} onPick={handleMulkiyaBackFile} />
        {mulkiyaBackVerified ? (
          <Text style={styles.savedMsg}>✓ Mulkiya (back) uploaded and verified</Text>
        ) : (
          mulkiyaBackMsg && <ErrorBanner message={mulkiyaBackMsg.text} />
        )}
      </View>

      {deal.product === 'loanclear' && (
        <View style={{ marginTop: 14 }}>
          <UploadDropzone
            label="Upload bank settlement letter — required"
            busy={settlementBusy}
            onPick={handleSettlementFile}
          />
          {settlementVerified ? (
            <Text style={styles.savedMsg}>✓ Settlement letter uploaded and verified</Text>
          ) : (
            settlementMsg && <ErrorBanner message={settlementMsg.text} />
          )}
        </View>
      )}

      <View style={{ gap: 14, marginTop: 18 }}>
        {!deal.buyer_id && (
          <Input label="Buyer's phone (must already have an account)" keyboardType="phone-pad" value={buyerPhone} onChangeText={setBuyerPhone} />
        )}
        <Input label="Plate number" value={form.plate} onChangeText={(v) => set('plate', v)} />
        <Input label="VIN (from Mulkiya)" value={form.vin} onChangeText={(v) => set('vin', v)} />
        <Input label="Make" value={form.make} onChangeText={(v) => set('make', v)} />
        <Input label="Model" value={form.model} onChangeText={(v) => set('model', v)} />
        <Input label="Year" keyboardType="numeric" value={String(form.year)} onChangeText={(v) => set('year', v)} />
        <Input label="Colour" value={form.colour} onChangeText={(v) => set('colour', v)} />
        <Input label="Mileage (km)" keyboardType="numeric" value={String(form.mileage)} onChangeText={(v) => set('mileage', v)} />
        <Select label="Emirate" selectedValue={form.emirate} onValueChange={(v) => set('emirate', v)}>
          {EMIRATES.map((em) => (
            <Select.Item key={em} label={em} value={em} />
          ))}
        </Select>
        {deal.product === 'loanclear' && (
          <>
            <Text style={styles.sectionLabel}>Loan settlement (from bank letter)</Text>
            <Input label="Settlement amount (AED)" keyboardType="numeric" value={String(form.loan_amount)} onChangeText={(v) => set('loan_amount', v)} />
            <Input label="Loan reference number" value={form.loan_account} onChangeText={(v) => set('loan_account', v)} />
            <Input label="Bank" value={form.loan_bank} onChangeText={(v) => set('loan_bank', v)} />
          </>
        )}
        <Text style={styles.sectionLabel}>Your proceeds account (must be in your own name)</Text>
        <Input label="IBAN" value={form.seller_iban} onChangeText={(v) => set('seller_iban', v)} />
        <Input label="Account holder name (must match your verified identity)" value={form.seller_acc_name} onChangeText={(v) => set('seller_acc_name', v)} />
        <Input label="Bank" value={form.seller_proc_bank} onChangeText={(v) => set('seller_proc_bank', v)} />

        <UploadDropzone
          label="Upload proof of your proceeds account (online banking screenshot or bank statement) — required"
          busy={bankProofBusy}
          onPick={handleBankProofFile}
        />
        {bankProofVerified ? (
          <Text style={styles.savedMsg}>✓ Bank proof uploaded and verified</Text>
        ) : (
          bankProofMsg && <ErrorBanner message={bankProofMsg.text} />
        )}

        <Button variant={accent} loading={loading} onPress={handleSubmit}>
          Save & Continue →
        </Button>
      </View>
    </DarkCard>
  );
}

function SigningCard({ deal, isBuyer }) {
  const docs = [
    { label: 'DOC-001 — Transaction & Escrow Agreement', signed: deal.doc001_signed },
    { label: 'DOC-002 — Limited Power of Attorney', signed: deal.doc002_signed },
  ];
  if (deal.referral_partner_id) docs.push({ label: 'DOC-003 — Referral Agreement', signed: deal.doc003_signed });

  return (
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>Documents & signing</Text>
      <Text style={[styles.cardBody, { marginBottom: 12 }]}>
        {isBuyer
          ? "Check your email for signing links. We'll notify you once everyone has signed."
          : "Review and sign each document. We'll notify you when everyone has signed."}
      </Text>
      <View style={{ gap: 10 }}>
        {docs.map((doc) => (
          <View key={doc.label} style={styles.docRow}>
            <Text style={styles.docLabel}>{doc.label}</Text>
            {doc.signed ? <Badge variant="verified">Signed ✓</Badge> : <Badge variant="pending">Awaiting signature</Badge>}
          </View>
        ))}
      </View>
    </DarkCard>
  );
}

function EscrowCard({ deal, isBuyer }) {
  return (
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>Escrow</Text>
      <Text style={[styles.cardBody, { marginBottom: 12 }]}>
        {isBuyer ? 'Transfer the agreed sale price to the secure escrow account below.' : "Waiting for the buyer's funds to reach the secure escrow account."}
      </Text>
      {deal.trustin_escrow_iban && (
        <View style={styles.escrowBox}>
          <Text style={styles.rowLabel}>Escrow IBAN</Text>
          <Text style={styles.escrowIban}>{deal.trustin_escrow_iban}</Text>
          {isBuyer && (
            <>
              <Text style={[styles.rowLabel, { marginTop: 10 }]}>Amount</Text>
              <Text style={styles.escrowIban}>{formatAed(deal.sale_price)}</Text>
            </>
          )}
        </View>
      )}
      <View style={[styles.row, { marginTop: 12 }]}>
        <Text style={styles.rowLabel}>Funds received</Text>
        {deal.funds_confirmed ? <Badge variant="verified">Confirmed ✓</Badge> : <Badge variant="pending">Pending</Badge>}
      </View>
    </DarkCard>
  );
}

function TasjeelCard({ deal, accent, onUpdate, onError }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
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
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>Tasjeel transfer</Text>
      <View style={[styles.row, { marginTop: 12 }]}>
        <Text style={styles.rowLabel}>Loan cleared</Text>
        {deal.product === 'safepay' ? <Badge variant="verified">N/A</Badge> : deal.loan_cleared ? <Badge variant="verified">Cleared ✓</Badge> : <Badge variant="pending">Pending</Badge>}
      </View>
      <View style={[styles.row, { marginTop: 8 }]}>
        <Text style={styles.rowLabel}>Fines cleared</Text>
        {deal.fines_cleared ? <Badge variant="verified">Cleared ✓</Badge> : <Badge variant="pending">Pending</Badge>}
      </View>
      <Text style={[styles.cardBody, { marginVertical: 12 }]}>Once you've completed the RTA ownership transfer, submit your transfer certificate to finish the deal.</Text>
      <Input label="Transfer certificate reference" value={url} onChangeText={setUrl} />
      <Button variant={accent} loading={loading} onPress={handleSubmit} style={{ marginTop: 12 }}>
        Complete deal →
      </Button>
    </DarkCard>
  );
}

function CompleteCard({ deal, isBuyer }) {
  return (
    <GoldCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>🎉 Deal complete</Text>
      {isBuyer ? (
        <>
          <Text style={styles.cardBody}>The vehicle transfer is complete and funds have been released to the seller.</Text>
          {deal.transfer_cert_url && (
            <Pressable onPress={() => Linking.openURL(deal.transfer_cert_url)}>
              <Text style={styles.link}>View transfer certificate →</Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <Text style={[styles.cardBody, { marginBottom: 12 }]}>Your proceeds have been released to your account.</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Net proceeds released</Text>
            <Text style={styles.completeAmount}>{formatAed(deal.net_proceeds)}</Text>
          </View>
        </>
      )}
    </GoldCard>
  );
}

function Timeline({ currentStage }) {
  const currentIdx = stageIndex(currentStage);
  return (
    <View>
      <Text style={styles.timelineHeading}>Timeline</Text>
      <View style={{ gap: 8 }}>
        {STAGE_ORDER.map((stage, idx) => (
          <View key={stage} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: idx <= currentIdx ? colors.green : colors.white20 }}>{idx < currentIdx ? '✓' : idx === currentIdx ? '●' : '○'}</Text>
            <Text style={{ color: idx <= currentIdx ? colors.white70 : colors.white30, fontFamily: fonts.sans, fontSize: 13 }}>{STAGE_LABELS[stage]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 48 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ref: { fontFamily: fonts.display, fontSize: 20, fontWeight: 'bold', color: colors.white },
  plate: { fontFamily: fonts.sans, fontSize: 13, color: colors.white40, marginBottom: 8 },
  editLink: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.gold, marginTop: 10 },
  editTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.white, marginBottom: 10 },
  savedMsg: { fontFamily: fonts.sans, fontSize: 12, color: colors.green },
  cardTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.white },
  cardBody: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50, marginTop: 4 },
  instructions: { marginTop: 12, borderRadius: 10, backgroundColor: colors.white4, borderWidth: 1, borderColor: colors.white8, padding: 12, gap: 4 },
  instructionLine: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  dropzone: {
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(201,168,76,0.4)',
    paddingVertical: 36,
    alignItems: 'center',
    gap: 8,
  },
  dropzoneText: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  successBox: { marginTop: 16, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(22,163,74,0.3)', backgroundColor: 'rgba(22,163,74,0.12)', padding: 12, gap: 4 },
  successText: { color: colors.green, fontFamily: fonts.sans, fontSize: 13 },
  kycGrid: { flexDirection: 'row', gap: 12 },
  kycCell: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 14, alignItems: 'center' },
  kycLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.white40, textTransform: 'uppercase', letterSpacing: 0.5 },
  kycNote: { fontFamily: fonts.sans, fontSize: 11, color: colors.white30, marginTop: 6 },
  kycBlock: { borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 14 },
  kycContextLine: { fontFamily: fonts.sans, fontSize: 11, color: colors.white50, lineHeight: 16 },
  kycHeadline: { fontFamily: fonts.display, fontSize: 15, color: colors.white, marginTop: 8 },
  kycStep: { fontFamily: fonts.sans, fontSize: 12, color: colors.white50 },
  sectionLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.white40, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  uploadLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50, marginBottom: 8 },
  dropzoneSmall: {
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(201,168,76,0.4)',
    paddingVertical: 22,
    alignItems: 'center',
    gap: 6,
  },
  dropzoneTextSmall: { fontFamily: fonts.sans, fontSize: 12, color: colors.white50 },
  eidBox: { marginTop: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 14 },
  eidTitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.white70, marginBottom: 10 },
  eidWarning: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.gold, marginTop: 10 },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 12 },
  docLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white70, flex: 1, marginRight: 8 },
  escrowBox: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', backgroundColor: 'rgba(201,168,76,0.06)', padding: 14 },
  escrowIban: { fontFamily: 'monospace', fontSize: 14, color: colors.white, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  completeAmount: { fontFamily: fonts.display, fontSize: 20, fontWeight: 'bold', color: colors.gold },
  link: { color: colors.gold, fontFamily: fonts.sans, fontSize: 13, marginTop: 12 },
  timelineHeading: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.white40, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
});
