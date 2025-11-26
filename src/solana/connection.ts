import { Connection } from '@solana/web3.js';

const cache = new Map<string, Connection>();

/**
 * Create or reuse a Connection object for a given endpoint.
 */
export function getConnection(rpcEndpoint: string): Connection {
  const existing = cache.get(rpcEndpoint);
  if (existing) return existing;
  const conn = new Connection(rpcEndpoint, { commitment: 'confirmed' });
  cache.set(rpcEndpoint, conn);
  return conn;
}
