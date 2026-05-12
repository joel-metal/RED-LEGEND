import { Link } from 'react-router-dom';
import { useCountdown } from '../hooks/useCountdown';
import type { VaultDisplay } from '../types';

interface Props { vaults: VaultDisplay[] }

function UrgentVaultItem({ vault }: { vault: VaultDisplay }) {
  const countdown = useCountdown(vault.expiresAt);
  return (
    <Link to={`/vault/${vault.id}`} className="underline hover:no-underline">
      Vault #{vault.id.toString()} expires in {countdown}
    </Link>
  );
}

export function CountdownBanner({ vaults }: Props) {
  const urgent = vaults.filter(
    (v) => v.status === 'Locked' && v.remainingSecs > 0 && v.remainingSecs < 172800, // 48h
  );
  if (urgent.length === 0) return null;

  return (
    <div className="bg-brand-red text-white text-sm px-4 py-2 flex flex-wrap gap-4 justify-center">
      <span className="font-semibold">⚠ Check-in required:</span>
      {urgent.map((v) => (
        <UrgentVaultItem key={v.id.toString()} vault={v} />
      ))}
    </div>
  );
}
