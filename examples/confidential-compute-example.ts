/**
 * Example: register a private trading strategy job, submit encrypted job,
 * poll status and fetch + decrypt result.
 */

import { ZkPrimeClient } from '../src/client';
import { Keypair, Transaction } from '@solana/web3.js';
import { deriveKeyFromSeed } from '../src/crypto/encryption';

async function main() {
  const kp = Keypair.generate();
  const walletAdapter = {
    publicKey: kp.publicKey,
    async signTransaction(tx: Transaction) {
      tx.partialSign(kp);
      return tx;
    }
  };

  const client = new ZkPrimeClient({
    rpcEndpoint: 'https://api.devnet.solana.com',
    computeProgramId: process.env.COMPUTE_PROGRAM_ID,
    provingServiceUrl: process.env.COMPUTE_COORDINATOR_URL
  });

  client.confidentialCompute.registerJobType({
    name: 'PrivateTradingStrategy',
    version: '1.0',
    description: 'Run a private trading strategy against private market view'
  });

  const seed = await deriveKeyFromSeed(Uint8Array.from(Buffer.from('strategy-seed-1')));

  const { jobId } = await client.confidentialCompute.submitJob({
    jobType: 'PrivateTradingStrategy',
    owner: kp.publicKey.toBase58(),
    input: { symbol: 'SOL', params: { lookback: 24 } },
    symmetricKeySeed: seed
  }, walletAdapter as any);

  console.log('Submitted job:', jobId);

  // Poll status (mock path will keep it pending until coordinator/completion)
  let status = await client.confidentialCompute.getJobStatus(jobId);
  console.log('Job status:', status);

  // For demo, if running locally without coordinator you can mark mock result:
  // (Not shown here - see tests for how to set mock result in-memory)

  try {
    const result = await client.confidentialCompute.fetchResult(jobId, seed);
    console.log('Decrypted job result:', result);
  } catch (e) {
    console.log('Result not available yet:', (e as Error).message);
  }
}

main().catch(console.error);
import { ZKPrimeClient } from '../src/client';
import { generateKeypair, deriveSymmetricKeyFromSeed, encryptSymmetric } from '../src/crypto/encryption';

async function run() {
  const client = new ZKPrimeClient({ rpcEndpoint: 'https://api.devnet.solana.com', computeProgramId: process.env.COMPUTE_PROGRAM_ID });
  const seedPair = generateKeypair();
  const input = Buffer.from(JSON.stringify({ action: 'score', user: 'alice' }), 'utf8');
  const key = deriveSymmetricKeyFromSeed(seedPair.secretKey);
  const encrypted = encryptSymmetric(input, key);
  const job = { type: 'score', encryptedInput: encrypted.ciphertext };
  const result = await client.compute.submitJob(job, /* signer */ (globalThis as any).signer);
  console.log('Submit result:', result);
}

run().catch(console.error);
