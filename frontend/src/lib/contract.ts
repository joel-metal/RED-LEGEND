import { Contract, xdr, Address, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import { server, CONTRACT_ID, NETWORK_PASSPHRASE, getAccount, buildTx, simulateAndSend } from './stellar';
import type { Vault, BeneficiaryEntry, ReleaseStatus, TxResult } from '../types';

const contract = new Contract(CONTRACT_ID);

// ── helpers ──────────────────────────────────────────────────────────────────

function addr(a: string) {
  return new Address(a).toScVal();
}

function u64(n: bigint | number) {
  return nativeToScVal(BigInt(n), { type: 'u64' });
}

function i128(n: bigint | number) {
  return nativeToScVal(BigInt(n), { type: 'i128' });
}

function parseVault(raw: xdr.ScVal): Vault {
  const map = scValToNative(raw) as Record<string, unknown>;
  const bens = (map['beneficiaries'] as Array<{ address: string; bps: number }>).map((b) => ({
    address: b.address,
    bps: Number(b.bps),
  }));
  const statusRaw = map['status'] as string;
  const status: ReleaseStatus =
    statusRaw === 'Released' ? 'Released' : statusRaw === 'Cancelled' ? 'Cancelled' : 'Locked';
  return {
    id: BigInt(map['id'] as number),
    owner: map['owner'] as string,
    beneficiaries: bens,
    balance: BigInt(map['balance'] as number),
    check_in_interval: BigInt(map['check_in_interval'] as number),
    last_check_in: BigInt(map['last_check_in'] as number),
    status,
  };
}

async function readOnly(method: string, args: xdr.ScVal[]): Promise<xdr.ScVal> {
  const op = contract.call(method, ...args);
  // Use a well-known testnet account for read-only simulation
  const sourceAccount = await server.getAccount('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN');
  const tx = buildTx(sourceAccount, [op]);
  const sim = await server.simulateTransaction(tx);
  if ('error' in sim) throw new Error((sim as { error: string }).error);
  const result = (sim as { result?: { retval: xdr.ScVal } }).result;
  if (!result) throw new Error('No result from simulation');
  return result.retval;
}

// ── read methods ─────────────────────────────────────────────────────────────

export async function getVault(vaultId: bigint): Promise<Vault> {
  const val = await readOnly('get_vault', [u64(vaultId)]);
  return parseVault(val);
}

export async function getRedRemaining(vaultId: bigint): Promise<number | null> {
  const val = await readOnly('get_red_remaining', [u64(vaultId)]);
  const native = scValToNative(val);
  if (native === null || native === undefined) return null;
  return Number(native);
}

export async function isExpired(vaultId: bigint): Promise<boolean> {
  const val = await readOnly('is_expired', [u64(vaultId)]);
  return scValToNative(val) as boolean;
}

export async function getReleaseStatus(vaultId: bigint): Promise<ReleaseStatus> {
  const val = await readOnly('get_release_status', [u64(vaultId)]);
  return scValToNative(val) as ReleaseStatus;
}

export async function getVaultsByOwner(
  owner: string,
  offset = 0,
  limit = 20,
): Promise<bigint[]> {
  const val = await readOnly('get_vaults_by_owner', [
    addr(owner),
    nativeToScVal(null, { type: 'option' }),
    u64(offset),
    u64(limit),
  ]);
  const arr = scValToNative(val) as number[];
  return arr.map(BigInt);
}

// ── write methods ─────────────────────────────────────────────────────────────

export async function createVault(
  owner: string,
  beneficiary: string,
  checkInInterval: bigint,
  sign: (xdr: string) => Promise<string>,
): Promise<TxResult & { vaultId?: bigint }> {
  const sourceAccount = await getAccount(owner);
  const op = contract.call('create_vault', addr(owner), addr(beneficiary), u64(checkInInterval));
  const tx = buildTx(sourceAccount, [op]);
  const { hash, result } = await simulateAndSend(tx, sign);
  const vaultId = result ? BigInt(scValToNative(result) as number) : undefined;
  return { hash, status: 'SUCCESS', vaultId };
}

export async function deposit(
  from: string,
  vaultId: bigint,
  amount: bigint,
  sign: (xdr: string) => Promise<string>,
): Promise<TxResult> {
  const sourceAccount = await getAccount(from);
  const op = contract.call('deposit', u64(vaultId), addr(from), i128(amount));
  const tx = buildTx(sourceAccount, [op]);
  const { hash } = await simulateAndSend(tx, sign);
  return { hash, status: 'SUCCESS' };
}

export async function checkIn(
  caller: string,
  vaultId: bigint,
  sign: (xdr: string) => Promise<string>,
): Promise<TxResult> {
  const sourceAccount = await getAccount(caller);
  const op = contract.call('check_in', u64(vaultId), addr(caller));
  const tx = buildTx(sourceAccount, [op]);
  const { hash } = await simulateAndSend(tx, sign);
  return { hash, status: 'SUCCESS' };
}

export async function triggerRelease(
  caller: string,
  vaultId: bigint,
  sign: (xdr: string) => Promise<string>,
): Promise<TxResult> {
  const sourceAccount = await getAccount(caller);
  const op = contract.call('trigger_release', u64(vaultId));
  const tx = buildTx(sourceAccount, [op]);
  const { hash } = await simulateAndSend(tx, sign);
  return { hash, status: 'SUCCESS' };
}

export async function partialRelease(
  caller: string,
  vaultId: bigint,
  amount: bigint,
  sign: (xdr: string) => Promise<string>,
): Promise<TxResult> {
  const sourceAccount = await getAccount(caller);
  const op = contract.call('partial_release', u64(vaultId), i128(amount));
  const tx = buildTx(sourceAccount, [op]);
  const { hash } = await simulateAndSend(tx, sign);
  return { hash, status: 'SUCCESS' };
}

export async function withdraw(
  caller: string,
  vaultId: bigint,
  amount: bigint,
  sign: (xdr: string) => Promise<string>,
): Promise<TxResult> {
  const sourceAccount = await getAccount(caller);
  const op = contract.call('withdraw', u64(vaultId), addr(caller), i128(amount));
  const tx = buildTx(sourceAccount, [op]);
  const { hash } = await simulateAndSend(tx, sign);
  return { hash, status: 'SUCCESS' };
}

export async function setBeneficiaries(
  caller: string,
  vaultId: bigint,
  beneficiaries: BeneficiaryEntry[],
  sign: (xdr: string) => Promise<string>,
): Promise<TxResult> {
  const sourceAccount = await getAccount(caller);
  const bensScVal = xdr.ScVal.scvVec(
    beneficiaries.map((b) =>
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: nativeToScVal('address'), val: addr(b.address) }),
        new xdr.ScMapEntry({ key: nativeToScVal('bps'), val: nativeToScVal(b.bps, { type: 'u32' }) }),
      ]),
    ),
  );
  const op = contract.call('set_beneficiaries', u64(vaultId), addr(caller), bensScVal);
  const tx = buildTx(sourceAccount, [op]);
  const { hash } = await simulateAndSend(tx, sign);
  return { hash, status: 'SUCCESS' };
}

export async function createVaultWithBeneficiaries(
  owner: string,
  beneficiaries: BeneficiaryEntry[],
  checkInInterval: bigint,
  depositAmount: bigint,
  sign: (xdr: string) => Promise<string>,
): Promise<TxResult & { vaultId?: bigint }> {
  // Create with first beneficiary, then set all
  const result = await createVault(owner, beneficiaries[0].address, checkInInterval, sign);
  if (!result.vaultId) throw new Error('No vault ID returned');

  if (beneficiaries.length > 1) {
    await setBeneficiaries(owner, result.vaultId, beneficiaries, sign);
  }
  if (depositAmount > 0n) {
    await deposit(owner, result.vaultId, depositAmount, sign);
  }
  return result;
}

// ── Horizon event history ─────────────────────────────────────────────────────

export async function getVaultEvents(_vaultId: bigint) {
  const HORIZON = 'https://horizon-testnet.stellar.org';
  const res = await fetch(
    `${HORIZON}/accounts/${CONTRACT_ID}/transactions?limit=20&order=desc`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  // Return raw records; pages can filter by vault_id in memo or events
  return (data._embedded?.records ?? []) as Array<{ hash: string; created_at: string }>;
}

export { NETWORK_PASSPHRASE };
