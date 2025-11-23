FROM node:20-slim AS base
WORKDIR /app

# Install workspace deps
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/emerald-da-worker/package.json packages/emerald-da-worker/package.json
COPY packages/dummy-data-service/package.json packages/dummy-data-service/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm ci --include-workspace-root --ignore-scripts

# Build the worker
COPY . .
RUN npm run build --workspace=emerald-da-worker

CMD ["node", "packages/emerald-da-worker/dist/index.js"]
