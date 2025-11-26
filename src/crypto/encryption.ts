import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { sha256 } from './hashing';
import { EncryptedPayload } from '../types';
import { CryptoError } from '../errors';

/**
 * AES-256-GCM wrapper helpers.
 *
 * Keys must be supplied by the caller (32 bytes for AES-256-GCM).
 * SDK will not persist or generate long-term keys without explicit instruction.
 */

function ensureKey(key: Uint8Array) {
  if (!(key instanceof Uint8Array)) throw new CryptoError('Key must be a Uint8Array');
  if (key.length !== 32) throw new CryptoError('Key must be 32 bytes (256 bits)');
}

export async function deriveKeyFromSeed(seed: Uint8Array): Promise<Uint8Array> {
  // Simple KDF: SHA-256(seed). In production use HKDF with salt/context.
  return sha256(seed);
}

/**
 * Normalize a caller-supplied seed or key to a 32-byte AES key.
 * If `seedOrKey` is already 32 bytes, it is treated as the derived key.
 * Otherwise we derive a key using `deriveKeyFromSeed`.
 */
export async function normalizeKey(seedOrKey: Uint8Array): Promise<Uint8Array> {
  if (!(seedOrKey instanceof Uint8Array)) throw new CryptoError('seedOrKey must be a Uint8Array');
  if (seedOrKey.length === 32) return seedOrKey;
  return deriveKeyFromSeed(seedOrKey);
}

export async function encryptPayload<T>(data: T, key: Uint8Array): Promise<EncryptedPayload> {
  ensureKey(key);
  try {
    const json = JSON.stringify(data);
    const iv = randomBytes(12); // 96-bit nonce recommended for GCM
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(json, 'utf8')), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      alg: 'AES-GCM',
      iv: new Uint8Array(iv),
      ciphertext: new Uint8Array(ciphertext),
      tag: new Uint8Array(tag)
    };
  } catch (err: any) {
    throw new CryptoError(`encryptPayload failed: ${err?.message ?? String(err)}`);
  }
}

export async function decryptPayload<T>(payload: EncryptedPayload, key: Uint8Array): Promise<T> {
  ensureKey(key);
  if (payload.alg !== 'AES-GCM') throw new CryptoError('Unsupported algorithm');
  try {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(payload.iv));
    decipher.setAuthTag(Buffer.from(payload.tag));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext)), decipher.final()]);
    const text = decrypted.toString('utf8');
    return JSON.parse(text) as T;
  } catch (err: any) {
    throw new CryptoError(`decryptPayload failed: ${err?.message ?? String(err)}`);
  }
}
