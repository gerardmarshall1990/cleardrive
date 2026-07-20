import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DarkCard, GoldCard } from '../../components/Card';
import { SkeletonCard } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { ProductBadge, Badge } from '../../components/Badge';
import { ErrorBanner } from '../../components/Alert';
import { STAGE_LABELS } from '../../lib/dealStages';
import { formatAed } from '../../lib/feeCalculator';
import { api } from '../../lib/api';

export default function MyReferrals() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/api/partners/mine/deals')
      .then((res) => setData(res))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold text-white">My Referrals</h2>
        <Link to="/partner/new">
          <Button>New Referral</Button>
        </Link>
      </div>

      <ErrorBanner message={error} />

      {data === null && !error && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {data && (
        <GoldCard className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/40 font-sans font-bold">Earned this month</p>
              <p className="font-display text-2xl font-bold text-gold mt-1">{formatAed(data.earnings.thisMonth)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-white/40 font-sans font-bold">All-time earned</p>
              <p className="font-display text-2xl font-bold text-white mt-1">{formatAed(data.earnings.allTime)}</p>
            </div>
          </div>
          {data.partner?.tier === 'loyalty' && (
            <p className="mt-3 text-sm text-green">★ Loyalty tier — you're earning boosted referral fees.</p>
          )}
        </GoldCard>
      )}

      {data?.deals?.length === 0 && (
        <EmptyState
          icon="📋"
          title="No referrals yet"
          subtitle="Refer a seller by their phone number and earn a fee when their deal completes."
          action={
            <Link to="/partner/new">
              <Button>New Referral</Button>
            </Link>
          }
        />
      )}

      <div className="flex flex-col gap-4">
        {data?.deals?.map((deal) => (
          <Link key={deal.id} to={`/partner/deals/${deal.id}`}>
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
                <span className="text-white/40">Referral fee</span>
                <span className="font-semibold text-white">
                  {formatAed(deal.referral_fee)} {deal.referral_fee_paid && <span className="text-green">· Paid</span>}
                </span>
              </div>
            </DarkCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
