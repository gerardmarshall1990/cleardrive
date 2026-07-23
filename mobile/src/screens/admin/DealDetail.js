import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking } from 'react-native';
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
import { colors, fonts } from '../../theme/theme';

function vehicleTitle(deal) {
  const parts = [deal.year, deal.make, deal.model].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

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

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

// Vehicle/financial fields admin can manually correct — mirrors backend's
// ADMIN_DETAIL_FIELDS in adminController.js. Safety net for when Claude
// Vision misreads the Mulkiya or bank settlement letter photo — admin checks
// the source photo (mulkiya_image_url/settlement_image_url) and types the
// correct value here instead of what was auto-extracted.
const DETAIL_FIELDS = [
  { key: 'plate', label: 'Plate number' },
  { key: 'vin', label: 'VIN' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
  { key: 'year', label: 'Year', numeric: true },
  { key: 'colour', label: 'Colour' },
  { key: 'mileage', label: 'Mileage (km)', numeric: true },
  { key: 'sale_price', label: 'Sale price (AED)', numeric: true },
  { key: 'loan_amount', label: 'Loan/settlement amount (AED)', numeric: true, loanOnly: true },
  { key: 'loan_account', label: 'Loan reference number', loanOnly: true },
  { key: 'loan_bank', label: 'Loan bank', loanOnly: true },
  { key: 'seller_iban', label: 'Seller payout IBAN' },
  { key: 'seller_acc_name', label: 'Seller payout account name' },
  { key: 'seller_proc_bank', label: 'Seller payout bank' },
];

export default function AdminDealDetail({ route }) {
  const { id } = route.params;
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

  async function submitDetailsForm() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated } = await api.put(`/api/admin/deals/${id}/override`, detailsForm);
      setDeal(updated);
      setDetailsForm(null);
      setSuccess('Vehicle & financial details updated');
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

  async function submitTransferCert() {
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
        {deal.stuck && <Badge variant="error">Stuck</Badge>}
      </View>
      {vehicleTitle(deal) ? (
        <Text style={styles.plate}>{vehicleTitle(deal)} · {deal.plate}</Text>
      ) : (
        <Text style={styles.plate}>{deal.plate}</Text>
      )}

      <ProgressSteps currentStage={deal.status} accent={accent} />

      {deal.blockedOn?.length > 0 && (
        <DarkCard style={[styles.blockedCard, { marginTop: 16 }]}>
          <Text style={styles.blockedTitle}>Why this deal is stuck at "{STAGE_LABELS[deal.status] || deal.status}"</Text>
          <View style={{ gap: 6 }}>
            {deal.blockedOn.map((b) => (
              <View key={b.field} style={styles.blockedRow}>
                <Text style={styles.blockedDot}>●</Text>
                <Text style={styles.blockedLabel}>{b.label}</Text>
              </View>
            ))}
          </View>
        </DarkCard>
      )}

      <DarkCard style={{ marginTop: 16 }}>
        <Text style={styles.cardTitle}>Vehicle</Text>
        <Row label="Plate" value={deal.plate || '—'} />
        <Row label="VIN" value={deal.vin || '—'} mono />
        <Row label="Make / Model" value={[deal.make, deal.model].filter(Boolean).join(' ') || '—'} />
        <Row label="Year" value={deal.year || '—'} />
        <Row label="Colour" value={deal.colour || '—'} />
        <Row label="Mileage" value={deal.mileage ? `${Number(deal.mileage).toLocaleString('en-AE')} km` : '—'} />
        <Row label="Emirate" value={deal.emirate || '—'} />
      </DarkCard>

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Deal summary</Text>
        <Row label="Sale price" value={formatAed(deal.sale_price)} />
        {deal.product === 'loanclear' && <Row label="Loan amount" value={formatAed(deal.loan_amount)} />}
        <Row label="Fines" value={deal.fines_verified ? formatAed(deal.fines_amount) : 'Not verified'} />
        <Row label="ClearDrive fee" value={formatAed(deal.cd_fee)} />
        <Row label="Net proceeds" value={formatAed(deal.net_proceeds)} />
      </DarkCard>

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Parties & escrow</Text>
        <Row label="Seller ID" value={deal.seller_id?.slice(0, 8) || '—'} mono />
        <Row label="Buyer ID" value={deal.buyer_id ? deal.buyer_id.slice(0, 8) : 'Not attached'} mono />
        <Row label="Escrow IBAN" value={deal.trustin_escrow_iban || '—'} mono />
        <Row label="Funds confirmed" value={deal.funds_confirmed ? 'Yes' : 'No'} />
      </DarkCard>

      {(deal.mulkiya_image_url || deal.mulkiya_back_image_url || deal.settlement_image_url || deal.bank_proof_image_url) && (
        <DarkCard style={{ marginTop: 12 }}>
          <Text style={styles.cardTitle}>Uploaded attachments</Text>
          <Text style={[styles.cardBody, { marginBottom: 12 }]}>Check the original photo if the fields below look wrong — Claude Vision extraction isn't perfect.</Text>
          <View style={{ gap: 8 }}>
            {deal.mulkiya_image_url && (
              <Text style={styles.linkText} onPress={() => Linking.openURL(deal.mulkiya_image_url)}>
                View uploaded Mulkiya — front (vehicle registration card)
              </Text>
            )}
            {deal.mulkiya_back_image_url && (
              <Text style={styles.linkText} onPress={() => Linking.openURL(deal.mulkiya_back_image_url)}>
                View uploaded Mulkiya — back
              </Text>
            )}
            {deal.settlement_image_url && (
              <Text style={styles.linkText} onPress={() => Linking.openURL(deal.settlement_image_url)}>
                View uploaded bank settlement letter
              </Text>
            )}
            {deal.bank_proof_image_url && (
              <Text style={styles.linkText} onPress={() => Linking.openURL(deal.bank_proof_image_url)}>
                View uploaded proof of proceeds account (IBAN/name match)
              </Text>
            )}
          </View>
        </DarkCard>
      )}

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Vehicle & financial details — manual correction</Text>
        <Text style={[styles.cardBody, { marginBottom: 12 }]}>
          Use this if Claude Vision misread the Mulkiya or settlement letter — check the attachment above, then correct the field(s) here. Saving
          re-checks whether the deal can now advance.
        </Text>
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />
        {detailsForm && (
          <View style={{ gap: 12 }}>
            {DETAIL_FIELDS.filter((f) => !f.loanOnly || deal.product === 'loanclear').map((f) => (
              <Input
                key={f.key}
                label={f.label}
                keyboardType={f.numeric ? 'numeric' : 'default'}
                value={String(detailsForm[f.key])}
                onChangeText={(v) => setDetailField(f.key, v)}
              />
            ))}
            <Select label="Emirate" selectedValue={detailsForm.emirate} onValueChange={(v) => setDetailField('emirate', v)}>
              {EMIRATES.map((em) => (
                <Select.Item key={em} label={em} value={em} />
              ))}
            </Select>
            <Button variant={accent} loading={saving} onPress={submitDetailsForm}>
              Save corrections
            </Button>
          </View>
        )}
      </DarkCard>

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Manual overrides</Text>
        <Text style={[styles.cardBody, { marginBottom: 12 }]}>Use only for edge cases — e.g. a signature or ID check collected outside the platform.</Text>
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />
        <View style={{ gap: 10 }}>
          {OVERRIDE_FIELDS.filter((f) => !f.requiresPartner || deal.referral_partner_id).map((f) => (
            <View key={f.key} style={styles.overrideItem}>
              <View style={styles.overrideRow}>
                <Text style={styles.overrideLabel}>{f.label}</Text>
                <Button
                  variant={deal[f.key] ? 'secondary' : accent}
                  loading={saving}
                  onPress={() => toggleField(f.key)}
                  style={styles.overrideBtn}
                >
                  {deal[f.key] ? 'Undo' : 'Mark complete'}
                </Button>
              </View>
              {f.key === 'fines_verified' && !deal.fines_verified && (
                <Input
                  label="Fines amount (AED) — optional, e.g. read off the RTA screenshot yourself"
                  keyboardType="numeric"
                  value={finesAmount}
                  onChangeText={setFinesAmount}
                  style={{ marginTop: 12 }}
                />
              )}
            </View>
          ))}
        </View>

        {deal.status === 'tasjeel' && !deal.transfer_cert_url && (
          <View style={styles.transferForm}>
            <Text style={styles.overrideLabel}>Tasjeel transfer certificate URL/reference</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Input
                value={transferCertUrl}
                onChangeText={setTransferCertUrl}
                placeholder="https://... or manual reference"
                style={{ flex: 1 }}
              />
              <Button variant={accent} loading={saving} onPress={submitTransferCert} style={styles.overrideBtn}>
                Save
              </Button>
            </View>
          </View>
        )}
        {deal.transfer_cert_url && (
          <Text style={styles.transferCaption}>
            Transfer certificate on file: <Text style={{ fontFamily: 'monospace' }}>{deal.transfer_cert_url}</Text>
          </Text>
        )}
      </DarkCard>

      <View style={{ marginTop: 24 }}>
        <Timeline currentStage={deal.status} />
      </View>
    </ScrollView>
  );
}

function Row({ label, value, mono }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && { fontFamily: 'monospace' }]}>{value}</Text>
    </View>
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
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  ref: { fontFamily: fonts.display, fontSize: 20, fontWeight: 'bold', color: colors.white },
  plate: { fontFamily: fonts.sans, fontSize: 13, color: colors.white40, marginBottom: 8 },
  cardTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.white, marginBottom: 8 },
  cardBody: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  rowValue: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.white },
  overrideItem: { borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 12 },
  overrideRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  overrideLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.white70, flex: 1 },
  overrideBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  timelineHeading: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.white40, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  blockedCard: { borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' },
  blockedTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.white, marginBottom: 8 },
  blockedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  blockedDot: { color: colors.error, marginTop: 2, fontSize: 12 },
  blockedLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white70, flex: 1 },
  transferForm: { marginTop: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 12 },
  transferCaption: { fontFamily: fonts.sans, fontSize: 11, color: colors.white40, marginTop: 12 },
  linkText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.gold, textDecorationLine: 'underline' },
});
