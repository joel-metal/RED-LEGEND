import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { registerPasskey, loadPasskey } from '../lib/passkey';

export default function Auth() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stellarAddress, setStellarAddress] = useState('');

  const handlePasskey = async () => {
    if (!stellarAddress.startsWith('G') || stellarAddress.length < 56) {
      setError('Enter a valid Stellar address (starts with G, 56 chars).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cred = await registerPasskey(stellarAddress);
      setAuth(stellarAddress, cred, 'passkey');
      navigate('/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleFreighter = async () => {
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const freighter = (window as any).freighter;
      if (!freighter) throw new Error('Freighter extension not found. Install it from freighter.app');
      const address: string = await freighter.getPublicKey();
      setAuth(address, null, 'freighter');
      navigate('/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResumePasskey = () => {
    const cred = loadPasskey();
    if (!cred) { setError('No saved passkey found.'); return; }
    setAuth(cred.stellarAddress, cred, 'passkey');
    navigate('/dashboard');
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto py-12 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Sign In</h1>
          <p className="text-gray-400">Connect your Stellar identity to manage vaults.</p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Passkey flow */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔑</span>
            <div>
              <div className="font-semibold">Passkey (Recommended)</div>
              <div className="text-gray-400 text-sm">Use your fingerprint or face — no seed phrase.</div>
            </div>
          </div>
          <input
            placeholder="Your Stellar address (G…)"
            value={stellarAddress}
            onChange={(e) => setStellarAddress(e.target.value.trim())}
            className="font-mono text-sm"
          />
          <button
            onClick={handlePasskey}
            disabled={loading}
            className="w-full bg-brand-red hover:bg-brand-darkred text-white py-2.5 rounded-lg font-semibold transition-colors"
          >
            {loading ? 'Registering…' : 'Register Passkey'}
          </button>
          <button
            onClick={handleResumePasskey}
            className="w-full text-sm text-gray-400 hover:text-white transition-colors"
          >
            Already have a passkey? Sign in →
          </button>
        </div>

        <div className="relative text-center text-gray-600 text-sm">
          <span className="bg-brand-charcoal px-3 relative z-10">or</span>
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-brand-border" />
          </div>
        </div>

        {/* Freighter fallback */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🪐</span>
            <div>
              <div className="font-semibold">Freighter Wallet</div>
              <div className="text-gray-400 text-sm">Connect via the Freighter browser extension.</div>
            </div>
          </div>
          <button
            onClick={handleFreighter}
            disabled={loading}
            className="w-full border border-brand-border hover:border-gray-400 text-white py-2.5 rounded-lg font-semibold transition-colors"
          >
            {loading ? 'Connecting…' : 'Connect Freighter'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
