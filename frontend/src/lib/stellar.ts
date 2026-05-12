import {
  rpc as SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Transaction,
  xdr,
  Account,
} from '@stellar/stellar-sdk';

export const RPC_URL = import.meta.env.VITE_STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_RED_VAULT ?? '';

export const server = new SorobanRpc.Server(RPC_URL, { allowHttp: false });

/** Simulate, then submit a signed transaction. Polls until SUCCESS or FAILED. */
export async function simulateAndSend(
  tx: Transaction,
  sign: (xdrBase64: string) => Promise<string>,
): Promise<{ hash: string; result?: xdr.ScVal }> {
  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
  const signedXdr = await sign(assembled.toXDR());
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;

  const sendResult = await server.sendTransaction(signedTx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Submit failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  const hash = sendResult.hash;
  // Poll until final
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const status = await server.getTransaction(hash);
    if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return { hash, result: (status as SorobanRpc.Api.GetSuccessfulTransactionResponse).returnValue };
    }
    if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed: ${hash}`);
    }
  }
  throw new Error(`Transaction timed out: ${hash}`);
}

export async function getAccount(address: string) {
  return server.getAccount(address);
}

export function buildTx(sourceAccount: Account, ops: xdr.Operation[]) {
  const builder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  }).setTimeout(300);
  ops.forEach((op) => builder.addOperation(op));
  return builder.build();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
