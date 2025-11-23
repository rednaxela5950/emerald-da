# Emerald + Symbiotic Relay — Data Availability Demo

This repository demonstrates a two-phase data availability (DA) flow on Emerald that can be driven by the Symbiotic Relay SDK. The goal is to show how Emerald can integrate Relay attestations for DA and then enforce custody challenges on-chain to discourage lazy voters/operators.

## What we built
- **Smart contracts (Foundry)**: `EmeraldPostRegistry` stores posts (`cidHash`, `kzgCommit`, status). `EmeraldDaAdapter` ingests DA attestations (Phase 1) and runs custody challenges (Phase 2) with a pluggable KZG verifier (`MockKzgVerifier`/`PrecompileKzgVerifier`). Events: `PostCreated`, `PostStatusChanged`, `Phase1DaPassed/Failed`, `CustodyChallengeStarted`, `PostFinalized`.
- **Dummy data service**: Express blob store; hashes uploads (sha256 → `cidHash`), stores bytes, exposes `/blob` endpoints. CORS enabled.
- **Worker scaffold**: Fetches blobs, re-hashes to confirm `cidHash`, listens for `PostCreated`/`CustodyChallengeStarted`, and (optionally) calls the Symbiotic Relay SDK to request DA signatures and fetch aggregation proofs.
- **Frontend (Vite + React)**: Uploads blobs to the data service *and* creates on-chain posts. It connects directly to Anvil via ethers using contract addresses baked into the build. Buttons drive adapter methods on-chain (Phase 1 pass/fail, custody finalize). UI shows RPC/contract pills and listens to registry events to stay in sync.
- **Automation (`start.sh`)**: Boots Anvil with a fresh timestamp, deploys contracts, writes `configs/local.chain.json`, installs deps if missing, and rebuilds/restarts Docker so the frontend is always configured with the live RPC/addresses and dev signer.

## How Emerald can leverage the Relay SDK here
1) **Phase 1 (attestation via Relay)**  
   - Worker hears `PostCreated` (on-chain).  
   - Worker fetches blob from the data service, re-hashes to confirm `cidHash`.  
   - Worker calls `requestDaSignature(postId, cidHash, kzgCommit)` on the Symbiotic Relay SDK. Relay returns `requestId`, `epoch`, and an attestation signature (aggregated later).  
   - Worker records the attestation on-chain via `handleDaAttestation` (Relay-only) or `recordPhase1Result` (owner/manual) with stake data and `yesVoters`. Registry status moves to `Phase1Passed`/`Phase1Failed`.

2) **Phase 2 (custody challenges)**  
   - For passed posts, adapter can start custody challenges targeting `yesVoters` (`startCustodyChallenges` emits `CustodyChallengeStarted`).  
   - Operators must answer with KZG openings (`submitCustodyProof`). The adapter uses a verifier (mock or precompile hook) to validate proofs.  
   - After `CHALLENGE_RESPONSE_WINDOW`, adapter finalizes to `Available` or `Unavailable` based on proof success ratio.

3) **Why Relay helps Emerald DA**  
   - **Aggregated attestations**: Relay provides aggregated signatures over `(postId, cidHash, kzgCommit)`, reducing on-chain verification costs and giving a cryptographic DA signal.  
   - **Sybil/stake-aware input**: Relay can weight attesters by stake, giving the adapter meaningful `yesStake/totalStake` for Phase 1 decisions.  
   - **Async & fault-tolerant**: The worker can retry `tryFetchAggregationProof` off-chain without blocking on-chain; only finalized attestation data hits the adapter.  
   - **Composable**: The adapter accepts alternate verifiers and Relay endpoints/keys via env; Emerald can swap Relay nodes, key tags, or verifier logic without redeploying the frontend/worker scaffolding.

## Flow to show in a demo
1) Start: `./stop.sh && ./start.sh` (requires anvil/forge + Docker). Anvil at 8545, data-service at 4400, frontend at 5174.  
2) Upload a file in the UI → blob stored in the data service, `registry.createPost` called on-chain. Block number increments; `PostCreated` emitted.  
3) Click “Phase 1 pass (on-chain)” → adapter `recordPhase1Result`, status → `Phase1Passed`.  
4) Click “Finalize: Available (on-chain)” → custody challenges + proofs + finalize to `Available`.  
5) Watch `cast block-number`, `cast logs`, or `.anvil.log` to prove transactions; break RPC/signer to see the UI fail (proves on-chain dependency).

## Configuration highlights
- Frontend build args/env: `VITE_RPC_URL`, `VITE_REGISTRY_ADDRESS`, `VITE_ADAPTER_ADDRESS`, `VITE_VERIFIER_ADDRESS`, `VITE_DEV_PRIVATE_KEY`, `VITE_DATA_SERVICE_URL`, Relay envs.  
- Worker env: `RPC_URL`, `REGISTRY_ADDRESS`, `ADAPTER_ADDRESS`, `VERIFIER_ADDRESS`, `DATA_SERVICE_URL`, Relay envs.  
- `configs/local.chain.json` is generated on deploy; `start.sh` reads it and exports the values to Docker builds.

## Why this design is compelling
- **End-to-end DA story**: From blob ingestion to attestation to custody, all steps are observable and reproducible locally.  
- **Relay-ready**: The worker is already scaffolded to call the Symbiotic Relay SDK; only the Relay endpoint/key need to be set.  
- **Swap verifiers**: Adapter constructor accepts any `IKzgVerifier`; can point to a real precompile or alternate contract.  
- **Deterministic setup**: `./start.sh` always deploys fresh, writes addresses, and rebuilds the UI with the correct RPC/contract config.  
- **Demo-friendly**: Instant mining by default (or set `ANVIL_BLOCK_TIME=12`), clear UI pills for RPC/registry/signer, and CLI proof (`cast logs`, `.anvil.log`) to show chain involvement.
