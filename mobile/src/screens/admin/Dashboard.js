import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DarkCard } from '../../components/Card';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Badge, ProductBadge } from '../../components/Badge';
import { Select, Input } from '../../components/Input';
import { ErrorBanner } from '../../components/Alert';
import { STAGE_LABELS, STAGE_ORDER } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';
import { colors, fonts } from '../../theme/theme';

function vehicleTitle(deal) {
  const parts = [deal.year, deal.make, deal.model].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function formatDealDate(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminDashboard({ navigation }) {
  const [stats, setStats] = useState(null);
  const [deals, setDeals] = useState(null);
  const [status, setStatus] = useState('');
  const [product, setProduct] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/admin/stats').then((res) => setStats(res.stats)).catch((err) => setError(err.message));
  }, []);

  const loadDeals = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (product) params.set('product', product);
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    const qs = params.toString();
    setDeals(null);
    api
      .get(`/api/admin/deals${qs ? `?${qs}` : ''}`)
      .then((res) => setDeals(res.deals))
      .catch((err) => setError(err.message));
  }, [status, product, fromDate, toDate]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  useFocusEffect(
    useCallback(() => {
      loadDeals();
    }, [loadDeals])
  );

  // Search is client-side (ref/plate/vehicle) since the list endpoint already
  // returns every matching deal with no pagination — no need for a round trip.
  const visibleDeals = deals?.filter((deal) => {
    if (!search.trim()) return true;
    const haystack = [deal.ref, deal.plate, deal.make, deal.model, String(deal.year || '')].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return (
    <View style={styles.screen}>
      <FlatList
        data={visibleDeals || []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Text style={styles.heading}>Admin Dashboard</Text>
            <ErrorBanner message={error} />

            <View style={styles.statsGrid}>
              <StatCard label="Today's Deals" value={stats?.todaysDeals} />
              <StatCard label="Active Deals" value={stats?.activeDeals} />
              <StatCard label="Revenue Today" value={stats ? formatAed(stats.revenueToday) : undefined} />
              <StatCard label="Revenue (Month)" value={stats ? formatAed(stats.revenueMonth) : undefined} />
            </View>

            <View style={{ gap: 12, marginBottom: 16 }}>
              <Select label="Status" selectedValue={status} onValueChange={setStatus}>
                <Select.Item label="All statuses" value="" />
                {STAGE_ORDER.map((s) => (
                  <Select.Item key={s} label={STAGE_LABELS[s]} value={s} />
                ))}
              </Select>
              <Select label="Product" selectedValue={product} onValueChange={setProduct}>
                <Select.Item label="All products" value="" />
                <Select.Item label="LoanClear" value="loanclear" />
                <Select.Item label="SafePay" value="safepay" />
              </Select>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Input label="From date" placeholder="YYYY-MM-DD" value={fromDate} onChangeText={setFromDate} autoCapitalize="none" />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="To date" placeholder="YYYY-MM-DD" value={toDate} onChangeText={setToDate} autoCapitalize="none" />
                </View>
              </View>
              <Input label="Search" placeholder="Ref, plate, make, model..." value={search} onChangeText={setSearch} autoCapitalize="none" />
            </View>

            {deals === null && (
              <View style={{ gap: 12, marginBottom: 12 }}>
                <SkeletonCard />
                <SkeletonCard />
              </View>
            )}
            {deals?.length > 0 && visibleDeals?.length === 0 && (
              <EmptyState icon="🔍" title="No deals match your search" subtitle="Try a different search term." />
            )}
            {deals?.length === 0 && <EmptyState icon="📁" title="No deals found" subtitle="Try adjusting the filters above." />}
          </>
        }
        renderItem={({ item: deal }) => (
          <Pressable onPress={() => navigation.navigate('DealDetail', { id: deal.id })}>
            <DarkCard style={[{ marginBottom: 12 }, deal.stuck && styles.stuckCard]}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.ref}>{deal.ref}</Text>
                    <ProductBadge product={deal.product} />
                    {deal.stuck && <Badge variant="error">Stuck</Badge>}
                  </View>
                  <Text style={styles.plate}>{vehicleTitle(deal) ? `${vehicleTitle(deal)} · ${deal.plate}` : deal.plate}</Text>
                  {formatDealDate(deal.created_at) && <Text style={styles.createdAt}>Created {formatDealDate(deal.created_at)}</Text>}
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

function StatCard({ label, value }) {
  return (
    <DarkCard style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value ?? '—'}</Text>
    </DarkCard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy },
  list: { padding: 16, paddingBottom: 32 },
  heading: { fontFamily: fonts.display, fontSize: 22, color: colors.white, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  statCard: { width: '47%', alignItems: 'center', padding: 12 },
  statLabel: { fontFamily: fonts.sansBold, fontSize: 10, color: colors.white40, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  statValue: { fontFamily: fonts.display, fontSize: 18, color: colors.gold, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  ref: { fontFamily: fonts.display, fontSize: 17, fontWeight: 'bold', color: colors.white },
  plate: { fontFamily: fonts.sans, fontSize: 13, color: colors.white50, marginTop: 4 },
  createdAt: { fontFamily: fonts.sans, fontSize: 11, color: colors.white40, marginTop: 2 },
  muted: { fontFamily: fonts.sans, fontSize: 13, color: colors.white40 },
  value: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.white },
  stuckCard: { borderColor: 'rgba(239,68,68,0.4)' },
});
