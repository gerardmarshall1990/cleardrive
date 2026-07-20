import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DarkCard, GoldCard } from '../../components/Card';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { ProductBadge, Badge } from '../../components/Badge';
import { ErrorBanner } from '../../components/Alert';
import { STAGE_LABELS } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

export default function MyReferrals({ navigation }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      api
        .get('/api/partners/mine/deals')
        .then((res) => setData(res))
        .catch((err) => setError(err.message));
    }, [])
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={data?.deals || []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <ErrorBanner message={error} />

            {data === null && !error && (
              <View style={{ gap: 12, marginBottom: 12 }}>
                <SkeletonCard />
                <SkeletonCard />
              </View>
            )}

            {data && (
              <GoldCard style={{ marginBottom: 16 }}>
                <View style={styles.earningsRow}>
                  <View>
                    <Text style={styles.earningsLabel}>Earned this month</Text>
                    <Text style={[styles.earningsValue, { color: colors.gold }]}>{formatAed(data.earnings.thisMonth)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.earningsLabel}>All-time earned</Text>
                    <Text style={styles.earningsValue}>{formatAed(data.earnings.allTime)}</Text>
                  </View>
                </View>
                {data.partner?.tier === 'loyalty' && (
                  <Text style={styles.loyaltyText}>★ Loyalty tier — you're earning boosted referral fees.</Text>
                )}
              </GoldCard>
            )}

            {data?.deals?.length === 0 && (
              <EmptyState
                icon="📋"
                title="No referrals yet"
                subtitle="Refer a seller by their phone number and earn a fee when their deal completes."
                action={<Button onPress={() => navigation.getParent()?.navigate('NewReferral')}>New Referral</Button>}
              />
            )}
          </>
        }
        renderItem={({ item: deal }) => (
          <Pressable onPress={() => navigation.navigate('DealDetail', { id: deal.id })}>
            <DarkCard style={{ marginBottom: 12 }}>
              <View style={styles.row}>
                <View>
                  <View style={styles.rowTop}>
                    <Text style={styles.ref}>{deal.ref}</Text>
                    <ProductBadge product={deal.product} />
                  </View>
                  <Text style={styles.plate}>{deal.plate}</Text>
                </View>
                <Badge variant="pending">{STAGE_LABELS[deal.status] || deal.status}</Badge>
              </View>
              <View style={[styles.row, { marginTop: 12 }]}>
                <Text style={styles.muted}>Referral fee</Text>
                <Text style={styles.value}>
                  {formatAed(deal.referral_fee)} {deal.referral_fee_paid && <Text style={{ color: colors.green }}>· Paid</Text>}
                </Text>
              </View>
            </DarkCard>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy },
  list: { padding: 16, paddingBottom: 32 },
  earningsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  earningsLabel: { fontFamily: fonts.sansBold, fontSize: 10, color: colors.white40, textTransform: 'uppercase', letterSpacing: 0.5 },
  earningsValue: { fontFamily: fonts.display, fontSize: 20, color: colors.white, marginTop: 4 },
  loyaltyText: { fontFamily: fonts.sans, fontSize: 13, color: colors.green, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ref: { fontFamily: fonts.display, fontSize: 17, fontWeight: 'bold', color: colors.white },
  plate: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50, marginTop: 4 },
  muted: { fontFamily: fonts.sans, fontSize: 13, color: colors.white40 },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.white },
});
