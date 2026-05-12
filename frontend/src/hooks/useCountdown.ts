import { useState, useEffect } from 'react';

/** Returns live countdown string from a future unix-ms timestamp */
export function useCountdown(expiresAtMs: number | null): string {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    if (!expiresAtMs) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      if (diff === 0) { setDisplay('Expired'); return; }
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setDisplay(
        d > 0
          ? `${d}d ${h}h ${m}m`
          : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAtMs]);

  return display;
}
