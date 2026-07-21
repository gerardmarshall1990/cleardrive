import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/Alert';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const joinDeal = params.get('joinDeal');
  const joinRole = params.get('joinRole');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);

      // Arrived via a join link — attach to the deal immediately and land
      // directly inside it, instead of the generic role-based landing page.
      if (joinDeal && joinRole) {
        if (user.role !== 'individual') {
          setError(`This invite requires an individual account — you're logged in as a ${user.role} account`);
          return;
        }
        const { deal } = await api.post(`/api/deals/${joinDeal}/join`, { role: joinRole });
        navigate(`/deals/${deal.id}`);
        return;
      }

      const dest = { individual: '/deals', dealer: '/partner', broker: '/partner', admin: '/admin' }[user.role] || '/';
      navigate(dest);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6">
      <Logo />
      <form onSubmit={handleSubmit} className="mt-10 w-full max-w-sm flex flex-col gap-5">
        <h2 className="text-center text-white font-display text-xl">Log in</h2>
        <ErrorBanner message={error} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" loading={loading} className="w-full">
          Log in
        </Button>
        <p className="text-center text-sm text-white/50">
          No account?{' '}
          <Link to={joinDeal ? `/signup?joinRole=${joinRole}&joinDeal=${joinDeal}` : '/signup'} className="text-gold hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
