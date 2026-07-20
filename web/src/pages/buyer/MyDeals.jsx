import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DarkCard } from '../../components/Card';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ProductBadge, Badge } from '../../components/Badge';
import { ErrorBanner } from '../../components/Alert';
import { STAGE_LABELS } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';

export default function BuyerMyDeals() {
  const [deals, setDeals] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/api/deals/mine')
      .then((res) => setDeals(res.deals))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-white mb-6">Deals to track</h2>

      <ErrorBanner message={error} />

      {deals === null && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {deals?.length === 0 && (
        <EmptyState
          icon="📋"
          title="No deals yet"
          subtitle="When a seller attaches you to a ClearDrive deal by your phone number, it'll show up here."
        />
      )}

      <div className="flex flex-col gap-4">
        {deals?.map((deal) => (
          <Link key={deal.id} to={`/buyer/deals/${deal.id}`}>
            <DarkCard className="hover:-translate-y-0.5 hover:shadow-md-cd transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-bold text-white">{deal.ref}</span>
                    <ProductBadge product={deal.product} />
                  </div>
                  <p className="mt-1 text-sm text-white/50">{deal.plate}</p>
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
