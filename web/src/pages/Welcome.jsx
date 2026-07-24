import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button } from '../components/Button';
import { useAuth } from '../lib/AuthContext';

export default function Welcome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  function handleProductClick(product) {
    if (!user) return navigate(`/signup?product=${product}`);
    if (user.role === 'individual') return navigate(`/deals/new?product=${product}`);
    navigate('/');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 py-16">
      <Logo size="lg" />

      <div className="mt-14 grid w-full max-w-3xl gap-6 sm:grid-cols-2">
        <button onClick={() => handleProductClick('loanclear')} className="text-left">
          <div className="h-full rounded-2xl border-t-[3px] border-gold border-x border-b border-white/9 bg-white/4 p-6 transition-all hover:-translate-y-0.5 hover:shadow-gold">
            <h3 className="font-display text-2xl font-bold text-gold">LoanClear</h3>
            <p className="mt-1 text-sm font-semibold text-white/70">Sell your financed car</p>
            <p className="mt-3 text-sm text-white/50">Loan cleared same day. Full private sale price.</p>
            <div className="mt-6">
              <span className="inline-flex items-center justify-center rounded-lg bg-gold px-7 py-3.5 text-[15px] font-bold text-navy shadow-[0_4px_14px_rgba(201,168,76,0.25)]">
                Get Started →
              </span>
            </div>
          </div>
        </button>

        <button onClick={() => handleProductClick('safepay')} className="text-left">
          <div className="h-full rounded-2xl border-t-[3px] border-green border-x border-b border-white/9 bg-white/4 p-6 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(22,163,74,0.2)]">
            <h3 className="font-display text-2xl font-bold text-green">SafePay</h3>
            <p className="mt-1 text-sm font-semibold text-white/70">Any private sale, no loan</p>
            <p className="mt-3 text-sm text-white/50">Secure escrow for private sales with no existing loan, AED 100,000+.</p>
            <div className="mt-6">
              <span className="inline-flex items-center justify-center rounded-lg bg-green px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_14px_rgba(22,163,74,0.25)]">
                Get Started →
              </span>
            </div>
          </div>
        </button>
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        {!user && (
          <>
            <Link to="/login" className="text-sm text-white/60 hover:text-gold font-sans">
              Already have an account? Log in →
            </Link>
            <Link to="/signup?role=dealer" className="text-sm text-white/40 hover:text-gold font-sans">
              I'm a dealer or broker →
            </Link>
          </>
        )}
        {user && user.role === 'individual' && (
          <Button variant="secondary" onClick={() => navigate('/deals')}>
            My deals →
          </Button>
        )}
        {user && (user.role === 'dealer' || user.role === 'broker') && (
          <Button variant="secondary" onClick={() => navigate('/partner')}>
            Go to my referrals →
          </Button>
        )}
        {user && user.role === 'admin' && (
          <Button variant="secondary" onClick={() => navigate('/admin')}>
            Go to admin dashboard →
          </Button>
        )}
      </div>
    </div>
  );
}
