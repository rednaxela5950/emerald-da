# Emerald DA Frontend

Vite + React demo UI to upload blobs to the dummy data service, compute a cidHash, and simulate Emerald post status changes.

## Scripts

```bash
npm run dev --workspace=emerald-da-frontend   # start dev server (default http://localhost:5173)
npm run build --workspace=emerald-da-frontend # production build
npm run preview --workspace=emerald-da-frontend
```

Set `VITE_DATA_SERVICE_URL` to point at the dummy data service (defaults to `http://localhost:4000`).
