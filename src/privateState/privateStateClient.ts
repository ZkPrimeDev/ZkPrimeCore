import { ZkPrimeConfig, EncryptedPayload, WalletAdapter, StateHandle } from '../types';
import { getConnection } from '../solana/connection';
import { createInstruction, buildAndSendTransaction } from '../solana/transactions';
import { encryptPayload, deriveKeyFromSeed, decryptPayload, normalizeKey } from '../crypto/encryption';
import { hashCommitment } from '../crypto/hashing';
import { SchemaError, ConfigError, NotFoundError } from '../errors';

/**
 * Type definitions for schema and state ops.
 */
export type SchemaField = { name: string; type: 'u64' | 'string' | 'bytes' | 'boolean' };
export interface PrivateSchema {
  id: string;
  name: string;
  fields: SchemaField[];
}

/**
 * Parameters for creating state.
 */
export interface CreateStateParams<T = any> {
  schemaId: string;
  owner: string; // base58 pubkey
  data: T;
  symmetricKeySeed: Uint8Array; // caller-supplied seed for deriving encryption key
}

/**
 * Parameters for updating state.
 */
export interface UpdateStateParams<T = any> extends CreateStateParams<T> {
  stateId: string;
  previousCommitment: string;
}

/**
 * Proof object (opaque).
 */
export interface ProofObject {
  proof: string;
  publicInputs?: Record<string, any>;
}

/**
 * PrivateStateClient — responsible for schema registration, encrypting state, commitments,
 * proof generation (abstracted), and on-chain interactions.
 */
export class PrivateStateClient {
  private config: ZkPrimeConfig;
  // Local registry for schemas (clients may persist elsewhere)
  private schemaRegistry = new Map<string, PrivateSchema>();

  constructor(configOrOpts: ZkPrimeConfig | { config: ZkPrimeConfig }) {
    const cfg = (configOrOpts as any).config ? (configOrOpts as any).config : (configOrOpts as ZkPrimeConfig);
    if (!cfg || !cfg.rpcEndpoint) throw new ConfigError('rpcEndpoint required');
    this.config = cfg;
  }

  /**
   * Define a schema locally (and optionally register on-chain).
   */
  defineSchema(schema: PrivateSchema) {
    if (!schema.id || !schema.name || !Array.isArray(schema.fields) || schema.fields.length === 0) {
      throw new SchemaError('invalid schema');
    }
    this.schemaRegistry.set(schema.id, schema);
    // NOTE: On-chain registration is out-of-scope for this helper; integrators can call program-specific flows.
    return schema;
  }

  getSchema(schemaId: string): PrivateSchema {
    const s = this.schemaRegistry.get(schemaId);
    if (!s) throw new NotFoundError(`schema ${schemaId} not found`);
    return s;
  }

  /**
   * Encrypt data, compute commitment, and optionally submit on-chain to create a state account.
   * Returns state handle that references the commitment and owner.
   */
  async createState<T = any>(params: CreateStateParams<T>, walletAdapter?: WalletAdapter): Promise<{ state: StateHandle; encrypted: EncryptedPayload }> {
    const schema = this.getSchema(params.schemaId);
    const key = await normalizeKey(params.symmetricKeySeed);
    const encrypted = await encryptPayload<T>(params.data, key);
    const commitment = hashCommitment(encrypted.ciphertext);

    // If programId is provided and walletAdapter provided, create on-chain record (simple instruction)
    if (this.config.programId && walletAdapter) {
      const conn = getConnection(this.config.rpcEndpoint);
      const data = Buffer.from(JSON.stringify({ op: 'create', commitment }), 'utf8');
      const ix = createInstruction(this.config.programId, data, [
        { pubkey: walletAdapter.publicKey!, isSigner: true, isWritable: false }
      ]);
      // Build and send transaction
      await buildAndSendTransaction({ connection: conn, walletAdapter, instructions: [ix] }).then(() => {
        /* no-op */
      });
    }

    // Derive state id locally (in production this would come from on-chain account)
    const stateId = hashCommitment(commitment + params.owner).slice(0, 32);
    const handle: StateHandle = {
      id: stateId,
      commitment,
      owner: params.owner
    };
    return { state: handle, encrypted };
  }

