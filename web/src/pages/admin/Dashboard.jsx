import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DarkCard } from '../../components/Card';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Badge, ProductBadge } from '../../components/Badge';
import { Select, Input } from '../../components/Input';
import { ErrorBanner } from '../../components/Alert';
import { STAGE_LABELS, STAGE_ORDER } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';

function vehicleTitle(deal) {
  const parts = [deal.year, deal.make, deal.model].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function formatDealDate(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminDashboard() {
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

  useEffect(() => {
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

  // Search is client-side (ref/plate/vehicle) since the list endpoint already
  // returns every matching deal with no pagination — no need for a round trip.
  const visibleDeals = deals?.filter((deal) => {
    if (!search.trim()) return true;
    const haystack = [deal.ref, deal.plate, deal.make, deal.model, String(deal.year || '')].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-white mb-6">Admin Dashboard</h2>
      <ErrorBanner message={error} />

      <div className="grid grid-cols-2 gap-4 mb-8 sm:grid-cols-4">
        <StatCard label="Today's Deals" value={stats?.todaysDeals} />
        <StatCard label="Active Deals" value={stats?.activeDeals} />
        <StatCard label="Revenue Today" value={stats ? formatAed(stats.revenueToday) : undefined} />
        <StatCard label="Revenue (Month)" value={stats ? formatAed(stats.revenueMonth) : undefined} />
      </div>

      <div className="flex flex-col gap-3 mb-3 sm:flex-row">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:max-w-xs">
          <option value="" className="bg-navy">All statuses</option>
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s} className="bg-navy">{STAGE_LABELS[s]}</option>
          ))}
        </Select>
        <Select label="Product" value={product} onChange={(e) => setProduct(e.target.value)} className="sm:max-w-xs">
          <option value="" className="bg-navy">All products</option>
          <option value="loanclear" className="bg-navy">LoanClear</option>
          <option value="safepay" className="bg-navy">SafePay</option>
        </Select>
      </div>
      <div className="flex flex-col gap-3 mb-6 sm:flex-row">
        <Input label="From date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="sm:max-w-xs" />
        <Input label="To date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="sm:max-w-xs" />
        <Input
          label="Search"
          type="text"
          placeholder="Ref, plate, make, model..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
      </div>

      {deals === null && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {deals?.length > 0 && visibleDeals?.length === 0 && (
        <EmptyState icon="🔍" title="No deals match your search" subtitle="Try a different search term." />
      )}
      {deals?.length === 0 && <EmptyState icon="📁" title="No deals found" subtitle="Try adjusting the filters above." />}

      <div className="flex flex-col gap-3">
        {visibleDeals?.map((deal) => (
          <Link key={deal.id} to={`/admin/deals/${deal.id}`}>
            <DarkCard className={`hover:-translate-y-0.5 hover:shadow-md-cd transition-all ${deal.stuck ? '!border-error/40' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display text-lg font-bold text-white">{deal.ref}</span>
                    <ProductBadge product={deal.product} />
                    {deal.stuck && <Badge variant="error">Stuck</Badge>}
                  </div>
                  {vehicleTitle(deal) ? (
                    <p className="mt-1 text-sm text-white/70">
                      {vehicleTitle(deal)} <span className="text-white/40">· {deal.plate}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-white/50">{deal.plate}</p>
                  )}
                  {formatDealDate(deal.created_at) && (
                    <p className="mt-0.5 text-xs text-white/40">Created {formatDealDate(deal.created_at)}</p>
                  )}
                </div>
                <Badge variant="pending">{STAGE_LABELS[deal.status] || deal.status}</Badge>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-white/40">Sale price</span>
                <span className="font-semibold text-white">{formatAed(deal.sale_price)}</span>
              </div>
            </DarkCard>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <DarkCard className="!p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-white/40 font-sans font-bold">{label}</p>
      <p className="mt-2 font-display text-xl font-bold text-gold">{value ?? '—'}</p>
    </DarkCard>
  );
}
