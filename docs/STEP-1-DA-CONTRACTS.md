# Step 1 — DA data model & core contracts (Phase 1 shell)

Status: Done

## Goal

Define the on-chain primitives for posts, Phase 1 DA state, and events, with a mock KZG verifier and tests for the core flow between registry and adapter.

## Scope

- Post registry contract that creates posts and exposes restricted status updates for the DA adapter.
- DA adapter scaffold with Phase 1 state storage, events, and hooks into the registry.
- Mock KZG verifier contract stubbed for future custody proofs.
- Foundry tests covering post creation and DA-driven status transitions.

## Tasks

- Implement `EmeraldPostRegistry` with `createPost`, `getPost`, `setStatusFromDa`, events, and adapter access control.
- Implement `EmeraldDaAdapter` scaffold with Phase 1 state mapping, custody placeholders, events, and a function to record Phase 1 results and update the registry.
- Implement `MockKzgVerifier` with configurable verification output for testing.
- Add tests for post creation and adapter-triggered status changes.

## Notes / decisions

- Registry enforces adapter-only status updates; deployer can replace the adapter if needed.
- Phase 1 state keeps yesStake/totalStake/yesVoters and timestamp to unblock threshold logic later.
- Mock verifier defaults to `true` but can be flipped for negative test cases in later steps.

## Result

- Added `EmeraldPostRegistry` with post creation, adapter-restricted status updates, and adapter update hook.
- Added `EmeraldDaAdapter` scaffold with Phase 1 state storage, required events, and registry status propagation.
- Added `MockKzgVerifier` with configurable verification output.
- Wrote Foundry tests covering post creation, adapter access control, and Phase 1 state/status updates.
