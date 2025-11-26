import { ZkPrimeConfig, EncryptedPayload, WalletAdapter } from '../types';
import { deriveKeyFromSeed, encryptPayload, decryptPayload, normalizeKey } from '../crypto/encryption';
import { getConnection } from '../solana/connection';
import { createInstruction, buildAndSendTransaction } from '../solana/transactions';
import { hashCommitment } from '../crypto/hashing';
import { NotFoundError, ConfigError } from '../errors';

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface JobDefinition {
  name: string;
  version?: string;
  description?: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
}

export interface JobRecord {
  id: string;
  owner: string;
  jobType: string;
  commitment: string;
  status: JobStatus;
  createdAt: number;
  resultRef?: string; // URL or on-chain pointer to encrypted result
}

/**
 * ConfidentialComputeClient:
 * - register job types
 * - submit encrypted jobs (on-chain or off-chain coordinator)
 * - poll job status
 * - fetch result and decrypt locally
 */
export class ConfidentialComputeClient {
  private config: ZkPrimeConfig;
  private registry = new Map<string, JobDefinition>();
  // Simple in-memory mock job store (used when no coordinator provided)
  private mockJobs = new Map<string, JobRecord>();

  constructor(config: ZkPrimeConfig) {
    this.config = config;
  }

  registerJobType(def: JobDefinition) {
    if (!def.name) throw new Error('job name required');
    this.registry.set(def.name, def);
    return def;
  }

  async submitJob(params: {
    jobType: string;
    owner: string;
    input: any;
    symmetricKeySeed: Uint8Array;
  }, walletAdapter?: WalletAdapter): Promise<{ jobId: string; txSig?: string }> {
    const def = this.registry.get(params.jobType);
    if (!def) throw new NotFoundError(`job type ${params.jobType} not registered`);

    const key = await normalizeKey(params.symmetricKeySeed);
    const encrypted = await encryptPayload(params.input, key);
    const commitment = hashCommitment(encrypted.ciphertext);
    const jobId = hashCommitment(commitment + params.owner).slice(0, 32);

    // If computeProgramId and walletAdapter configured, send job commitment on-chain
    let txSig: string | undefined;
    if (this.config.computeProgramId && walletAdapter) {
      const conn = getConnection(this.config.rpcEndpoint);
      const data = Buffer.from(JSON.stringify({ op: 'submit_job', jobId, commitment, type: params.jobType }), 'utf8');
      const ix = createInstruction(this.config.computeProgramId, data, [
        { pubkey: walletAdapter.publicKey!, isSigner: true, isWritable: false }
      ]);
      txSig = await buildAndSendTransaction({ connection: conn, walletAdapter, instructions: [ix] });
    }

    // If a provingServiceUrl / coordinator is available, POST the encrypted payload
    if (this.config.provingServiceUrl) {
      const url = `${this.config.provingServiceUrl}/submit-job`;
      const body = {
        jobId,
        jobType: params.jobType,
        owner: params.owner,
        iv: Buffer.from(encrypted.iv).toString('base64'),
        tag: Buffer.from(encrypted.tag).toString('base64'),
        ciphertext: Buffer.from(encrypted.ciphertext).toString('base64')
      };
      // best-effort fire-and-forget; do not throw on coordinator failure
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        });
      } catch (e) {
        // ignore coordinator network errors for now
      }
    } else {
      // Store in-memory mock job for tests / offline dev
      this.mockJobs.set(jobId, {
        id: jobId,
        owner: params.owner,
        jobType: params.jobType,
        commitment,
        status: 'PENDING',
        createdAt: Date.now()
      });
    }

    return { jobId, txSig };
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    // Try coordinator first
    if (this.config.provingServiceUrl) {
      const url = `${this.config.provingServiceUrl}/job-status/${jobId}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('coordinator error');
        const json = await resp.json();
        return (json.status as JobStatus) || 'PENDING';
      } catch (e) {
        // fallback to mock
      }
    }
    const job = this.mockJobs.get(jobId);
    if (!job) throw new NotFoundError('job not found');
    return job.status;
  }

  /**
   * Fetch encrypted result and decrypt with caller-provided seed.
   * If no coordinator, returns a NotFoundError unless mock result is set.
   */
  async fetchResult<T = any>(jobId: string, symmetricKeySeed: Uint8Array): Promise<T> {
    // Coordinator path
    if (this.config.provingServiceUrl) {
      const url = `${this.config.provingServiceUrl}/job-result/${jobId}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new NotFoundError('result not found');
      const json = await resp.json();
      const payload: EncryptedPayload = {
        alg: 'AES-GCM',
        iv: Buffer.from(json.iv, 'base64'),
        ciphertext: Buffer.from(json.ciphertext, 'base64'),
        tag: Buffer.from(json.tag, 'base64')
      };
      const key = await normalizeKey(symmetricKeySeed);
      return decryptPayload<T>(payload, key);
    }

    // Mock path
    const job = this.mockJobs.get(jobId);
    if (!job || !job.resultRef) throw new NotFoundError('result not available');
    // In mock we store resultRef as base64 serialized payload
    const decoded = Buffer.from(job.resultRef, 'base64');
    const payload = JSON.parse(decoded.toString('utf8'));
    const ep: EncryptedPayload = {
      alg: 'AES-GCM',
      iv: Buffer.from(epOr(payload.iv || ''), 'base64'), // Defensive - see below
      ciphertext: Buffer.from(payload.ciphertext, 'base64'),
      tag: Buffer.from(payload.tag, 'base64')
    };
    const key = await deriveKeyFromSeed(symmetricKeySeed);
    return decryptPayload<T>(ep, key);

    function epOr(v: string) {
      return v || '';
    }
  }

  // For tests only: allow setting mock result
  _setMockResult(jobId: string, encryptedPayload: EncryptedPayload) {
    const record = this.mockJobs.get(jobId);
    if (!record) throw new NotFoundError('job not found');
    // store the serialized payload in resultRef as base64 JSON
    const payload = {
      iv: Buffer.from(encryptedPayload.iv).toString('base64'),
      tag: Buffer.from(encryptedPayload.tag).toString('base64'),
      ciphertext: Buffer.from(encryptedPayload.ciphertext).toString('base64')
    };
    record.resultRef = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    record.status = 'COMPLETED';
    this.mockJobs.set(jobId, record);
  }
}
