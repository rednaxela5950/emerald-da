# Step 5 — Front-end demo UI

Status: Done

## Goal

Build a demo UI that lets users upload blobs to the dummy data service, compute a cidHash, and preview on-chain status placeholders for Emerald posts.

## Scope

- Scaffold React + Vite app under `apps/frontend` (TypeScript).
- Compose UI with blob upload → hash → POST to data service; display returned cidHash.
- Local post list with status badges and controls to simulate Phase 1/2 outcomes.
- Configurable data service URL via environment.

## Tasks

- Replace placeholder frontend with Vite React app and opinionated styling.
- Implement blob hashing + upload flow and in-memory post registry on the client.
- Add status badges and simulated actions (Phase1 pass/fail, finalize availability) for demo.
- Document how to run the frontend alongside the dummy data service.

## Notes / decisions

- Use sha256 as cidHash placeholder to stay consistent with the dummy data service.
- Provide light, opinionated styling with custom font and color tokens; no dark-mode bias.
- Keep chain interactions stubbed; wiring to contracts can be added later.

## Result

- Replaced placeholder with Vite + React app under `apps/frontend` featuring blob upload, cidHash hashing, and simulated post status controls.
- Styling uses Space Grotesk, gradients, and badge colors to clarify status state.
- Configurable via `VITE_DATA_SERVICE_URL`; defaults to `http://localhost:4000` to pair with the dummy data service.
- Scripts added to build/dev the frontend via npm workspaces.
