import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { DarkCard } from '../components/Card';
import { ErrorBanner } from '../components/Alert';
import { ProductBadge } from '../components/Badge';
import { STAGE_LABELS } from '../lib/dealStages';
import { formatAed } from '../lib/feeCalculator';
import { api } from '../lib/api';

function vehicleTitle(deal) {
  const parts = [deal.year, deal.make, deal.model].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

// "Join Deal" by reference number — an alternative to the emailed/WhatsApp'd
// join link, for when that link hasn't arrived (or won't, e.g. mock mode) or
// the other party would rather just type in the deal ref themselves.
export default function JoinExistingDeal() {
  const navigate = useNavigate();
  const [ref, setRef] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [looking, setLooking] = useState(false);
  const [joining, setJoining] = useState(false);

  async function handleLookup(e) {
    e.preventDefault();
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
      navigate(`/deals/${deal.id}`);
    } catch (err) {
      setError(err.message);
      setJoining(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="font-display text-2xl font-bold text-white">Join a deal</h2>
      <p className="mt-1 text-sm text-white/50">
        Got a deal reference number from the other party? Enter it below to find and join the deal.
      </p>

      <form onSubmit={handleLookup} className="mt-6 flex gap-2">
        <Input
          label="Deal reference"
          placeholder="e.g. CD-2026-035"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" loading={looking} className="!self-end">
          Find deal
        </Button>
      </form>

      <ErrorBanner message={error} />

      {preview && (
        <DarkCard className="mt-6">
          <div className="flex items-center gap-3 mb-1">
            <h4 className="font-display text-lg font-semibold text-white">{preview.deal.ref}</h4>
            <ProductBadge product={preview.deal.product} />
          </div>
          {vehicleTitle(preview.deal) && (
            <p className="mb-3 text-sm text-white/70">{vehicleTitle(preview.deal)}</p>
          )}
          <Row label="Plate" value={preview.deal.plate} />
          <Row label="Sale price" value={formatAed(preview.deal.sale_price)} />
          <Row label="Stage" value={STAGE_LABELS[preview.deal.status] || preview.deal.status} />

          <div className="mt-4">
            {preview.alreadyJoined && (
              <p className="text-sm text-white/50">You're already attached to this deal.</p>
            )}
            {!preview.alreadyJoined && preview.openRole && (
              <Button onClick={handleConfirm} loading={joining} className="w-full">
                Confirm you're the {preview.openRole} for this deal
              </Button>
            )}
            {!preview.alreadyJoined && !preview.openRole && (
              <p className="text-sm text-white/50">This deal already has both a seller and a buyer attached.</p>
            )}
          </div>
        </DarkCard>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-white/50">{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  );
}
