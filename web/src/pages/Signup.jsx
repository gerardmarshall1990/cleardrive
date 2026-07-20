import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Input, Select } from '../components/Input';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/Alert';
import { useAuth } from '../lib/AuthContext';

const ROLE_LABELS = { seller: 'Seller', buyer: 'Buyer', dealer: 'Dealer', broker: 'Broker' };

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const product = params.get('product');

  const [role, setRole] = useState(params.get('role') || 'seller');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await signup({ email, password, fullName, phone, role });
      if (user.role === 'seller') navigate(product ? `/seller/new?product=${product}` : '/seller/new');
      else if (user.role === 'buyer') navigate('/buyer');
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
        <h2 className="text-center text-white font-display text-xl">Create your account</h2>
        <ErrorBanner message={error} />

        <Select label="I am a..." value={role} onChange={(e) => setRole(e.target.value)}>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value} className="bg-navy">
              {label}
            </option>
          ))}
        </Select>

        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        <Input label="Phone" type="tel" placeholder="+9715XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />

        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
        <p className="text-center text-sm text-white/50">
          Already have an account?{' '}
          <Link to="/login" className="text-gold hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
