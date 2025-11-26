import type { PublicKey } from '@solana/web3.js';

/**
 * Global SDK configuration.
 */
export interface ZkPrimeConfig {
  rpcEndpoint: string;
  programId?: string;
  computeProgramId?: string;
  provingServiceUrl?: string; // optional coordinator/prover endpoint
  // Optional wallet adapter (caller may pass a connection + wallet separately)
  walletAdapter?: WalletAdapter;
}

/**
 * Minimal wallet adapter abstraction used by the SDK.
 * The SDK never persists keys; this is an adapter over user wallets.
 */
export interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction?: (tx: import('@solana/web3.js').Transaction) => Promise<import('@solana/web3.js').Transaction>;
  signAllTransactions?: (txs: import('@solana/web3.js').Transaction[]) => Promise<import('@solana/web3.js').Transaction[]>;
}

/**
 * Encrypted payload representation produced by the SDK.
 */
export interface EncryptedPayload {
  alg: 'AES-GCM';
  iv: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}

/**
 * Commitment / state handle types.
 */
export type CommitmentHex = string;

export interface StateHandle {
  id: string;
  commitment: CommitmentHex;
  owner: string; // base58 public key
}
