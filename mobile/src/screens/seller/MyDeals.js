import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DarkCard } from '../../components/Card';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { ProductBadge, Badge } from '../../components/Badge';
import { ErrorBanner } from '../../components/Alert';
import { STAGE_LABELS } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

export default function MyDeals({ navigation }) {
  const [deals, setDeals] = useState(null);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      api
        .get('/api/deals/mine')
        .then((res) => setDeals(res.deals))
        .catch((err) => setError(err.message));
    }, [])
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={deals || []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <ErrorBanner message={error} />
            {deals === null && (
              <View style={{ gap: 12, marginBottom: 12 }}>
                <SkeletonCard />
                <SkeletonCard />
              </View>
            )}
            {deals?.length === 0 && (
              <EmptyState
                icon="🚗"
                title="No deals yet"
                subtitle="Start a LoanClear or SafePay quote to sell your car through escrow."
                action={<Button onPress={() => navigation.getParent()?.navigate('NewDeal')}>Start a deal</Button>}
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
                <Text style={styles.muted}>Sale price</Text>
                <Text style={styles.value}>{formatAed(deal.sale_price)}</Text>
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
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ref: { fontFamily: fonts.display, fontSize: 17, fontWeight: 'bold', color: colors.white },
  plate: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50, marginTop: 4 },
  muted: { fontFamily: fonts.sans, fontSize: 13, color: colors.white40 },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.white },
});
