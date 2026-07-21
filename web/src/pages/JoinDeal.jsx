import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/Alert';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';

// The join-link landing page (/join/:dealId/:role). This is the "clicking IS
// the join" entry point — no manual "enter deal code" step, no separate
// attach action:
//  - Already logged in as the right role -> immediately attached, redirected
//    into the deal.
//  - Logged in as the wrong role -> clear error + option to log out and use
//    the correct account.
//  - Not logged in -> choice of quick signup or login, both of which carry
//    the dealId/role through and auto-join immediately on completion.
export default function JoinDeal() {
  const { dealId, role } = useParams();
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (user.role !== 'individual') {
      setError(`This invite requires an individual account — you're currently logged in as a ${user.role} account.`);
      return;
    }
    setJoining(true);
    api
      .post(`/api/deals/${dealId}/join`, { role })
      .then(({ deal }) => navigate(`/deals/${deal.id}`, { replace: true }))
      .catch((err) => {
        setError(err.message);
        setJoining(false);
      });
  }, [user, loading, dealId, role, navigate]);

  if (loading || joining) {
    return <div className="min-h-screen bg-navy" />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 py-12 text-center">
      <Logo />
      <h2 className="mt-8 font-display text-xl font-bold text-white">You're invited to a ClearDrive deal</h2>
      <p className="mt-2 max-w-sm text-sm text-white/50">
        Join as the <span className="font-semibold capitalize text-white/70">{role}</span> to see this deal.
      </p>
      <ErrorBanner message={error} />

      {!user && (
        <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
          <Button onClick={() => navigate(`/signup?joinRole=${role}&joinDeal=${dealId}`)} className="w-full">
            Create account & join
          </Button>
          <Button variant="secondary" onClick={() => navigate(`/login?joinRole=${role}&joinDeal=${dealId}`)} className="w-full">
            I already have an account — log in
          </Button>
        </div>
      )}

      {user && error && (
        <Button
          variant="secondary"
          className="mt-6 w-full max-w-xs"
          onClick={async () => {
            await logout();
            navigate(`/login?joinRole=${role}&joinDeal=${dealId}`);
          }}
        >
          Log out and use a different account
        </Button>
      )}
    </div>
  );
}
