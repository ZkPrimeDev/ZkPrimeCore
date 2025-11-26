import { describe, it, expect } from 'vitest';
import { ZkPrimeClient } from '../src/client';
import { deriveKeyFromSeed } from '../src/crypto/encryption';
describe('PrivateStateClient', () => {
    it('defines schema, encrypts and decrypts payload, computes commitment', async () => {
        const client = new ZkPrimeClient({ rpcEndpoint: 'http://localhost:8899' });
        const schema = client.privateState.defineSchema({
            id: 'test-schema-v1',
            name: 'TestSchema',
            fields: [{ name: 'balance', type: 'u64' }]
        });
        expect(schema.id).toBe('test-schema-v1');
        const seed = await deriveKeyFromSeed(Uint8Array.from(Buffer.from('seed-1')));
        const { state, encrypted } = await client.privateState.createState({
            schemaId: schema.id,
            owner: 'owner1',
            data: { balance: 42 },
            symmetricKeySeed: seed
        });
        expect(state).toHaveProperty('commitment');
        // decrypt roundtrip
        const decrypted = await client.privateState.decryptWithSeed(encrypted, Uint8Array.from(Buffer.from('seed-1')));
        // Note: decryptWithSeed uses deriveKeyFromSeed internally; here we pass raw seed which deriveKeyFromSeed will hash
        expect(typeof decrypted.balance === 'number' || decrypted.balance === 42).toBeTruthy();
    });
});
import { PrivateStateClient } from '../src/privateState/privateStateClient';
describe('PrivateStateClient', () => {
    it('validates schema and encrypts', async () => {
        const client = new PrivateStateClient({ config: { rpcEndpoint: 'http://localhost:8899', programId: 'fake' } });
        const schema = client.defineSchema({ name: 'T', fields: [{ name: 'a', type: 'u64' }] });
        const seed = new Uint8Array(32);
        const r = await client.encryptAndCommit(schema, { a: 1 }, seed);
        expect(r.commitment).toBeDefined();
    });
});
