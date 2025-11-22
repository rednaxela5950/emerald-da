# Emerald + Symbiotic Relay — Implementation Plan

Status legend:
- [ ] Not started
- [~] In progress
- [x] Done

This plan is maintained by both the human and the Codex assistant.
When starting a step, mark it `[~]` and create a more detailed spec under `docs/STEP-<n>-*.md`.
When finishing a step, mark it `[x]` and add a brief “Result” section to the step’s detailed doc.

---

## Step 0 — Repo bootstrap & environment [x]

- [ ] 0.1 Create repo structure:
  - `/contracts` for Solidity contracts.
  - `/contracts/test` (if using Foundry, `test/` at root).
  - `/packages/emerald-da-worker` for the off-chain worker.
  - `/apps/frontend` for the demo UI.
  - `/docs` for this plan and step specs.
- [ ] 0.2 Initialize tooling:
  - Foundry or Hardhat for contracts.
  - Node + TypeScript toolchain (pnpm or npm).
- [ ] 0.3 Add basic `README.md` with project summary and how to run tests.
- [ ] 0.4 Commit initial scaffold (`chore: bootstrap project`).

**Detailed spec:** `docs/STEP-0-BOOTSTRAP.md` (create when starting this step).

---

## Step 1 — DA data model & core contracts (Phase 1 shell) [x]

Goal: Have on-chain contracts that represent posts, their DA status, and the adapter entry point for Relay, with no actual Symbiotic integration yet (just interfaces and events).

- [ ] 1.1 Design `EmeraldPostRegistry` (or `EmeraldBoardDemo`):
  - Define `Post` struct: `postId`, `cidHash`, `kzgCommit`, `status`.
  - Define `Status` enum: `Pending`, `Phase1Failed`, `Phase1Passed`, `Available`, `Unavailable`, `Inconclusive`.
  - Implement:
    - `createPost(bytes32 cidHash, bytes32 kzgCommit) returns (bytes32 postId)`
    - `getPost(bytes32 postId) view`
    - Restricted setter `setStatusFromDa` callable only by DA adapter.
  - Emit `PostCreated` and `PostStatusChanged` events.

- [ ] 1.2 Design `EmeraldDaAdapter` interface:
  - Storage for:
    - Mapping from `postId` to Phase 1 DA state (timestamps, yesStake, totalStake, yesVoters).
    - Custody challenge data structure placeholders.
  - Define events:
    - `Phase1DaPassed(postId, yesStake, totalStake)`
    - `Phase1DaFailed(postId, yesStake, totalStake)`
    - `CustodyChallengeStarted(postId, operator, challengeIndex)`
    - `CustodyProofSubmitted(postId, operator, success)`
    - `PostFinalized(postId, finalStatus)`

- [ ] 1.3 Create `MockKzgVerifier` contract:
  - Define `verifyKzgOpening` function signature.
  - For now, return a configurable boolean or always `true` (with tests simulating failure via alternate mocks).

- [ ] 1.4 Write Foundry tests (or equivalent) for:
  - `createPost` behaviour.
  - Status transitions triggered by stubbed calls from `EmeraldDaAdapter`.
  - Basic interaction pattern between registry and adapter (without real Relay yet).

- [ ] 1.5 Commit with message like `feat: add core Emerald DA contracts (Phase1 shell)`.

**Detailed spec:** `docs/STEP-1-DA-CONTRACTS.md`.

---

## Step 2 — Symbiotic Relay Phase 1 integration (attested YES vote)

Goal: Wire `EmeraldDaAdapter` to accept and process a Symbiotic Relay DA attestation, acting as the Phase 1 yes/no vote.

- [ ] 2.1 Define the on-chain function that Settlement/Relay calls, e.g.:
  - `function handleDaAttestation(bytes32 postId, bytes32 cidHash, bytes32 kzgCommit, address[] yesVoters, uint256 yesStake, uint256 totalStake) external`
  - For now, assume `msg.sender` is a trusted Settlement/Relay adapter contract (mock this in tests).

- [ ] 2.2 Implement Phase 1 decision logic:
  - Check that `cidHash` and `kzgCommit` match the post.
  - Check that `yesStake` and `totalStake` are non-zero and `yesStake >= threshold(totalStake)`.
  - On success:
    - Store `yesVoters`, `yesStake`, `totalStake`.
    - Update post status to `Phase1Passed`.
  - On failure:
    - Update post status to `Phase1Failed` or `Unavailable`.

- [ ] 2.3 Add tests that:
  - Mock a valid Relay attestation and ensure Phase 1 passes correctly.
  - Mock an attestation with insufficient yesStake and ensure Phase 1 fails.
  - Mock mismatched `(cidHash, kzgCommit)` and ensure it is rejected.

- [ ] 2.4 Commit with message like `feat: wire EmeraldDaAdapter to Relay Phase1 attestation (mocked)`.

**Detailed spec:** `docs/STEP-2-RELAY-PHASE1.md`.

---

## Step 3 — Custody challenge logic (Phase 2, with mock KZG)

Goal: Implement the second phase where a random subset of yes‑voters must answer custody challenges derived from `kzgCommit`, using mocked KZG verification.

