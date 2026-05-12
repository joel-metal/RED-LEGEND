import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CountdownBanner } from './CountdownBanner';
import type { VaultDisplay } from '../types';

interface Props {
  children: React.ReactNode;
  vaults?: VaultDisplay[];
}

export function Layout({ children, vaults = [] }: Props) {
  const { address, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <CountdownBanner vaults={vaults} />
      <header className="border-b border-brand-border bg-brand-surface sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="text-brand-red font-bold text-xl tracking-widest">
            RED-LEGEND
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className="text-gray-300 hover:text-white transition-colors">
                  Dashboard
                </Link>
                <Link to="/vault/new" className="bg-brand-red hover:bg-brand-darkred text-white px-3 py-1.5 rounded-lg transition-colors">
                  + New Vault
                </Link>
                <span className="text-gray-500 font-mono text-xs hidden sm:block">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
                <button onClick={handleLogout} className="text-gray-500 hover:text-white transition-colors">
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/auth" className="bg-brand-red hover:bg-brand-darkred text-white px-3 py-1.5 rounded-lg transition-colors">
                Get Started
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">{children}</main>
      <footer className="border-t border-brand-border text-center text-gray-600 text-xs py-4">
        RED-LEGEND · Stellar Testnet · MIT License
      </footer>
    </div>
  );
}
