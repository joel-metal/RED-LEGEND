import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { BeneficiaryEditor } from '../components/BeneficiaryEditor';
import { useAuth } from '../hooks/useAuth';
import { createVaultWithBeneficiaries } from '../lib/contract';
import type { BeneficiaryEntry } from '../types';

const INTERVAL_PRESETS = [
  { label: '1 day', secs: 86400 },
  { label: '7 days', secs: 604800 },
  { label: '30 days', secs: 2592000 },
  { label: '90 days', secs: 7776000 },
  { label: '1 year', secs: 31536000 },
];

function secsToLabel(s: number) {
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 604800) return `${Math.round(s / 86400)}d`;
  if (s < 2592000) return `${Math.round(s / 604800)}w`;
  if (s < 31536000) return `${Math.round(s / 2592000)}mo`;
  return `${Math.round(s / 31536000)}y`;
}

export default function CreateVault() {
  const { address, isAuthenticated, getSigner } = useAuth();
  const navigate = useNavigate();

  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryEntry[]>([
    { address: '', bps: 10000 },
  ]);
  const [intervalSecs, setIntervalSecs] = useState(604800); // 7 days default
  const [depositXlm, setDepositXlm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  const totalBps = beneficiaries.reduce((s, b) => s + b.bps, 0);
  const valid =
    totalBps === 10000 &&
    beneficiaries.every((b) => b.address.startsWith('G') && b.address.length >= 56);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !valid) return;
    setLoading(true);
    setError(null);
    try {
      const depositAmount = depositXlm ? BigInt(Math.round(parseFloat(depositXlm) * 1e7)) : 0n;
      const result = await createVaultWithBeneficiaries(
        address,
        beneficiaries,
        BigInt(intervalSecs),
        depositAmount,
        getSigner(),
      );
      navigate(`/vault/${result.vaultId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const expiryPreview = new Date(Date.now() + intervalSecs * 1000).toLocaleDateString();

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-8">
        <h1 className="text-2xl font-bold">Create Vault</h1>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Beneficiaries */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold">Beneficiaries</h2>
            <BeneficiaryEditor beneficiaries={beneficiaries} onChange={setBeneficiaries} />
          </div>

          {/* Check-in interval */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Check-in Interval</h2>
              <span className="text-brand-red font-mono font-bold">{secsToLabel(intervalSecs)}</span>
            </div>
            <input
              type="range"
              min={86400}
              max={31536000}
              step={86400}
              value={intervalSecs}
              onChange={(e) => setIntervalSecs(Number(e.target.value))}
              className="w-full accent-brand-red bg-transparent border-none p-0"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>1 day</span>
              <span>1 year</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {INTERVAL_PRESETS.map((p) => (
                <button
                  key={p.secs}
                  type="button"
                  onClick={() => setIntervalSecs(p.secs)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    intervalSecs === p.secs
                      ? 'border-brand-red text-brand-red'
                      : 'border-brand-border text-gray-400 hover:border-gray-400'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Initial deposit */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold">Initial Deposit (optional)</h2>
            <div className="relative">
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={depositXlm}
                onChange={(e) => setDepositXlm(e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">XLM</span>
            </div>
          </div>

          {/* Preview card */}
          <div className="bg-brand-red/10 border border-brand-red/30 rounded-xl p-5 text-sm space-y-1">
            <div className="font-semibold text-brand-red">What happens if you stop checking in?</div>
            <p className="text-gray-300">
              If you don't check in by <strong>{expiryPreview}</strong>, your vault will expire and{' '}
              {beneficiaries.length === 1
                ? `${beneficiaries[0].address.slice(0, 8) || 'your beneficiary'}… will receive all funds.`
                : `funds will be split among ${beneficiaries.length} beneficiaries.`}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !valid}
            className="w-full bg-brand-red hover:bg-brand-darkred disabled:opacity-50 text-white py-3 rounded-xl font-semibold text-lg transition-colors"
          >
            {loading ? 'Creating vault…' : 'Create Vault'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
