import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Skeleton } from '../components/Skeleton';
import { BeneficiaryEditor } from '../components/BeneficiaryEditor';
import { useAuth } from '../hooks/useAuth';
import { useVaultDetail } from '../hooks/useVault';
import { useCountdown } from '../hooks/useCountdown';
import { checkIn, partialRelease, withdraw, setBeneficiaries, getVaultEvents } from '../lib/contract';
import type { BeneficiaryEntry } from '../types';
import { useEffect } from 'react';

const URGENCY_RING = {
  safe: 'ring-green-700',
  warning: 'ring-yellow-700',
  critical: 'ring-red-700',
  expired: 'ring-gray-700',
};

export default function VaultDetail() {
  const { id } = useParams<{ id: string }>();
  const { address, isAuthenticated, getSigner } = useAuth();
  const { vault, loading, error, refresh } = useVaultDetail(id);
  const countdown = useCountdown(vault?.status === 'Locked' ? vault.expiresAt : null);

  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [partialAmt, setPartialAmt] = useState('');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [showBenModal, setShowBenModal] = useState(false);
  const [editedBens, setEditedBens] = useState<BeneficiaryEntry[]>([]);
  const [events, setEvents] = useState<Array<{ hash: string; created_at: string }>>([]);

  useEffect(() => {
    if (id) getVaultEvents(BigInt(id)).then(setEvents).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (vault) setEditedBens(vault.beneficiaries);
  }, [vault]);

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  const isOwner = vault?.owner === address;

  const run = async (fn: () => Promise<{ hash: string }>) => {
    setTxLoading(true);
    setTxError(null);
    setTxHash(null);
    try {
      const { hash } = await fn();
      setTxHash(hash);
      await refresh();
    } catch (e) {
      setTxError((e as Error).message);
    } finally {
      setTxLoading(false);
    }
  };

  const handleCheckIn = () =>
    run(() => checkIn(address!, BigInt(id!), getSigner()));

  const handlePartialRelease = () =>
    run(() => partialRelease(address!, BigInt(id!), BigInt(Math.round(parseFloat(partialAmt) * 1e7)), getSigner()));

  const handleWithdraw = () =>
    run(() => withdraw(address!, BigInt(id!), BigInt(Math.round(parseFloat(withdrawAmt) * 1e7)), getSigner()));

  const handleSaveBens = () =>
    run(async () => {
      const r = await setBeneficiaries(address!, BigInt(id!), editedBens, getSigner());
      setShowBenModal(false);
      return r;
    });

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 max-w-2xl mx-auto">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Layout>
    );
  }

  if (error || !vault) {
    return (
      <Layout>
        <div className="text-center py-20 text-red-400">{error ?? 'Vault not found.'}</div>
      </Layout>
    );
  }

  const xlm = (Number(vault.balance) / 1e7).toFixed(4);
  const lastCheckIn = new Date(Number(vault.last_check_in) * 1000).toLocaleString();

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Vault #{id}</h1>
          <span className={`text-xs px-2 py-1 rounded-full border ${URGENCY_RING[vault.urgency]} text-gray-300`}>
            {vault.status}
          </span>
        </div>

        {txError && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {txError}
          </div>
        )}
        {txHash && (
          <div className="bg-green-900/30 border border-green-700 text-green-300 rounded-lg px-4 py-3 text-sm">
            ✓ Transaction:{' '}
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-mono"
            >
              {txHash.slice(0, 16)}…
            </a>
          </div>
        )}

        {/* Balance + countdown */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6 grid sm:grid-cols-2 gap-6">
          <div>
            <div className="text-gray-400 text-sm mb-1">Balance</div>
            <div className="text-3xl font-bold">{xlm} <span className="text-gray-400 text-lg">XLM</span></div>
          </div>
          {vault.status === 'Locked' && (
            <div>
              <div className="text-gray-400 text-sm mb-1">Expires in</div>
              <div className={`text-3xl font-mono font-bold ${
                vault.urgency === 'critical' ? 'text-red-400' :
                vault.urgency === 'warning' ? 'text-yellow-400' : 'text-green-400'
              }`}>
                {countdown}
              </div>
            </div>
          )}
        </div>

        {/* Vault info */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-3 text-sm">
          <Row label="Owner" value={vault.owner} mono />
          <Row label="Last check-in" value={lastCheckIn} />
          <Row label="Check-in interval" value={`${Number(vault.check_in_interval) / 86400} days`} />
          <div>
            <div className="text-gray-400 mb-2">Beneficiaries</div>
            {vault.beneficiaries.map((b) => (
              <div key={b.address} className="flex justify-between font-mono text-xs py-1 border-b border-brand-border last:border-0">
                <span className="truncate text-gray-300">{b.address}</span>
                <span className="text-gray-400 ml-4 shrink-0">{(b.bps / 100).toFixed(2)}%</span>
              </div>
            ))}
            {isOwner && (
              <button
                onClick={() => setShowBenModal(true)}
                className="mt-2 text-xs text-brand-red hover:text-red-400"
              >
                Edit beneficiaries →
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        {isOwner && vault.status === 'Locked' && (
          <div className="grid sm:grid-cols-3 gap-4">
            {/* Check In */}
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4 space-y-3 sm:col-span-1">
              <div className="font-semibold text-sm">Check In</div>
              <p className="text-gray-400 text-xs">Reset your expiry timer.</p>
              <button
                onClick={handleCheckIn}
                disabled={txLoading}
                className="w-full bg-brand-red hover:bg-brand-darkred text-white py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                {txLoading ? 'Signing…' : 'Check In Now'}
              </button>
            </div>

            {/* Partial Release */}
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4 space-y-3">
              <div className="font-semibold text-sm">Partial Release</div>
              <input
                type="number"
                placeholder="Amount (XLM)"
                value={partialAmt}
                onChange={(e) => setPartialAmt(e.target.value)}
                min={0}
                step={0.01}
              />
              <button
                onClick={handlePartialRelease}
                disabled={txLoading || !partialAmt}
                className="w-full border border-brand-border hover:border-gray-400 text-white py-2 rounded-lg text-sm transition-colors"
              >
                Release
              </button>
            </div>

            {/* Withdraw */}
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4 space-y-3">
              <div className="font-semibold text-sm">Withdraw</div>
              <input
                type="number"
                placeholder="Amount (XLM)"
                value={withdrawAmt}
                onChange={(e) => setWithdrawAmt(e.target.value)}
                min={0}
                step={0.01}
              />
              <button
                onClick={handleWithdraw}
                disabled={txLoading || !withdrawAmt}
                className="w-full border border-brand-border hover:border-gray-400 text-white py-2 rounded-lg text-sm transition-colors"
              >
                Withdraw
              </button>
            </div>
          </div>
        )}

        {vault.urgency === 'expired' && vault.status === 'Locked' && (
          <Link
            to={`/vault/${id}/release`}
            className="block text-center bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            Trigger Release →
          </Link>
        )}

        {/* Transaction history */}
        {events.length > 0 && (
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-sm">Recent Transactions</h2>
            <div className="space-y-2">
              {events.slice(0, 5).map((e) => (
                <div key={e.hash} className="flex justify-between text-xs text-gray-400">
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${e.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono hover:text-white underline"
                  >
                    {e.hash.slice(0, 16)}…
                  </a>
                  <span>{new Date(e.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Beneficiaries Modal */}
      {showBenModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-brand-surface border border-brand-border rounded-xl p-6 w-full max-w-lg space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Edit Beneficiaries</h2>
              <button onClick={() => setShowBenModal(false)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>
            <BeneficiaryEditor beneficiaries={editedBens} onChange={setEditedBens} />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowBenModal(false)} className="text-gray-400 hover:text-white text-sm">Cancel</button>
              <button
                onClick={handleSaveBens}
                disabled={txLoading || editedBens.reduce((s, b) => s + b.bps, 0) !== 10000}
                className="bg-brand-red hover:bg-brand-darkred text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                {txLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className={`truncate text-right ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
