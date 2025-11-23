# Step 2 — Symbiotic Relay Phase 1 integration

Status: Done

## Goal

Accept a Relay-provided DA attestation for a post, validate inputs, apply a simple threshold rule, and update on-chain Phase 1 state plus post status.

## Scope

- Trusted Relay entrypoint on the DA adapter that validates post data and stake inputs.
- Threshold check for yesStake vs totalStake (mocked majority rule).
- Events for pass/fail reuse from Step 1.
- Tests for success, insufficient stake (fail), and mismatched post data (revert).

## Tasks

- Add Relay authorization control on the adapter (configurable by owner).
- Implement `handleDaAttestation` that checks cidHash/kzgCommit, stake sanity, threshold, and stores Phase 1 state.
- Keep existing manual `recordPhase1Result` for owner-driven updates (tests/admin), backed by shared internal logic.
- Extend tests to cover valid and invalid attestations per scope.

## Notes / decisions

- Threshold implemented as 50% yesStake (>= 5000 bps of totalStake).
- cidHash/kzgCommit mismatches revert; insufficient yesStake records a failed Phase 1 but still stores state.
- Relay defaults to deployer; owner can change it for tests or mocks.

## Result

- Added Relay authorization with configurable `relay` on the DA adapter.
- Implemented `handleDaAttestation` validating post data, stake sanity, and threshold before storing Phase 1 state and updating the registry.
- Shared internal recording logic used by both Relay and owner pathways.
- Added tests for passing attestation, insufficient yesStake (fail), mismatched data (revert), and relay-only enforcement.
- Off-chain worker now calls the Symbiotic Relay SDK (gRPC) to request a DA attestation signature and logs the resulting request/aggregation proof when configured.
