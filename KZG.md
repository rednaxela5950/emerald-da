# KZG Integration Plan

Goal: replace the mock KZG verifier with a real implementation and wire custody proofs end-to-end. Current code allows swapping verifiers (mock vs. precompile/external) via the adapter.

## Objectives
- Integrate a production-ready KZG verifier contract (trusted setup + pairing checks).
- Define on-chain proof shape (commitment, evaluation point x, value y, proof pi) and ABI for submission.
- Update custody flow to validate proofs on-chain and reflect success/failure in post finalization.
- Provide tooling/tests to generate and verify proofs against stored blobs or commitments.

## Workplan

1) **Verifier selection**
   - Evaluate existing audited KZG verifier libraries for Solidity (e.g., Ethereum’s EIP-4844 reference, EigenLayer KZG implementations).
   - Decide on curve/library (likely BLS12-381 with BN254 precompiles if available; otherwise custom pairing library).
   - Confirm trusted setup parameters and CRS distribution; document verification gas costs.

2) **Contract integration**
   - Replace `MockKzgVerifier` with the chosen verifier contract or linkable library. (Done: adapter now depends on `IKzgVerifier` with swappable implementations.)
   - Update `EmeraldDaAdapter` to store commitments in a format compatible with the verifier (likely `[2]uint256` or G1/G2 points). (Pending: currently `bytes32`; adapt when real commitments are used.)
   - Define `submitCustodyProof(bytes32 postId, uint256 x, bytes y, bytes pi)` calldata shape to match verifier expectations (may split into uint256 arrays for affine coords). (Pending final shape for real verifier.)
   - Add revert paths for malformed proofs and mismatched commitment lengths. (Pending real verifier semantics.)

3) **Custody flow updates**
   - Derive challenge points deterministically (e.g., hash of `postId` + operator) mapped into the field for x.
   - Require proof verification inside `submitCustodyProof`; mark `success=true` only if verification passes.
   - Consider timeouts/slashing: optionally extend adapter to emit “missed” events if no proof by deadline.

4) **Off-chain tooling**
   - Add a small CLI/tool (Node or Rust) to generate KZG proofs:
     - Compute polynomial from blob, commitment, and evaluation point.
     - Produce `(y, pi)` matching the on-chain verifier format.
   - Provide fixtures for tests: sample blob, commitment, and valid/invalid proofs.

5) **Testing**
   - On-chain Foundry tests:
     - Valid proof → custody success → post `Available`.
     - Invalid proof or malformed calldata → custody failure → post `Unavailable`.
     - Missing proof before deadline → treated as failure.
   - Off-chain integration test that generates proofs and submits via a local Anvil instance.

6) **Security & operations**
   - Document trusted setup assumptions and how operators obtain/verify the CRS.
   - Add gas benchmarking for verification to ensure feasibility within challenge flow.
   - Consider circuit/semaphore if batching or aggregation is needed (out of scope for first pass).

## Current status
- `IKzgVerifier` interface added; `EmeraldDaAdapter` can switch verifier via `setVerifier`.
- `MockKzgVerifier` implements the interface for local/testing.
- `PrecompileKzgVerifier` added to forward to a chain-specific verifier/precompile (defaults to EIP-4844 address 0x0A).
- Commitment storage still `bytes32`; update to G1 bytes when moving to a concrete implementation.

## Dependencies / open questions
- Availability of a battle-tested KZG verifier for the target chain (Emerald) and its precompile support.
- Size and format of commitments stored in `EmeraldPostRegistry` (bytes32 vs structured points).
- Choice of hash-to-field for challenge indices; ensure compatibility with proof generation tooling.
