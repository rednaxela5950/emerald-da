#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT/.anvil.pid"
LOG_FILE="$ROOT/.anvil.log"
HOST="${ANVIL_HOST:-0.0.0.0}"
PORT="${ANVIL_PORT:-8545}"
CHAIN_ID="${ANVIL_CHAIN_ID:-31337}"

start_anvil() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE" || true)
    if [[ -n "${pid:-}" && -d "/proc/$pid" ]]; then
      echo "anvil already running (pid $pid); skip start"
      return
    fi
    rm -f "$PID_FILE"
  fi

  echo "Starting anvil on $HOST:$PORT (chainId=$CHAIN_ID)..."
  nohup anvil --host "$HOST" --port "$PORT" --chain-id "$CHAIN_ID" >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"

  echo -n "Waiting for anvil RPC"
  for _ in {1..50}; do
    if curl -sf -X POST \
      -H "content-type: application/json" \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
      "http://127.0.0.1:$PORT" >/dev/null; then
      echo " ready"
      return
    fi
    echo -n "."
    sleep 0.1
  done
  echo
  echo "anvil did not become ready; check $LOG_FILE"
  exit 1
}

deploy_contracts() {
  echo "Building contracts (forge build)..."
  forge build --root "$ROOT/contracts"

  echo "Deploying registry/adapter/verifier to local chain..."
  RPC_URL="${RPC_URL:-http://127.0.0.1:$PORT}" \
  CONFIG_RPC_URL="${CONFIG_RPC_URL:-http://host.docker.internal:$PORT}" \
  PRIVATE_KEY="${PRIVATE_KEY:-}" \
    npm run deploy:local-chain --silent
}

start_stack() {
  echo "Starting docker compose stack with rebuild..."
  docker compose up --build -d
}

main() {
  cd "$ROOT"
  if [[ -x "$ROOT/stop.sh" ]]; then
    echo "Stopping existing stack (stop.sh)..."
    "$ROOT/stop.sh" || true
  fi
  start_anvil
  deploy_contracts
  start_stack
  echo "Done. anvil pid: $(cat "$PID_FILE"), logs: $LOG_FILE"
}

main "$@"
