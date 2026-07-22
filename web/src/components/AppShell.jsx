import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { useAuth } from '../lib/AuthContext';

const TABS_BY_ROLE = {
  individual: [
    { to: '/deals', label: 'My Deals', icon: '🚗' },
    { to: '/deals/new', label: 'New Deal', icon: '➕' },
    { to: '/deals/join', label: 'Join Deal', icon: '🔗' },
  ],
  dealer: [
    { to: '/partner', label: 'My Referrals', icon: '📋' },
    { to: '/partner/new', label: 'New Referral', icon: '➕' },
  ],
  broker: [
    { to: '/partner', label: 'My Referrals', icon: '📋' },
    { to: '/partner/new', label: 'New Referral', icon: '➕' },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: '📊' },
    { to: '/admin/deals', label: 'Deals', icon: '📁' },
  ],
};

/** Shared shell: navy header with logo + user menu, bottom tab bar on mobile (max 4 tabs per guidelines). */
export function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = TABS_BY_ROLE[user?.role] || [];

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="min-h-screen flex flex-col bg-navy">
      <header className="border-b border-white/8 bg-navy">
        <div className="mx-auto flex max-w-[1140px] items-center justify-between px-6 py-4 md:px-12">
          <Link to={tabs[0]?.to || '/'}>
            <Logo size="sm" showTagline={false} />
          </Link>

          {user && tabs[0] && (
            <nav className="hidden md:flex items-center gap-6">
              <Link
                to={tabs[0].to}
                className={`text-sm font-sans font-semibold ${
                  location.pathname === tabs[0].to ? 'text-gold' : 'text-white/60 hover:text-gold'
                }`}
              >
                {tabs[0].label}
              </Link>
            </nav>
          )}

          {user && (
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline text-sm text-white/60 font-sans">{user.full_name}</span>
              <button onClick={handleLogout} className="text-sm text-white/50 hover:text-gold font-sans">
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1140px] flex-1 px-6 py-8 md:px-12 pb-24 md:pb-8">{children}</main>

      {user && tabs.length > 0 && (
        <nav className="fixed bottom-0 left-0 right-0 z-10 flex h-16 border-t border-white/8 bg-navy pb-2 md:hidden">
          {tabs.map((tab) => {
            const active = location.pathname === tab.to;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-sans ${
                  active ? 'text-gold' : 'text-white/35'
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
