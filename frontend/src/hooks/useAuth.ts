import { useState, useCallback } from 'react';
import { loadPasskey, clearPasskey, signWithPasskey, signWithFreighter } from '../lib/passkey';
import type { PasskeyCredential } from '../types';

interface AuthState {
  address: string | null;
  passkey: PasskeyCredential | null;
  authMethod: 'passkey' | 'freighter' | null;
}

const ADDR_KEY = 'red_legend_address';
const METHOD_KEY = 'red_legend_auth_method';

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => {
    const address = localStorage.getItem(ADDR_KEY);
    const passkey = loadPasskey();
    const authMethod = (localStorage.getItem(METHOD_KEY) as AuthState['authMethod']) ?? null;
    return { address, passkey, authMethod };
  });

  const setAuth = useCallback((address: string, passkey: PasskeyCredential | null, method: 'passkey' | 'freighter') => {
    localStorage.setItem(ADDR_KEY, address);
    localStorage.setItem(METHOD_KEY, method);
    setState({ address, passkey, authMethod: method });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(ADDR_KEY);
    localStorage.removeItem(METHOD_KEY);
    clearPasskey();
    setState({ address: null, passkey: null, authMethod: null });
  }, []);

  /** Returns a sign function bound to the current auth method */
  const getSigner = useCallback((): ((xdr: string) => Promise<string>) => {
    if (state.authMethod === 'passkey' && state.passkey) {
      return (xdr) => signWithPasskey(xdr, state.passkey!.credentialId);
    }
    return signWithFreighter;
  }, [state]);

  return { ...state, setAuth, logout, getSigner, isAuthenticated: !!state.address };
}
