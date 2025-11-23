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
- `VERIFIER_ADDRESS` — (optional) alternate KZG verifier; defaults to mock/precompile choice on deploy
- `CONFIG_PATH` — (worker) pick config file, defaults to `configs/demo.worker.json`

## Demo walkthrough (manual UI)
Once the data service + frontend are running (worker optional unless you're wiring on-chain listeners), walk through:
1) Visit `http://localhost:5173` and note the active profile + data service URL pills at the top.
2) Upload a blob:
   - Pick any file, click **Upload to data service**. The UI hashes it (sha256) into `cidHash`, pushes the raw bytes to `POST /blob`, and shows a success hint with the returned hash.
   - A new card appears with the `cidHash`, a stubbed `kzgCommit` (derived from the hash), and the file name/size. You can `curl http://localhost:4000/blob/<cidHash>` to prove the blob is stored.
3) Phase 1 pass → custody success (happy path):
   - Click **Phase 1 pass** to mimic a Relay attestation; the badge turns green (`Phase1Passed`).
   - Click **Finalize: Available** to mimic custody proofs succeeding; badge shifts to `Available` (darker green).
4) Phase 1 failure:
   - On another post (or re-use the same one), click **Phase 1 fail** to represent insufficient yesStake. The badge turns orange and remains unfinalized.
5) Custody failure after a pass:
   - Click **Phase 1 pass**, then **Finalize: Unavailable** to simulate challenged operators missing/losing proofs. Badge turns red (`Unavailable`).
6) Repeat with multiple uploads; statuses are independent and persist in-memory while the tab is open (refresh clears them).

Contract-level tests already cover Phase 1 and custody logic with mocks; see `contracts/test/`.

## Profiles: demo vs prod (local)
- Frontend: set `VITE_PROFILE=demo|prod` (defaults to `demo`). `VITE_DATA_SERVICE_URL_PROD` can point prod builds to a different data endpoint.
- Worker: set `CONFIG_PATH=configs/demo.worker.json` (default) or `configs/prod.worker.json`. Env vars override values in the file.

## Docker (optional, local only)
Run the demo data service + worker in containers:
```bash
docker compose --profile demo up --build
```
This starts the data service on `localhost:4000` and a demo worker pointing at it (no chain listeners unless RPC/addresses are provided). Frontend still runs via `npm run dev:frontend` on the host.
