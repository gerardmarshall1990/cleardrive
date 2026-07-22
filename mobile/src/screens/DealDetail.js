import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Linking, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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

function KycCard({ deal, myRole, accent, onUpdate, onError }) {
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
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Identity verification</Text>
      <View style={styles.kycGrid}>
        <PartyKycStatus label={myRole === 'seller' ? 'You (seller)' : 'Seller'} complete={deal.seller_kyc_complete} />
        <PartyKycStatus
          label={myRole === 'buyer' ? 'You (buyer)' : 'Buyer'}
          complete={deal.buyer_kyc_complete}
          note={myRole === 'seller' && !deal.buyer_id ? 'No buyer attached yet' : undefined}
        />
      </View>

      {!myComplete && <EidVerifyForm deal={deal} onUpdate={onUpdate} onError={onError} />}

      {myRole === 'seller' ? (
        <>
          <Text style={[styles.cardBody, { marginTop: 12 }]}>Both parties must complete identity verification before proceeding.</Text>
          <Button variant={accent} loading={loading} disabled={!bothComplete} onPress={handleContinue} style={{ marginTop: 16 }}>
            {bothComplete ? 'Continue →' : 'Waiting for verification…'}
          </Button>
        </>
      ) : (
        myComplete && !deal.seller_kyc_complete && (
          <Text style={[styles.cardBody, { marginTop: 12 }]}>You're verified — waiting on the seller.</Text>
        )
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

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handlePick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return onError('Photo library permission is required to upload a photo');

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setBusy(true);
    onError('');
    setExtractMsg(null);
    try {
      const { base64, mediaType } = await assetToBase64(res.assets[0]);
      const { data } = await api.post(`/api/deals/${deal.id}/extract-eid`, { imageBase64: base64, mediaType });
      setForm({ fullName: data.fullName || '', eidNumber: data.eidNumber || '', nationality: data.nationality || '' });
      setExtractMsg({ ok: true, text: 'Extracted from your Emirates ID — check the fields below and edit anything that looks wrong, then confirm.' });
    } catch (err) {
      setExtractMsg({ ok: false, text: `${err.message} — enter your details manually below.` });
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
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
    <View style={styles.eidBox}>
      <Text style={styles.eidTitle}>Your identity verification (Emirates ID)</Text>
      <UploadDropzone text="Tap to upload your Emirates ID photo" busy={busy} onPick={handlePick} />
      {extractMsg && (extractMsg.ok ? <Text style={styles.savedMsg}>{extractMsg.text}</Text> : <ErrorBanner message={extractMsg.text} />)}

      <Text style={styles.eidWarning}>
        Double-check this matches your Emirates ID exactly, letter for letter — this name is used on legally binding deal documents.
      </Text>

      <View style={{ gap: 10, marginTop: 10 }}>
        <Input label="Full name" value={form.fullName} onChangeText={(v) => set('fullName', v)} />
        <Input label="Emirates ID number" value={form.eidNumber} onChangeText={(v) => set('eidNumber', v)} />
        <Button variant="secondary" loading={saving} onPress={handleConfirm}>
          Confirm & verify identity
        </Button>
      </View>
    </View>
  );
}

function PartyKycStatus({ label, complete, note }) {
  return (
    <View style={styles.kycCell}>
      <Text style={styles.kycLabel}>{label}</Text>
      <View style={{ marginTop: 8 }}>{complete ? <Badge variant="verified">Complete ✓</Badge> : <Badge variant="pending">Pending</Badge>}</View>
      {note && <Text style={styles.kycNote}>{note}</Text>}
    </View>
  );
}

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

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
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [settlementMsg, setSettlementMsg] = useState(null);

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
      setMulkiyaMsg({ ok: true, text: 'Extracted from your Mulkiya — check the fields below and edit anything that looks wrong before saving.' });
    } catch (err) {
      setMulkiyaMsg({ ok: false, text: `${err.message} — enter vehicle details manually below.` });
    } finally {
      setMulkiyaBusy(false);
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
      setSettlementMsg({ ok: true, text: 'Extracted from your bank settlement letter — this is the authoritative payoff figure. Review and edit if needed, then save.' });
    } catch (err) {
      setSettlementMsg({ ok: false, text: `${err.message} — enter the settlement amount manually below.` });
    } finally {
      setSettlementBusy(false);
    }
  }

  async function handleSubmit() {
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
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Vehicle & financial details</Text>

      <UploadDropzone
        label="Upload Mulkiya (vehicle registration card) to autofill vehicle details"
        busy={mulkiyaBusy}
        onPick={handleMulkiyaFile}
      />
      {mulkiyaMsg && (mulkiyaMsg.ok ? <Text style={styles.savedMsg}>{mulkiyaMsg.text}</Text> : <ErrorBanner message={mulkiyaMsg.text} />)}

      {deal.product === 'loanclear' && (
        <View style={{ marginTop: 14 }}>
          <UploadDropzone
            label="Upload bank settlement letter to autofill the loan payoff amount"
            busy={settlementBusy}
            onPick={handleSettlementFile}
          />
          {settlementMsg && (settlementMsg.ok ? <Text style={styles.savedMsg}>{settlementMsg.text}</Text> : <ErrorBanner message={settlementMsg.text} />)}
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
        <Text style={styles.sectionLabel}>Your proceeds account</Text>
        <Input label="IBAN" value={form.seller_iban} onChangeText={(v) => set('seller_iban', v)} />
        <Input label="Account holder name" value={form.seller_acc_name} onChangeText={(v) => set('seller_acc_name', v)} />
        <Input label="Bank" value={form.seller_proc_bank} onChangeText={(v) => set('seller_proc_bank', v)} />

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
  kycNote: { fontFamily: fonts.sans, fontSize: 11, color: colors.white30, marginTop: 6, textAlign: 'center' },
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