  /**
   * Update existing state: re-encrypt, compute new commitment, and submit proof/update.
   */
  async updateState<T = any>(params: UpdateStateParams<T>, walletAdapter?: WalletAdapter): Promise<{ state: StateHandle; encrypted: EncryptedPayload }> {
    // Basic check of schema existence
    this.getSchema(params.schemaId);

    // Re-encrypt payload and compute commitment
    const key = await normalizeKey(params.symmetricKeySeed);
    const encrypted = await encryptPayload<T>(params.data, key);
    const newCommitment = hashCommitment(encrypted.ciphertext);

    // Optionally submit update on-chain
    if (this.config.programId && walletAdapter) {
      const conn = getConnection(this.config.rpcEndpoint);
      const data = Buffer.from(JSON.stringify({ op: 'update', prev: params.previousCommitment, next: newCommitment }), 'utf8');
      const ix = createInstruction(this.config.programId, data, [
        { pubkey: walletAdapter.publicKey!, isSigner: true, isWritable: false }
      ]);
      await buildAndSendTransaction({ connection: conn, walletAdapter, instructions: [ix] });
    }

    const handle: StateHandle = {
      id: params.stateId ?? hashCommitment(newCommitment + params.owner).slice(0, 32),
      commitment: newCommitment,
      owner: params.owner
    };

    return { state: handle, encrypted };
  }

  /**
   * Generate a proof for an update or other circuit. If a proving service URL is configured,
   * the SDK will POST encrypted inputs to the service and return the proof response.
   * Otherwise a local mock proof is returned (for testing).
   */
  async generateProof(params: { stateId: string; encryptedPayload: EncryptedPayload; circuit: string }): Promise<ProofObject> {
    if (this.config.provingServiceUrl) {
      const url = `${this.config.provingServiceUrl}/generate-proof`;
      const body = {
        stateId: params.stateId,
        circuit: params.circuit,
        // send ciphertext as base64 for transport
        ciphertext: Buffer.from(params.encryptedPayload.ciphertext).toString('base64'),
        iv: Buffer.from(params.encryptedPayload.iv).toString('base64'),
        tag: Buffer.from(params.encryptedPayload.tag).toString('base64')
      };
      const resp = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
      if (!resp.ok) throw new Error(`prover error ${resp.status}`);
      const json = await resp.json();
      return { proof: json.proof, publicInputs: json.publicInputs || {} };
    } else {
      // Local mock proof for development
      return { proof: `mock-proof-for-${params.stateId}`, publicInputs: { mock: true } };
    }
  }

  /**
   * Submit a proof to the on-chain program (if configured) and return tx signature.
   */
  async submitProof(params: { stateId: string; proof: ProofObject }, walletAdapter: WalletAdapter): Promise<string> {
    if (!this.config.programId) throw new ConfigError('programId not configured for submitProof');
    if (!walletAdapter) throw new ConfigError('walletAdapter required to submit proof');

    const conn = getConnection(this.config.rpcEndpoint);
    const data = Buffer.from(JSON.stringify({ op: 'submit_proof', stateId: params.stateId, proof: params.proof.proof }), 'utf8');
    const ix = createInstruction(this.config.programId, data, [{ pubkey: walletAdapter.publicKey!, isSigner: true, isWritable: false }]);
    const txSig = await buildAndSendTransaction({ connection: conn, walletAdapter, instructions: [ix] });
    return txSig;
  }

  /**
   * Fetch the current commitment for a state ID.
   * In a production implementation, this would query the program account for the state.
   * Here we provide a minimal placeholder that returns NotFound or a mock.
   */
  async getStateCommitment(stateId: string): Promise<{ commitment: string } | null> {
    // If programId provided, try to query on-chain account (placeholder implementation)
    if (!this.config.programId) {
      // Not configured -> return null
      return null;
    }

    const conn = getConnection(this.config.rpcEndpoint);
    // placeholder: program-specific account derivation required; return null to signal not implemented
    // Integrator should replace with Anchor or program-specific account lookup
    return null;
  }

  /**
   * Decrypt a previously produced encrypted payload given the seed.
   */
  async decryptWithSeed<T>(encrypted: EncryptedPayload, seedOrKey: Uint8Array): Promise<T> {
    const key = await normalizeKey(seedOrKey);
    return decryptPayload<T>(encrypted, key);
  }
}

