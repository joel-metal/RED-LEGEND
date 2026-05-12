import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { VaultCard } from '../components/VaultCard';
import { SkeletonList } from '../components/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useVaults } from '../hooks/useVault';
import { checkIn } from '../lib/contract';

export default function Dashboard() {
  const { address, isAuthenticated, getSigner } = useAuth();
  const { vaults, loading, error, refresh } = useVaults(address);
  const [checkingInId, setCheckingInId] = useState<bigint | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  if (!isAuthenticated) return <Navigate to="/auth" replace />;

  const handleCheckIn = async (vaultId: bigint) => {
    if (!address) return;
    setCheckingInId(vaultId);
    setTxError(null);
    try {
      await checkIn(address, vaultId, getSigner());
      await refresh();
    } catch (e) {
      setTxError((e as Error).message);
    } finally {
      setCheckingInId(null);
    }
  };

  return (
    <Layout vaults={vaults}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Vaults</h1>
          <Link
            to="/vault/new"
            className="bg-brand-red hover:bg-brand-darkred text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            + New Vault
          </Link>
        </div>

        {txError && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {txError}
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <SkeletonList count={3} />
        ) : vaults.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="text-5xl">🔒</div>
            <p className="text-gray-400">No vaults yet.</p>
            <Link
              to="/vault/new"
              className="inline-block bg-brand-red hover:bg-brand-darkred text-white px-5 py-2.5 rounded-lg font-semibold transition-colors"
            >
              Create your first vault
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {vaults.map((v) => (
              <VaultCard
                key={v.id.toString()}
                vault={v}
                onCheckIn={handleCheckIn}
                checkingIn={checkingInId === v.id}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
