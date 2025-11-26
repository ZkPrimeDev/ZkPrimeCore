import { describe, it, expect } from 'vitest';
import { ZkPrimeClient } from '../src/client';

describe('ConfidentialComputeClient', () => {
  it('registers job types and runs mock submission flow', async () => {
    const client = new ZkPrimeClient({ rpcEndpoint: 'http://localhost:8899' });

    client.confidentialCompute.registerJobType({ name: 'score', version: 'v1' });

    const seed = await (await import('../src/crypto/encryption')).deriveKeyFromSeed(Uint8Array.from(Buffer.from('job-seed')));
    const { jobId } = await client.confidentialCompute.submitJob({
      jobType: 'score',
      owner: 'owner1',
      input: { user: 'alice' },
      symmetricKeySeed: seed
    });

    expect(jobId).toBeTruthy();

    const status = await client.confidentialCompute.getJobStatus(jobId);
    expect(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']).toContain(status);
  });
});
