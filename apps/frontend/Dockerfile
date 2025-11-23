FROM node:20-slim AS base
WORKDIR /app

# Install workspace deps
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/dummy-data-service/package.json packages/dummy-data-service/package.json
COPY packages/emerald-da-worker/package.json packages/emerald-da-worker/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN npm ci --include-workspace-root --ignore-scripts

# Build + serve static preview
COPY . .
ARG VITE_DATA_SERVICE_URL="http://localhost:4000"
ARG VITE_PROFILE="demo"
ENV VITE_DATA_SERVICE_URL=$VITE_DATA_SERVICE_URL
ENV VITE_PROFILE=$VITE_PROFILE
ARG VITE_RELAY_ENDPOINT="http://host.docker.internal:8080"
ARG VITE_RELAY_KEY_TAG="1"
ARG VITE_RELAY_REQUIRED_EPOCH=""
ARG VITE_RPC_URL="http://host.docker.internal:8545"
ARG VITE_REGISTRY_ADDRESS=""
ARG VITE_ADAPTER_ADDRESS=""
ARG VITE_VERIFIER_ADDRESS=""
ARG VITE_DEV_PRIVATE_KEY=""
ENV VITE_RELAY_ENDPOINT=$VITE_RELAY_ENDPOINT
ENV VITE_RELAY_KEY_TAG=$VITE_RELAY_KEY_TAG
ENV VITE_RELAY_REQUIRED_EPOCH=$VITE_RELAY_REQUIRED_EPOCH
ENV VITE_RPC_URL=$VITE_RPC_URL
ENV VITE_REGISTRY_ADDRESS=$VITE_REGISTRY_ADDRESS
ENV VITE_ADAPTER_ADDRESS=$VITE_ADAPTER_ADDRESS
ENV VITE_VERIFIER_ADDRESS=$VITE_VERIFIER_ADDRESS
ENV VITE_DEV_PRIVATE_KEY=$VITE_DEV_PRIVATE_KEY
RUN npm run build --workspace=emerald-da-frontend

EXPOSE 5173
CMD ["npm", "--workspace=emerald-da-frontend", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
