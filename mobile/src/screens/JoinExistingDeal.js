import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { DarkCard } from '../components/Card';
import { ErrorBanner } from '../components/Alert';
import { ProductBadge } from '../components/Badge';
import { STAGE_LABELS } from '../lib/dealStages';
import { formatAed } from '../lib/feeCalculator';
import { api } from '../lib/api';
import { colors, fonts } from '../theme/theme';

// "Join Deal" by reference number — mirrors the web version. An alternative
// to the emailed/WhatsApp'd join link, for when that link hasn't arrived
// (or won't, e.g. mock mode) or the other party would rather just type in
// the deal ref themselves.
export default function JoinExistingDeal({ navigation }) {
  const [ref, setRef] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [looking, setLooking] = useState(false);
  const [joining, setJoining] = useState(false);

  async function handleLookup() {
    if (!ref.trim()) return;
    setError('');
    setPreview(null);
    setLooking(true);
    try {
      const res = await api.get(`/api/deals/by-ref/${ref.trim().toUpperCase()}`);
      setPreview(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLooking(false);
    }
  }

  async function handleConfirm() {
    if (!preview?.openRole) return;
    setError('');
    setJoining(true);
    try {
      const { deal } = await api.post(`/api/deals/${preview.deal.id}/join`, { role: preview.openRole });
      setRef('');
      setPreview(null);
      navigation.getParent()?.navigate('MyDeals', { screen: 'DealDetail', params: { id: deal.id } });
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.navy }} contentContainerStyle={styles.wrap}>
      <Text style={styles.heading}>Join a deal</Text>
      <Text style={styles.subheading}>
        Got a deal reference number from the other party? Enter it below to find and join the deal.
      </Text>

      <Input label="Deal reference" placeholder="e.g. CD-2026-035" value={ref} onChangeText={setRef} />
      <Button loading={looking} onPress={handleLookup}>
        Find deal
      </Button>

      <ErrorBanner message={error} />

      {preview && (
        <DarkCard>
          <View style={styles.titleRow}>
            <Text style={styles.ref}>{preview.deal.ref}</Text>
            <ProductBadge product={preview.deal.product} />
          </View>
          <Row label="Plate" value={preview.deal.plate} />
          <Row label="Sale price" value={formatAed(preview.deal.sale_price)} />
          <Row label="Stage" value={STAGE_LABELS[preview.deal.status] || preview.deal.status} />

          <View style={{ marginTop: 12 }}>
            {preview.alreadyJoined && <Text style={styles.muted}>You're already attached to this deal.</Text>}
            {!preview.alreadyJoined && preview.openRole && (
              <Button loading={joining} onPress={handleConfirm}>
                Confirm you're the {preview.openRole} for this deal
              </Button>
            )}
            {!preview.alreadyJoined && !preview.openRole && (
              <Text style={styles.muted}>This deal already has both a seller and a buyer attached.</Text>
            )}
          </View>
        </DarkCard>
      )}
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40, gap: 16 },
  heading: { fontFamily: fonts.display, fontSize: 22, color: colors.white, marginTop: 8 },
  subheading: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  ref: { fontFamily: fonts.display, fontSize: 17, fontWeight: 'bold', color: colors.white },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rowLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  rowValue: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.white },
  muted: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
});
