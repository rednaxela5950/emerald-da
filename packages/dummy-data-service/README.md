# Dummy Data Service

Simple in-memory blob store for development.

## Endpoints

- `POST /blob` — accepts `application/octet-stream` body, stores payload, returns `{ cidHash }` where cidHash is sha256.
- `GET /blob/:cidHash` — returns raw blob if present, otherwise 404.
- `GET /health` — liveness check.

## Running

```bash
npm run start --workspace=dummy-data-service
```

Use `PORT` to override the default `4000`.
