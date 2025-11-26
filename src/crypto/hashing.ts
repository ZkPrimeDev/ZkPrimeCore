import { createHash } from 'crypto';

/**
 * Compute SHA-256 and return bytes as Uint8Array.
 */
export function sha256(data: Uint8Array | string): Uint8Array {
  const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
  const h = createHash('sha256').update(input).digest();
  return new Uint8Array(h);
}

/**
 * Derive a hex string commitment from bytes.
 */
export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

/**
 * Convenience: hash and hex encode.
 */
export function hashCommitment(data: Uint8Array | string): string {
  return toHex(sha256(data));
}
