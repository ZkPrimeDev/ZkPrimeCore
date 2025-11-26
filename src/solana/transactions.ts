import {
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Connection,
  Signer,
  PublicKey
} from '@solana/web3.js';
import type { WalletAdapter } from '../types';
import { RPCError } from '../errors';

/**
 * Minimal wallet adapter interface is declared in `src/types.ts`.
 *
 * Helpers to build and send transactions using the wallet adapter.
 */

/**
 * Build a transaction from instructions, sign with provided wallet adapter, and send.
 * The SDK expects walletAdapter to sign transactions; it never reads secret keys directly.
 */
export async function buildAndSendTransaction(params: {
  connection: Connection;
  walletAdapter: WalletAdapter;
  instructions: TransactionInstruction[];
  additionalSigners?: Signer[]; // optional program-derived signers
}): Promise<string> {
  const { connection, walletAdapter, instructions, additionalSigners = [] } = params;

  if (!walletAdapter || !walletAdapter.publicKey) throw new RPCError('walletAdapter with publicKey required');

  const tx = new Transaction();
  for (const ix of instructions) tx.add(ix);
  tx.feePayer = walletAdapter.publicKey as PublicKey;
  const { blockhash } = await connection.getLatestBlockhash('finalized');
  tx.recentBlockhash = blockhash;

  // Wallet adapter signing
  if (walletAdapter.signTransaction) {
    const signed = await walletAdapter.signTransaction(tx);
    // If additional signers provided, append their signatures before sending
    if (additionalSigners.length > 0) {
      signed.partialSign(...additionalSigners);
    }
    const raw = signed.serialize();
    return await connection.sendRawTransaction(raw);
  } else if (additionalSigners.length > 0) {
    // Try to sign with additional signers (e.g., Keypair) only
    tx.partialSign(...additionalSigners);
    // Can't sign with user wallet -> error
    throw new RPCError('walletAdapter.signTransaction is required to sign transactions');
  } else {
    throw new RPCError('walletAdapter must provide signTransaction');
  }
}

/**
 * Helper to create a simple TransactionInstruction.
 */
export function createInstruction(programId: string, data: Buffer, keys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(programId),
    keys,
    data
  });
}
