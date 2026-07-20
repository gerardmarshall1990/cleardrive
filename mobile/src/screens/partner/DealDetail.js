import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { DarkCard, GoldCard } from '../../components/Card';
import { Badge, ProductBadge } from '../../components/Badge';
import { ErrorBanner } from '../../components/Alert';
import { ProgressSteps } from '../../components/ProgressSteps';
import { SkeletonCard } from '../../components/Skeleton';
import { STAGES, STAGE_ORDER, STAGE_LABELS, stageIndex } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

const POLL_STAGES = new Set([
  STAGES.QUOTE,
  STAGES.FINES_VERIFY,
  STAGES.KYC,
  STAGES.DETAILS,
  STAGES.SIGNING,
  STAGES.ESCROW,
  STAGES.TASJEEL,
]);

export default function PartnerDealDetail({ route }) {
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

      <GoldCard style={{ marginTop: 12 }}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Your referral fee</Text>
          <Text style={styles.feeValue}>
            {formatAed(deal.referral_fee)} {deal.referral_fee_paid && <Text style={{ color: colors.green, fontSize: 13 }}> · Paid</Text>}
          </Text>
        </View>
      </GoldCard>

      <ErrorBanner message={error} />
      <StageCard deal={deal} />

      <View style={{ marginTop: 24 }}>
        <Timeline currentStage={deal.status} />
      </View>
    </ScrollView>
  );
}

function StageCard({ deal }) {
  switch (deal.status) {
    case STAGES.QUOTE:
      return <WaitingCard title="Quote created" body="The seller is preparing this deal." />;
    case STAGES.FINES_VERIFY:
      return <WaitingCard title="Verifying traffic fines" body="The seller is verifying the car's traffic fines." />;
    case STAGES.KYC:
      return <KycCard deal={deal} />;
    case STAGES.DETAILS:
      return <WaitingCard title="Vehicle & financial details" body="The seller is entering the vehicle and payment details." />;
    case STAGES.SIGNING:
      return <SigningCard deal={deal} />;
    case STAGES.ESCROW:
      return <EscrowCard deal={deal} />;
    case STAGES.TASJEEL:
      return <WaitingCard title="Tasjeel transfer" body="Waiting for the RTA ownership transfer to complete." />;
    case STAGES.COMPLETE:
      return <CompleteCard deal={deal} />;
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

function KycCard({ deal }) {
  return (
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Identity verification</Text>
      <View style={styles.kycGrid}>
        <PartyKycStatus label="Seller" complete={deal.seller_kyc_complete} />
        <PartyKycStatus label="Buyer" complete={deal.buyer_kyc_complete} note={!deal.buyer_id ? 'No buyer attached yet' : undefined} />
      </View>
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

function SigningCard({ deal }) {
  const docs = [
    { label: 'DOC-001 — Transaction & Escrow Agreement', signed: deal.doc001_signed },
    { label: 'DOC-002 — Limited Power of Attorney', signed: deal.doc002_signed },
    { label: 'DOC-003 — Referral Agreement', signed: deal.doc003_signed },
  ];

  return (
    <DarkCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>Documents & signing</Text>
      <Text style={[styles.cardBody, { marginBottom: 12 }]}>Progress of all signatures on this deal.</Text>
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
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Funds received</Text>
        {deal.funds_confirmed ? <Badge variant="verified">Confirmed ✓</Badge> : <Badge variant="pending">Pending</Badge>}
      </View>
    </DarkCard>
  );
}

function CompleteCard({ deal }) {
  return (
    <GoldCard style={{ marginTop: 24 }}>
      <Text style={styles.cardTitle}>🎉 Deal complete</Text>
      <Text style={styles.cardBody}>
        This referral is complete{deal.referral_fee_paid ? ' and your fee has been paid out.' : ' — your referral fee will be paid out shortly.'}
      </Text>
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
  kycGrid: { flexDirection: 'row', gap: 12 },
  kycCell: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 14, alignItems: 'center' },
  kycLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.white40, textTransform: 'uppercase', letterSpacing: 0.5 },
  kycNote: { fontFamily: fonts.sans, fontSize: 11, color: colors.white30, marginTop: 6, textAlign: 'center' },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, borderColor: colors.white8, backgroundColor: colors.white4, padding: 12 },
  docLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white70, flex: 1, marginRight: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50 },
  feeValue: { fontFamily: fonts.display, fontSize: 17, fontWeight: 'bold', color: colors.gold },
  timelineHeading: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.white40, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
});
