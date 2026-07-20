import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DarkCard } from '../../components/Card';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { ProductBadge, Badge } from '../../components/Badge';
import { ErrorBanner } from '../../components/Alert';
import { STAGE_LABELS } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';

export default function MyDeals() {
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
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold text-white">My Deals</h2>
        <Link to="/seller/new">
          <Button>New Deal</Button>
        </Link>
      </div>

      <ErrorBanner message={error} />

      {deals === null && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {deals?.length === 0 && (
        <EmptyState
          icon="🚗"
          title="No deals yet"
          subtitle="Start a LoanClear or SafePay quote to sell your car through escrow."
          action={
            <Link to="/seller/new">
              <Button>Start a deal</Button>
            </Link>
          }
        />
      )}

      <div className="flex flex-col gap-4">
        {deals?.map((deal) => (
          <Link key={deal.id} to={`/seller/deals/${deal.id}`}>
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
