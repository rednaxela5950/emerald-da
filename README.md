# Emerald + Symbiotic Relay

Monorepo for experimenting with a two-phase data availability workflow on Emerald, backed by Symbiotic Relay attestations and a custody challenge step.

## Structure
- `contracts/` — Foundry project for on-chain contracts and tests.
- `packages/emerald-da-worker/` — Node/TypeScript worker that will watch chain events and interact with storage (scaffolded).
- `apps/frontend/` — Placeholder for the demo UI to be built in later steps.
- `docs/` — Plan and step-by-step specs.

## Getting started
Prerequisites: Node 18+, npm, and Foundry installed (`forge` available on PATH).

Install dependencies and build the worker scaffold:

```bash
npm install
npm run build:worker
```

Install Foundry dependencies (once):

```bash
forge install --root contracts
```

Run Foundry tests:

```bash
npm run test:contracts
```

Run the dummy data service:

```bash
npm run start:data-service
```

Run the worker scaffold (expects `DATA_SERVICE_URL`, defaults to `http://localhost:4000`):

```bash
npm run start:worker
```

A fuller setup (UI, worker wiring, and Relay integration) will be added in later steps of the plan.
