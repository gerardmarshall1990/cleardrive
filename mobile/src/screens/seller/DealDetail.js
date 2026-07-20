import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { DarkCard, GoldCard } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input, Select } from '../../components/Input';
import { Badge, ProductBadge } from '../../components/Badge';
import { ErrorBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { SkeletonCard } from '../../components/Skeleton';
import { STAGES, STAGE_ORDER, STAGE_LABELS, stageIndex } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { assetToBase64 } from '../../lib/files';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

const POLL_STAGES = new Set([STAGES.KYC, STAGES.SIGNING, STAGES.ESCROW, STAGES.TASJEEL]);

export default function SellerDealDetail({ route }) {
  const { id } = route.params;
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

  return (
    <ScrollView style={{ backgroundColor: colors.navy }} contentContainerStyle={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.ref}>{deal.ref}</Text>
        <ProductBadge product={deal.product} />
      </View>
      <Text style={styles.plate}>{deal.plate}</Text>

      <ProgressSteps currentStage={deal.status} accent={accent} />

      <ErrorBanner message={error} />
      <StageCard deal={deal} accent={accent} onUpdate={setDeal} onError={setError} reload={load} />

      <View style={{ marginTop: 24 }}>
        <Timeline currentStage={deal.status} />
      </View>
    </ScrollView>
  );
}

function StageCard({ deal, accent, onUpdate, onError }) {
  switch (deal.status) {
    case STAGES.QUOTE:
      return <ContinueCard deal={deal} accent={accent} target={STAGES.FINES_VERIFY} onUpdate={onUpdate} onError={onError} title="Quote created" body="Ready to verify traffic fines." />;
    case STAGES.FINES_VERIFY:
      return <FinesVerifyCard deal={deal} onUpdate={onUpdate} onError={onError} />;
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
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Identity verification</Text>
      <View style={styles.kycGrid}>
        <PartyKycStatus label="Seller" complete={deal.seller_kyc_complete} />
        <PartyKycStatus label="Buyer" complete={deal.buyer_kyc_complete} note={!deal.buyer_id ? 'No buyer attached yet' : undefined} />
      </View>
      <Text style={[styles.cardBody, { marginTop: 12 }]}>Both parties must complete identity verification before proceeding.</Text>
      <Button variant={accent} loading={loading} disabled={!bothComplete} onPress={handleContinue} style={{ marginTop: 16 }}>
        {bothComplete ? 'Continue →' : 'Waiting for verification…'}
      </Button>
    </DarkCard>
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

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
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
      <View style={{ gap: 14 }}>
        {!deal.buyer_id && (
          <Input label="Buyer's phone (must already have an account)" keyboardType="phone-pad" value={buyerPhone} onChangeText={setBuyerPhone} />
        )}
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
        {deal.product === 'loanclear' && <Input label="Loan account number" value={form.loan_account} onChangeText={(v) => set('loan_account', v)} />}
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

function SigningCard({ deal }) {
  const docs = [
    { label: 'DOC-001 — Transaction & Escrow Agreement', signed: deal.doc001_signed },
    { label: 'DOC-002 — Limited Power of Attorney', signed: deal.doc002_signed },
  ];
  if (deal.referral_partner_id) docs.push({ label: 'DOC-003 — Referral Agreement', signed: deal.doc003_signed });

  return (
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>Documents & signing</Text>
      <Text style={[styles.cardBody, { marginBottom: 12 }]}>Review and sign each document. We'll notify you when everyone has signed.</Text>
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

function EscrowCard({ deal }) {
  return (
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>Escrow</Text>
      <Text style={[styles.cardBody, { marginBottom: 12 }]}>Waiting for the buyer's funds to reach the secure escrow account.</Text>
      {deal.trustin_escrow_iban && (
        <View style={styles.escrowBox}>
          <Text style={styles.rowLabel}>Escrow IBAN</Text>
          <Text style={styles.escrowIban}>{deal.trustin_escrow_iban}</Text>
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

function CompleteCard({ deal }) {
  return (
    <GoldCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>🎉 Deal complete</Text>
      <Text style={[styles.cardBody, { marginBottom: 12 }]}>Your proceeds have been released to your account.</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Net proceeds released</Text>
        <Text style={styles.completeAmount}>{formatAed(deal.net_proceeds)}</Text>
      </View>
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
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 12 },
  docLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white70, flex: 1, marginRight: 8 },
  escrowBox: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', backgroundColor: 'rgba(201,168,76,0.06)', padding: 14 },
  escrowIban: { fontFamily: 'monospace', fontSize: 14, color: colors.white, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  completeAmount: { fontFamily: fonts.display, fontSize: 20, fontWeight: 'bold', color: colors.gold },
  timelineHeading: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.white40, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
});
