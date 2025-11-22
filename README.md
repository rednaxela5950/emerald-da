# Emerald + Symbiotic Relay

Monorepo exploring a two-phase data availability flow on Emerald: Phase 1 attestation via Symbiotic Relay, followed by a custody challenge (mock KZG) to discourage lazy voters.

## Components
- `contracts/` — Foundry contracts: post registry, DA adapter, mock KZG verifier, and tests.
- `packages/dummy-data-service/` — Express in-memory blob store (sha256-based `cidHash`).
- `packages/emerald-da-worker/` — Worker scaffold to fetch blobs, verify hashes, and listen for on-chain events (optional).
- `apps/frontend/` — Vite + React UI to upload blobs to the data service and simulate post status transitions.
- `docs/` — Plan and step specs.

## Prerequisites
- Node 18+ and npm
- Foundry (`forge`) on PATH

## Install and build
```bash
npm install
forge install --root contracts   # once
npm run build:worker
npm run build:data-service
npm run build:frontend
```

Run tests:
```bash
npm run test:contracts
```

## Run the stack locally
In separate terminals:
```bash
# 1) Dummy data service (default http://localhost:4000)
npm run start:data-service

# 2) Worker scaffold (fetch/verify blobs; optional chain listener)
DATA_SERVICE_URL=http://localhost:4000 npm run start:worker

# 3) Frontend (default http://localhost:5173)
VITE_DATA_SERVICE_URL=http://localhost:4000 npm run dev:frontend
```

Optional on-chain listeners for the worker (no-op unless set):
- `RPC_URL` — JSON-RPC endpoint
- `PRIVATE_KEY` — wallet for custody proofs
- `REGISTRY_ADDRESS` — EmeraldPostRegistry address
- `ADAPTER_ADDRESS` — EmeraldDaAdapter address

## Demo script (manual)
1) Start data service and frontend as above. (Worker optional.)
2) In the UI, upload a file → see returned `cidHash` and placeholder `kzgCommit`.
3) Simulate outcomes via the buttons on each post:
   - Phase 1 pass/fail (Relay attestation analogue).
   - Finalize as `Available` or `Unavailable` (custody success/failure analogue).
4) Observe badge colors change; blob hash matches the data service (`sha256` placeholder).

Contract-level tests already cover Phase 1 and custody logic with mocks; see `contracts/test/`.
