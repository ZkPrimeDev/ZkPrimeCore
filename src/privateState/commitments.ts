import { sha256, toHex } from '../crypto/hashing';

export function createCommitment(payload: Uint8Array): { commitment: string; raw: Uint8Array } {
  const hash = sha256(payload);
  return { commitment: toHex(hash), raw: hash };
}

export function verifyCommitment(payload: Uint8Array, commitmentHex: string): boolean {
  const { commitment } = createCommitment(payload);
  return commitment === commitmentHex;
}
