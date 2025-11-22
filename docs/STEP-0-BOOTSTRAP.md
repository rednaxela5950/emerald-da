# Step 0 — Repo bootstrap & environment

Status: In progress

## Goal

Set up the monorepo layout, baseline tooling, and initial documentation so later steps can focus on contracts, worker, and UI implementation.

## Scope

- Define directory structure for contracts, worker, frontend, and docs.
- Initialize Foundry for Solidity development.
- Set up Node + TypeScript workspace scaffolding for the worker and frontend.
- Provide a starter README with how to run tests.

## Tasks

- Create `/contracts` using Foundry, with default `src/` and `test/` layout.
- Create `/packages/emerald-da-worker` as a TypeScript package (build + start scripts, minimal entrypoint).
- Create `/apps/frontend` placeholder package to be filled in later steps.
- Add root-level workspace configuration (`package.json`, `tsconfig.base.json`, `.gitignore`).
- Add initial `README.md` describing the project and how to run tests.

## Decisions & notes

- Use `npm` workspaces for the monorepo; TypeScript is installed at the root for reuse.
- Keep the frontend unopinionated at this step; framework selection happens in Step 5.
- Foundry is the chosen Solidity toolchain; default scaffold kept to unblock early testing.
