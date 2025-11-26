/**
 * Example: create a private token balance state, generate a mock proof, submit.
 *
 * Node runnable example (requires `npm run build` or ts-node).
 */
import { ZkPrimeClient } from '../src/client';
import { Keypair } from '@solana/web3.js';
import { deriveKeyFromSeed } from '../src/crypto/encryption';
async function main() {
    // -- setup wallet adapter from Keypair for example purposes
    const kp = Keypair.generate();
    const walletAdapter = {
        publicKey: kp.publicKey,
        async signTransaction(tx) {
            tx.partialSign(kp);
            return tx;
        }
    };
    const client = new ZkPrimeClient({
        rpcEndpoint: 'https://api.devnet.solana.com',
        programId: process.env.PRIVATE_PROGRAM_ID,
        provingServiceUrl: process.env.PROVER_URL
    });
    // Define schema
    client.privateState.defineSchema({
        id: 'private-token-balance-v1',
        name: 'PrivateTokenBalance',
        fields: [{ name: 'balance', type: 'u64' }]
    });
    // Create state
    const seed = (await deriveKeyFromSeed(Uint8Array.from(Buffer.from('example-seed'))));
    const { state, encrypted } = await client.privateState.createState({
        schemaId: 'private-token-balance-v1',
        owner: kp.publicKey.toBase58(),
        data: { balance: 1000 },
        symmetricKeySeed: seed
    }, walletAdapter);
    console.log('State created (client-side):', state);
    // Generate mock proof (or call real proving service)
    const proof = await client.privateState.generateProof({ stateId: state.id, encryptedPayload: encrypted, circuit: 'update_balance_v1' });
    console.log('Generated proof:', proof.proof);
    // Submit proof (requires programId configured)
    if (process.env.PRIVATE_PROGRAM_ID) {
        const sig = await client.privateState.submitProof({ stateId: state.id, proof }, walletAdapter);
        console.log('Proof submitted tx:', sig);
    }
    else {
        console.log('PRIVATE_PROGRAM_ID not configured; skipping on-chain submission.');
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
import { ZKPrimeClient } from '../src/client';
import { generateKeypair } from '../src/crypto/encryption';
async function run() {
    const client = new ZKPrimeClient({ rpcEndpoint: 'https://api.devnet.solana.com', programId: process.env.PRIVATE_PROGRAM_ID });
    const schema = client.privateState.defineSchema({ name: 'PrivateBalance', fields: [{ name: 'balance', type: 'u64' }] });
    const seedPair = generateKeypair();
    const record = { balance: 1000 };
    const { encrypted, commitment } = await client.privateState.encryptAndCommit(schema, record, seedPair.secretKey);
    console.log('Commitment:', commitment.commitment);
    // submitCommitment requires a signer (Keypair) provided by caller
}
run().catch(console.error);
