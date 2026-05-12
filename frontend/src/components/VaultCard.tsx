import { Link } from 'react-router-dom';
import { useCountdown } from '../hooks/useCountdown';
import type { VaultDisplay } from '../types';

const URGENCY_COLORS = {
  safe: 'text-green-400 border-green-800',
  warning: 'text-yellow-400 border-yellow-800',
  critical: 'text-red-400 border-red-800',
  expired: 'text-gray-500 border-gray-700',
};

const STATUS_BADGE = {
  Locked: 'bg-green-900 text-green-300',
  Released: 'bg-gray-700 text-gray-300',
  Cancelled: 'bg-gray-700 text-gray-400',
};

interface Props {
  vault: VaultDisplay;
  onCheckIn?: (id: bigint) => void;
  checkingIn?: boolean;
}

export function VaultCard({ vault, onCheckIn, checkingIn }: Props) {
  const countdown = useCountdown(vault.status === 'Locked' ? vault.expiresAt : null);
  const xlm = (Number(vault.balance) / 1e7).toFixed(2);
  const urgencyClass = URGENCY_COLORS[vault.urgency];

  return (
    <div className={`bg-brand-surface border rounded-xl p-5 space-y-3 ${urgencyClass}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-gray-400">Vault #{vault.id.toString()}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[vault.status]}`}>
          {vault.status}
        </span>
      </div>

      <div className="text-2xl font-bold text-white">{xlm} XLM</div>

      <div className="text-sm text-gray-400 font-mono truncate">
        → {vault.beneficiaries[0]?.address ?? '—'}
        {vault.beneficiaries.length > 1 && (
          <span className="ml-1 text-gray-600">+{vault.beneficiaries.length - 1} more</span>
        )}
      </div>

      {vault.status === 'Locked' && (
        <div className={`text-sm font-mono font-semibold ${urgencyClass.split(' ')[0]}`}>
          ⏱ {countdown || '—'}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Link
          to={`/vault/${vault.id}`}
          className="text-sm px-3 py-1.5 border border-brand-border rounded-lg hover:border-gray-400 transition-colors"
        >
          Details
        </Link>
        {vault.status === 'Locked' && onCheckIn && (
          <button
            onClick={() => onCheckIn(vault.id)}
            disabled={checkingIn}
            className="text-sm px-3 py-1.5 bg-brand-red hover:bg-brand-darkred text-white rounded-lg transition-colors"
          >
            {checkingIn ? 'Signing…' : 'Check In'}
          </button>
        )}
        {vault.status !== 'Locked' && vault.urgency === 'expired' && (
          <Link
            to={`/vault/${vault.id}/release`}
            className="text-sm px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Release
          </Link>
        )}
      </div>
    </div>
  );
}
