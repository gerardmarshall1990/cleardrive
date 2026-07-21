import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Input, Select } from '../components/Input';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/Alert';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';

const ROLE_LABELS = { dealer: 'Dealer', broker: 'Broker' };

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const product = params.get('product');
  const joinDeal = params.get('joinDeal');
  // joinRole is the seller/buyer side embedded in a join link, distinct from
  // the account-type `role` param used for dealer/broker Welcome links.
  const joinRole = params.get('joinRole');

  const [role, setRole] = useState(params.get('role') || 'individual');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emiratesId, setEmiratesId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await signup({ email, password, fullName, phone, role, emiratesId: emiratesId.trim() || undefined });

      // Arrived via a join link — attach to the deal immediately on signup
      // completion and land directly inside it. No separate attach step.
      if (joinDeal && joinRole) {
        const { deal } = await api.post(`/api/deals/${joinDeal}/join`, { role: joinRole });
        navigate(`/deals/${deal.id}`);
        return;
      }

      if (user.role === 'individual') navigate(product ? `/deals/new?product=${product}` : '/deals/new');
      else navigate('/partner');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 py-12">
      <Logo />
      <form onSubmit={handleSubmit} className="mt-10 w-full max-w-sm flex flex-col gap-5">
        <h2 className="text-center text-white font-display text-xl">
          {joinDeal ? 'Join the deal — create your account' : 'Create your account'}
        </h2>
        <ErrorBanner message={error} />

        {role !== 'individual' && (
          <Select label="I am a..." value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value} className="bg-navy">
                {label}
              </option>
            ))}
          </Select>
        )}

        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        <Input label="Phone" type="tel" placeholder="+9715XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          label="Emirates ID number (optional)"
          placeholder="784-XXXX-XXXXXXX-X"
          value={emiratesId}
          onChange={(e) => setEmiratesId(e.target.value)}
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />

        <Button type="submit" loading={loading} className="w-full">
          {joinDeal ? 'Create account & join deal' : 'Create account'}
        </Button>
        <p className="text-center text-sm text-white/50">
          Already have an account?{' '}
          <Link to={joinDeal ? `/login?joinRole=${joinRole}&joinDeal=${joinDeal}` : '/login'} className="text-gold hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
