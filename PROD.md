# Production Hardening Plan

Objective: evolve the Emerald + Symbiotic Relay demo into a production-ready system with real cryptography, resilient infra, and operational safeguards.

## 1) Cryptography & On-chain Correctness
- Replace mock KZG:
  - Adopt a vetted verifier (e.g., EIP-4844 precompile or audited BLS12-381 implementation).
  - Store commitments as compressed G1 bytes (48B) instead of `bytes32`.
  - Define calldata shape for proofs: `(commitment, x (field), y (field element), pi (G1/G2 as required))`.
- Challenge derivation:
  - Use hash-to-field on `keccak256(postId, operator, salt)` with domain separation.
  - Document mapping from blob to polynomial (chunking, encoding).
- Verification semantics:
  - Revert on malformed inputs; return `false` only for valid-but-failing proofs.
  - Gas benchmark verification and ensure block gas limits are respected.
- Testing:
  - Add unit/fuzz/invariant tests for malformed proofs, boundary x/y values, and replay scenarios.
  - Provide fixtures from off-chain prover to validate cross-compatibility.

## 2) Relay & Economic Integration
- Relay access control:
  - Allowlist trusted relay(s); add pausable/upgradeable pattern with timelock.
  - Add EIP-712 signatures or authenticated gateway if relay is off-chain.
- Staking/slashing:
  - Track operator stake and missed/invalid custody proofs; emit slashing signals.
  - Define thresholds and penalties; integrate with staking contracts or escrow.
- Finalization rules:
  - Formalize thresholds for Phase 1 and custody; consider configurable bps via governance.
  - Add replay protection for attestations and idempotent challenge creation.
- Events/telemetry:
  - Emit granular events for failed proof decoding, timeouts, and slashing signals.

## 3) Data Availability & Storage
- Data service:
  - Move from in-memory to durable storage (S3/IPFS/Arweave); add replication and retention policies.
  - Provide integrity checks (sha256/keccak) and content-type validation; enforce size limits.
  - Add auth/rate limiting and per-tenant isolation if multi-tenant.
- CID standardization:
  - Align cidHash with canonical hash (keccak vs sha256) and document encoding.
  - Support retrieval retries and backpressure in worker.

## 4) Custody Flow & Randomness
- Challenge sampling:
  - Use verifiable randomness (beacon/VRF) or post-finality blockhash with delay.
  - Parameterize number of challenged operators and deadline windows; make configurable.
- Timeouts & penalties:
  - Auto-mark missed proofs as failures; consider escalation paths.
  - Allow re-challenge or escalation if quorum not reached.

## 5) Worker Hardening
- Runtime:
  - Persist state (observed posts, challenges) in a durable store (SQLite/Postgres).
  - Handle chain reorgs via log replay with fromBlock checkpoints.
  - Implement retries, exponential backoff, and circuit breakers for data/chain calls.
  - Add structured logging, metrics (Prometheus/OpenTelemetry), and health checks.
- Key management:
  - Use KMS/HSM for `PRIVATE_KEY`; avoid raw keys in env; support multiple operators.
- Proof generation:
  - Integrate the real KZG prover; cache commitments and proofs per challenge.
  - Validate inputs before submission; guard against malformed challenge indices.

## 6) Frontend Productionization
- Connect to contracts:
  - Add wallet connect (e.g., wagmi/ethers), network selection, and contract addresses per env.
  - Display on-chain statuses and DA details; poll or subscribe via RPC/WebSocket.
- UX:
  - Robust error handling, loading states, and feature flags (simulate vs on-chain).
  - Input validation for uploads; show hash verification results from data service.
  - Separate env config (`.env.production`) and CSP headers; Sentry for errors.

## 7) CI/CD, Testing, and Tooling
- CI pipeline:
  - Lint/format (ESLint/Prettier), TypeScript typecheck, `forge fmt`/`forge test`, fuzz, invariants.
  - Build frontend, worker, and data service; run unit/integration tests.
- Security checks:
  - `npm audit`/`cargo audit` (if applicable), `slither`, `mythril`/`echidna` for contracts.
  - Dependency pinning and automated update checks.
- Integration tests:
  - Spin up local chain (Anvil), deploy contracts, run worker + data service, and simulate full flow with real proof fixtures.
  - Snapshot tests for frontend and contract ABIs.

## 8) Governance, Upgrades, and Operations
- Upgradeability:
  - Decide on proxy pattern or explicit migration; add admin timelock and multisig.
  - Access control matrix (owner, relay, operator roles).
- Observability:
  - Metrics for attestation throughput, custody success rate, proof latency, and slashing events.
  - Alerting on missed proofs, high revert rates, or RPC failures.
- Documentation & runbooks:
  - Deployment runbook (contracts + infra), rollback steps, and key rotation procedures.
  - Operator guide for generating/submitting proofs and handling challenges.

## 9) Compliance & Audit
- External audit for contracts and prover/verifier integration once stable.
- Threat model and risk assessment (DoS on data service, griefing in custody, replay attacks).
- Compliance for data handling if storing user content (PII considerations).

## Phased Delivery (suggested)
1. Cryptography + contract hardening (Sections 1–2): swap verifier, adjust commitment format, add tests/fuzz/invariant, relay ACL.
2. Storage + custody robustness (Sections 3–4): durable storage, VRF/entropy for challenges, configurable deadlines.
3. Worker + frontend productionization (Sections 5–6): persistence, metrics, wallet connect, on-chain status display.
4. CI/CD + security (Section 7) and observability/governance (Section 8).
5. Audit + launch readiness (Section 9): audit fixes, runbooks, and final rehearsals.
