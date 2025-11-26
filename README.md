# ZKPRIME SDK — Technical Reference

![ZKPRIME banner](public/banner.png)

This repository contains the ZKPRIME TypeScript SDK: a client-side library exposing primitives and opinionated helpers for building privacy-first applications on Solana. This README is written for ultra-technical developers who will integrate the SDK into backend services, web clients, or on-chain program tooling.

**What this SDK is**
- **Client-only primitives**: encryption, hashing, commitment generation, job submission, and helpers for building Anchor-compatible Solana transactions.
- **Integration glue**: opinionated runtime expectations for on-chain programs and external proving/coordinator services.
- **Example harnesses and tests**: runnable examples in `examples/` and unit/integration tests in `tests/`.

**Design goals**
- Minimal trusted surface: all sensitive operations (encryption, key derivation) run locally.
- Clear separation between client responsibilities and on-chain program logic.
- Extensible configuration so integrators can provide custom proving services, program IDs, and wallet adapters.

**Install**
```powershell
npm install @zkprime/sdk
```

**High-level architecture & data flow**
1. Client constructs private objects according to a schema and encrypts payloads using `src/crypto/encryption.ts` APIs.
2. Client derives identity / commitment values (see `src/privateState/commitments.ts`) via hashing primitives in `src/crypto/hashing.ts`.
3. Client submits transactions to Solana using helpers in `src/solana/transactions.ts` and `src/client.ts`.
4. For confidential compute, clients register and submit encrypted jobs via `src/confidentialCompute/confidentialComputeClient.ts` which coordinates with an off-chain proving/coordinator service (configurable `provingServiceUrl`).
5. Results remain encrypted; clients fetch and decrypt results locally.

**Module map (quick)**
- `src/client.ts`: top-level `ZkPrimeClient` factory and runtime wiring.
- `src/config.ts`: configuration interface and validation.
- `src/index.ts`: package exports.
- `src/crypto/encryption.ts`: symmetric/asymmetric encryption helpers and KDFs used by the SDK.
- `src/crypto/hashing.ts`: hashing and commitment primitives used to produce on-chain-friendly field elements or digest buffers.
- `src/privateState/*`: schema definitions, commitment construction, and `privateStateClient.ts` runtime helpers.
- `src/confidentialCompute/*`: job registration, submission, and polling helpers.
- `src/solana/*`: transaction encoding, instruction builders, and RPC helpers.

If you need to inspect any implementation detail, open the corresponding file above.

**Primary runtime types & APIs**
- `ZkPrimeClient(config: ZkPrimeConfig) -> ZkPrimeClient`: top-level entry. `config` fields are defined in `src/types.ts` and `src/config.ts`.
- `client.privateState`: API surface for schema registration, creating private objects, and generating commitments. Key methods:
	- `createSchema(schemaDef)`: register local schema metadata used for serialization.
	- `seal(plainObject, options) -> EncryptedRecord`: encrypts and returns a ciphertext blob and its commitment.
	- `generateCommitment(plainObject) -> Commitment`: deterministic commitment (hash) used on-chain.
- `client.confidentialCompute`: API for off-chain compute jobs. Key methods:
	- `registerJobType(meta) -> JobTypeId`: register job type metadata with coordinator/prover.
	- `submitJob(encryptedPayload, jobTypeId) -> JobHandle`: submits a job and returns a handle for status polling.
	- `pollJob(jobHandle) -> JobResult | null`: poll for completion; results are encrypted — decrypt client-side.

Refer to the TypeScript signatures in `src/types.ts` for full method and param types.

**Crypto & data format notes (developer-focused)**
- Encryption: the SDK uses local symmetric encryption to protect payloads prior to sending them to the network or to the proving service. See `src/crypto/encryption.ts` for the KDF choices, nonce formats, serialization of ciphertext envelopes, and recommended key lifecycle.
- Hashing & commitments: `src/crypto/hashing.ts` exposes both raw digest functions and higher-level field element construction for on-chain commitments. Commitments are deterministic and canonical; ensure clients reproduce identical canonicalization when constructing commitments off-chain.
- Key material: by default keys are ephemeral or derived from a wallet signature (see `walletAdapter` integration). The SDK does not perform long-term key storage; integrators that require persistent keys must provide a secure KMS and pass derived keys into the SDK.

**On-chain program integration expectations**
- Programs that consume SDK-generated commitments should expect canonical digest sizes (see `src/crypto/hashing.ts`) and serialization formats for commitment accounts.
- Anchor program IDs and instruction layout assumptions are configurable via `ZkPrimeConfig.programId` and related fields in `src/config.ts`.
- The SDK provides transaction builders in `src/solana/transactions.ts`; these builders return `TransactionInstruction` objects that follow the project's Anchor layout — you can use them directly in your own Anchor program test harnesses.

**Prover / coordinator integration**
- The `provingServiceUrl` configuration parameter is an HTTP endpoint that the SDK will call for job registration and proof orchestration. The protocol is intentionally minimal: the SDK sends encrypted job payloads and metadata; the server replies with job handles and signed receipt objects.
- The proving service is out-of-scope for this SDK, but the SDK ships example payloads in `examples/confidential-compute-example.ts` that show the exact envelope format expected.

**Development, build, and tests**
- Build: `npm run build` (see `package.json` for the build pipeline).
- Tests: `npm test` or `npx vitest` for unit/integration tests.
- Lint/format: use the repo's toolchain (check `package.json` scripts). Run formatters locally before opening PRs.

Quick commands (Windows PowerShell):
```powershell
npm install
npm run build
npm test
```

**Examples**
- `examples/private-token-example.ts`: minimal private-token flow (serialization -> encryption -> commitment -> transaction builder).
- `examples/confidential-compute-example.ts`: end-to-end confidential compute job submission and result decryption.

**Security considerations**
- The SDK assumes a secure client runtime: use secure contexts (HTTPS), validate `provingServiceUrl` TLS certificates, and isolate key material.
- Never pass raw long-term private keys into the SDK unless you control the KMS. Prefer ephemeral keys or wallet-derived keys.
- Be explicit about threat models when connecting to third-party proving services. The SDK provides encryption to protect payloads, but metadata (sizes, timestamps, job IDs) may leak unless additional padding/obfuscation is applied.

**Performance & operational notes**
- Encryption and hashing are CPU-bound; on constrained clients (mobile, edge) offload heavy work to a trusted environment or use WebAssembly implementations of crypto primitives.
- Batch transaction builders are available for higher throughput — see `src/solana/transactions.ts`.

**Contribution & extension points**
- Add new crypto primitives by extending `src/crypto/*` and keeping the serialization formats backward-compatible.
- To support other proving protocols, implement a wrapper that conforms to the SDK's coordinator interface and pass its URL via `ZkPrimeConfig.provingServiceUrl`.

**Troubleshooting**
- If commitment mismatch occurs between client and on-chain values: ensure canonical serialization and hashing code paths are identical; compare raw digests from `src/crypto/hashing.ts`.
- For transaction failures: dump the `TransactionInstruction` objects and inspect account metas and serialized data against your Anchor IDL expectations.

**References**
- Inspect `src/` for detailed code examples and the definitive TypeScript type signatures.

---
