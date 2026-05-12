import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Skeleton } from '../components/Skeleton';
import { useVaultDetail } from '../hooks/useVault';
import { useAuth } from '../hooks/useAuth';
import { triggerRelease } from '../lib/contract';

export default function ReleasePage() {
  const { id } = useParams<{ id: string }>();
  const { vault, loading, error, refresh } = useVaultDetail(id);
  const { address, getSigner } = useAuth();

  const [releasing, setReleasing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const handleRelease = async () => {
    if (!address) {
      setTxError('Connect a wallet to pay the transaction fee.');
      return;
    }
    setReleasing(true);
    setTxError(null);
    try {
      const { hash } = await triggerRelease(address, BigInt(id!), getSigner());
      setTxHash(hash);
      await refresh();
    } catch (e) {
      setTxError((e as Error).message);
    } finally {
      setReleasing(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
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
  const isExpired = vault.urgency === 'expired' && vault.status === 'Locked';
  const alreadyReleased = vault.status === 'Released';

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-6 py-8">
        <div className="text-center space-y-2">
          <div className="text-5xl">{alreadyReleased ? '✅' : isExpired ? '⏰' : '🔒'}</div>
          <h1 className="text-2xl font-bold">
            {alreadyReleased ? 'Vault Released' : isExpired ? 'Vault Expired' : 'Vault Active'}
          </h1>
          <p className="text-gray-400 text-sm">Vault #{id}</p>
        </div>

        {/* Vault summary */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Balance</span>
            <span className="font-bold">{xlm} XLM</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Status</span>
            <span>{vault.status}</span>
          </div>
          <div>
            <div className="text-gray-400 mb-2">Beneficiaries</div>
            {vault.beneficiaries.map((b) => (
              <div key={b.address} className="flex justify-between font-mono text-xs py-1 border-b border-brand-border last:border-0">
                <span className="truncate text-gray-300">{b.address}</span>
                <span className="text-gray-400 ml-4 shrink-0">{(b.bps / 100).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>

        {txError && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {txError}
          </div>
        )}

        {txHash ? (
          <div className="bg-green-900/30 border border-green-700 text-green-300 rounded-xl p-5 text-center space-y-2">
            <div className="text-2xl">🎉</div>
            <div className="font-semibold">Release triggered successfully!</div>
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-mono text-xs underline break-all"
            >
              {txHash}
            </a>
          </div>
        ) : alreadyReleased ? (
          <div className="text-center text-gray-400 text-sm">
            Funds have already been released to the beneficiaries.
          </div>
        ) : isExpired ? (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm text-center">
              This vault has expired. Anyone can trigger the release to send funds to the beneficiaries.
            </p>
            <button
              onClick={handleRelease}
              disabled={releasing}
              className="w-full bg-brand-red hover:bg-brand-darkred text-white py-3 rounded-xl font-semibold text-lg transition-colors"
            >
              {releasing ? 'Triggering release…' : 'Trigger Release'}
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-400 text-sm">
            This vault is still active. The owner is checking in regularly.
          </div>
        )}
      </div>
    </Layout>
  );
}
