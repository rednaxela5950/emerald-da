# Step 4 — Dummy data network & DA worker

Status: Done

## Goal

Provide a minimal data service for blobs and scaffold the DA worker to fetch and verify blobs in preparation for on-chain integration.

## Scope

- Dummy HTTP data service for storing/fetching blobs by a hash.
- Worker scaffold that can fetch blobs, verify content hash, and stub event handling.
- Scripts to run/build these components.

## Tasks

- Add a `dummy-data-service` package with Express server exposing:
  - `POST /blob` to store raw payload and return its hash (placeholder cidHash).
  - `GET /blob/:cidHash` to return stored payload or 404.
- Extend worker scaffold to fetch from the data service and verify hash equality.
- Add npm scripts for starting/building the data service and worker.

## Notes / decisions

- Use in-memory storage for simplicity; sha256 used as a placeholder content hash for now.
- Keep worker logic modular to plug chain listeners later.

## Result

- Added `packages/dummy-data-service` (Express) with POST/GET blob endpoints and health check, using in-memory storage and sha256 hash IDs.
- Extended worker scaffold with blob fetch + hash verification helpers and config for `DATA_SERVICE_URL`.
- Added npm scripts to build/start data service and worker; builds pass.