- [ ] 3.1 Define challenge storage:
  - `struct CustodyChallenge { address operator; uint256 challengeIndex; bool responded; bool success; }`
  - `mapping(bytes32 => CustodyChallenge[]) challenges;`
  - Simple randomness mechanism (blockhash-based) to:
    - Derive random seed after Phase 1.
    - Select subset of yesVoters.
    - Derive a `challengeIndex` per operator.

- [ ] 3.2 Implement:
  - `startCustodyChallenges(postId)`:
    - Require `Phase1Passed`.
    - Sample operators and store their challenges.
    - Emit `CustodyChallengeStarted` events.
  - `submitCustodyProof(postId, operator, uint256 x, bytes y, bytes pi)`:
    - Lookup operator’s challenge entry.
    - Call `verifyKzgOpening` on `MockKzgVerifier` (for now).
    - Mark `responded` and set `success`.
    - Emit `CustodyProofSubmitted`.

- [ ] 3.3 Implement `finalizePostFromCustody(postId)`:
  - Only callable after challenge deadline.
  - Count successful vs challenged operators.
  - Decide final post status:
    - If success fraction above threshold → `Available`.
    - Else → `Unavailable` or `Inconclusive`.
  - Update `EmeraldPostRegistry` status and emit `PostFinalized`.

- [ ] 3.4 Tests:
  - Scenario where all challenged operators respond successfully → post becomes `Available`.
  - Scenario where many fail / don’t respond → post becomes `Unavailable`.
  - Scenario where Phase 1 passed but `startCustodyChallenges` is never called (ensure it’s guarded correctly).

- [ ] 3.5 Commit with message like `feat: add custody challenge logic with mock KZG verifier`.

**Detailed spec:** `docs/STEP-3-CUSTODY-CHALLENGES.md`.

---

## Step 4 — Dummy data network & DA worker

Goal: Provide an off-chain worker that ties blobs, Relay attestation, and on-chain contracts together, plus a simple storage service.

- [ ] 4.1 Implement dummy data service:
  - Node + Express/Fastify.
  - `POST /blob` → stores blob in memory/disk; returns `cidHash`.
  - `GET /blob/:cidHash` → returns blob or 404.

- [ ] 4.2 Implement `emerald-da-worker`:
  - Watches `PostCreated` events.
  - For each new post:
    - Fetch blob from dummy data service using `cidHash`.
    - Verify `keccak256(blob) == cidHash`.
    - Decide whether to sign the DA message via Relay (for now, stub out Relay calls with a local function).
  - Watches custody challenge events:
    - If this worker corresponds to a challenged operator, compute dummy `(x, y, pi)` and call `submitCustodyProof`.

- [ ] 4.3 Tests (unit/integration):
  - Worker behaves honestly when blob exists and matches.
  - Worker acts “lazy” in tests (signs yes but fails custody) and ensure on-chain logic flags this as failure.

- [ ] 4.4 Commit with message like `feat: add dummy data network and Emerald DA worker`.

**Detailed spec:** `docs/STEP-4-WORKER-DATA-NETWORK.md`.

---

## Step 5 — Front-end demo UI

Goal: Build a simple UI that demonstrates posting and DA resolution, including failure scenarios.

- [ ] 5.1 Scaffold React app (Vite or Next):
  - Configure connection to local Emerald chain and dummy data service.

- [ ] 5.2 Implement:
  - Post composer:
    - Upload file → call `POST /blob` → get `cidHash`.
    - Call `createPost(cidHash, kzgCommitStub)` on-chain.
  - Thread view:
    - List posts and display:
      - `cidHash`, approximate image or placeholder.
      - Status (`Pending`, `Phase1Passed`, `Available`, `Unavailable`, `Inconclusive`).
    - Show DA details (e.g. yesStake, totalStake, challenged operators).

- [ ] 5.3 Add simple controls to simulate scenarios:
  - Button/setting to delete blob from storage before DA vote.
  - Button/setting to mark a worker as “lazy” (for tests, you can simulate this).

- [ ] 5.4 Commit with message like `feat: add Emerald DA demo UI`.

**Detailed spec:** `docs/STEP-5-FRONTEND.md`.

---

## Step 6 — Polish, docs, and demo script

- [ ] 6.1 Improve README:
  - Overview of architecture.
  - Step-by-step instructions to run:
    - Contracts (local chain).
    - Dummy data service.
    - DA worker.
    - Front-end.
  - Explain the two-phase DA mechanism and how custody challenges discourage lazy voting.

- [ ] 6.2 Add a short demo script:
  - Exact terminal commands and browser actions to:
    - Start everything.
    - Create a post that passes DA.
    - Create a post that fails Phase 1.
    - Create a post that passes Phase 1 but fails Phase 2 (custody).

- [ ] 6.3 Final clean-up:
  - Ensure tests pass.
  - Ensure `docs/PLAN.md` and all step specs are up to date.

- [ ] 6.4 Commit with message like `docs: finalize hackathon documentation`.

**Detailed spec:** `docs/STEP-6-POLISH-AND-DEMO.md`.
