import { useState, useEffect, useCallback } from 'react';
import { getVault, getVaultsByOwner, getRedRemaining } from '../lib/contract';
import type { Vault, VaultDisplay } from '../types';

function toDisplay(vault: Vault, remainingSecs: number | null): VaultDisplay {
  const secs = remainingSecs ?? 0;
  const expiresAt = Date.now() + secs * 1000;
  const urgency =
    vault.status !== 'Locked'
      ? 'expired'
      : secs <= 0
      ? 'expired'
      : secs < 86400
      ? 'critical'
      : secs < 604800
      ? 'warning'
      : 'safe';
  return { ...vault, expiresAt, remainingSecs: secs, urgency };
}

export function useVaults(owner: string | null) {
  const [vaults, setVaults] = useState<VaultDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!owner) return;
    setLoading(true);
    setError(null);
    try {
      const ids = await getVaultsByOwner(owner);
      const results = await Promise.all(
        ids.map(async (id) => {
          const vault = await getVault(id);
          const remaining = await getRedRemaining(id);
          return toDisplay(vault, remaining);
        }),
      );
      setVaults(results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [owner]);

  useEffect(() => { refresh(); }, [refresh]);

  return { vaults, loading, error, refresh };
}

export function useVaultDetail(vaultId: string | undefined) {
  const [vault, setVault] = useState<VaultDisplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vaultId) return;
    setLoading(true);
    setError(null);
    try {
      const id = BigInt(vaultId);
      const v = await getVault(id);
      const remaining = await getRedRemaining(id);
      setVault(toDisplay(v, remaining));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [vaultId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { vault, loading, error, refresh };
}
