export type ReleaseStatus = 'Locked' | 'Released' | 'Cancelled';

export interface BeneficiaryEntry {
  address: string;
  bps: number; // basis points, 10000 = 100%
}

export interface Vault {
  id: bigint;
  owner: string;
  beneficiaries: BeneficiaryEntry[];
  balance: bigint; // in stroops
  check_in_interval: bigint; // seconds
  last_check_in: bigint; // unix timestamp
  status: ReleaseStatus;
}

export interface VaultDisplay extends Vault {
  expiresAt: number; // unix ms
  remainingSecs: number;
  urgency: 'safe' | 'warning' | 'critical' | 'expired';
}

export interface PasskeyCredential {
  credentialId: string; // base64url
  stellarAddress: string;
  publicKey: string; // base64url P-256 raw public key
}

export interface TxResult {
  hash: string;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}
