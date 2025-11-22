# Step 3 — Custody challenge logic (Phase 2, with mock KZG)

Status: Done

## Goal

After a Phase 1 pass, challenge yes-voters to respond with custody proofs (mocked KZG), and finalize post availability based on responses.

## Scope

- Challenge sampling and storage per post.
- Proof submission that calls the mock KZG verifier.
- Finalization that sets post status based on challenge outcomes.
- Tests covering success, failure, and guard conditions.

## Tasks

- Add custody challenge storage and functions to `EmeraldDaAdapter`:
  - `startCustodyChallenges(postId)`
  - `submitCustodyProof(postId, operator, x, y, pi)`
  - `finalizePostFromCustody(postId)`
- Enforce Phase 1 pass prerequisite and prevent duplicate challenge rounds.
- Wire in `MockKzgVerifier` to gate proof acceptance.
- Update tests to cover passing/failed custody and guard paths.

## Notes / decisions

- Use a simple yes-voter list as the challenge set for determinism in tests.
- Threshold: >=50% successful responses → `Available`, otherwise `Unavailable`.
- Add a short delay guard via `decidedAt` so tests can warp past the response window before finalization; finalization requires challenges to exist.

## Result

- Added custody challenge storage and lifecycle to `EmeraldDaAdapter` with start, proof submission (mocked KZG), and finalization.
- Integrated configurable Relay, verifier, and challenge response window guard.
- Finalization picks `Available` or `Unavailable` based on successful proofs vs challenges.
- Tests cover success/failure paths, guard rails (phase not passed, window not elapsed, unknown challenge).
