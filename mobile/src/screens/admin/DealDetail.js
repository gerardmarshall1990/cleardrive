import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { DarkCard } from '../../components/Card';
import { Button } from '../../components/Button';
import { Badge, ProductBadge } from '../../components/Badge';
import { ErrorBanner, SuccessBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { SkeletonCard } from '../../components/Skeleton';
import { STAGE_ORDER, STAGE_LABELS, stageIndex } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

const OVERRIDE_FIELDS = [
  { key: 'seller_kyc_complete', label: 'Seller KYC complete' },
  { key: 'buyer_kyc_complete', label: 'Buyer KYC complete' },
  { key: 'doc001_signed', label: 'DOC-001 signed (Transaction & Escrow Agreement)' },
  { key: 'doc002_signed', label: 'DOC-002 signed (Limited Power of Attorney)' },
  { key: 'doc003_signed', label: 'DOC-003 signed (Referral Agreement)', requiresPartner: true },
];

export default function AdminDealDetail({ route }) {
  const { id } = route.params;
  const [deal, setDeal] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

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

  async function toggleField(field) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { deal: updated } = await api.put(`/api/admin/deals/${id}/override`, { [field]: !deal[field] });
      setDeal(updated);
      setSuccess('Updated');
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
      <Text style={styles.plate}>{deal.plate}</Text>

      <ProgressSteps currentStage={deal.status} accent={accent} />

      <DarkCard style={{ marginTop: 16 }}>
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

      <DarkCard style={{ marginTop: 12 }}>
        <Text style={styles.cardTitle}>Manual overrides</Text>
        <Text style={[styles.cardBody, { marginBottom: 12 }]}>Use only for edge cases — e.g. a signature or ID check collected outside the platform.</Text>
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />
        <View style={{ gap: 10 }}>
          {OVERRIDE_FIELDS.filter((f) => !f.requiresPartner || deal.referral_partner_id).map((f) => (
            <View key={f.key} style={styles.overrideRow}>
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
          ))}
        </View>
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
  overrideRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 12, gap: 8 },
  overrideLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.white70, flex: 1 },
  overrideBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  timelineHeading: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.white40, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
});
