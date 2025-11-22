# Step 6 — Polish, docs, and demo script

Status: Done

## Goal

Document the current system, how to run each component, and provide a concrete demo script that exercises success and failure paths.

## Scope

- Improve README with architecture overview and run instructions for contracts, data service, worker, and frontend.
- Write a concise demo script covering Phase 1 pass/fail and custody failure using the existing mocks.
- Ensure references to plan/steps are up to date.

## Tasks

- Update README with:
  - Architecture overview (contracts, data service, worker, frontend).
  - Prerequisites and quickstart commands.
  - Notes on optional on-chain listener env vars.
- Add demo script (commands + expected observations) for three scenarios: DA pass, Phase 1 fail, Phase 2 fail.
- Finalize step status and run tests.

## Notes / decisions

- Demo uses the dummy data service + frontend to simulate post states (since full Relay is stubbed).
- Keep instructions minimal and terminal-friendly.

## Result

- README updated with architecture overview, quickstart, optional on-chain listener env vars, and demo steps.
- Demo script added (upload blob → simulate Phase 1 pass/fail and custody availability via UI) plus service run instructions.
- Tests re-run (`npm run test:contracts`) to confirm contracts unchanged.
