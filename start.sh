#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT/.anvil.pid"
LOG_FILE="$ROOT/.anvil.log"
HOST="${ANVIL_HOST:-0.0.0.0}"
PORT="${ANVIL_PORT:-8545}"
CHAIN_ID="${ANVIL_CHAIN_ID:-31337}"
TIMESTAMP="${ANVIL_TIMESTAMP:-$(date +%s)}"
BLOCK_TIME="${ANVIL_BLOCK_TIME:-}"
DEFAULT_DEV_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

ensure_node_modules() {
  local marker="$ROOT/node_modules/ethers/package.json"
  if [[ -f "$marker" ]]; then
    return
  fi
  echo "Installing Node dependencies (npm ci)..."
  (cd "$ROOT" && npm ci --include-workspace-root) >/dev/null
}

ensure_foundry_libs() {
  local forge_std_path="$ROOT/contracts/lib/forge-std/src/Test.sol"
  if [[ -f "$forge_std_path" ]]; then
    return
  fi
  echo "Installing forge-std (contracts/lib missing)..."
  (cd "$ROOT/contracts" && forge install foundry-rs/forge-std) >/dev/null
}

force_free_port_if_anvil() {
  if ! command -v lsof >/dev/null 2>&1; then
    return
  fi

  for _ in {1..5}; do
    local pids
    pids=$({ lsof -iTCP:"$PORT" -sTCP:LISTEN -Fp 2>/dev/null || true; } | sed -n 's/^p//p')
    if [[ -z "${pids:-}" ]]; then
      return
    fi
    local killed=false
    for pid in $pids; do
      local cmd
      cmd=$(ps -o comm= -p "$pid" 2>/dev/null || true)
      if [[ "$cmd" == *anvil* ]]; then
        echo "Killing leftover anvil on port $PORT (pid $pid)..."
        kill "$pid" >/dev/null 2>&1 || true
        sleep 0.2
        if kill -0 "$pid" >/dev/null 2>&1; then
          kill -9 "$pid" >/dev/null 2>&1 || true
        fi
        killed=true
      fi
    done
    if [[ "$killed" == true ]]; then
      sleep 0.2
      continue
    fi
    break
  done
}

ensure_port_free() {
  if ! command -v lsof >/dev/null 2>&1; then
    return
  fi
  local listeners
  listeners=$({ lsof -iTCP:"$PORT" -sTCP:LISTEN -Fp 2>/dev/null || true; } | sed -n 's/^p//p' | tr '\n' ' ' | xargs)
  if [[ -n "${listeners:-}" ]]; then
    echo "Port $PORT is already in use by pids: $listeners. Stop them or set ANVIL_PORT."
    exit 1
  fi
}

load_chain_env() {
  local chain_file="$ROOT/configs/local.chain.json"
  if [[ ! -f "$chain_file" ]]; then
    echo "Warning: $chain_file not found; frontend envs for registry/adapter will be empty"
    return
  fi

  # shellcheck disable=SC2016
  local json
  json=$(node -e 'const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));console.log(JSON.stringify(d));' "$chain_file")
  VITE_RPC_URL=${VITE_RPC_URL:-$(node -e "const d=$json;console.log(d.rpcUrl||'');")}
  VITE_REGISTRY_ADDRESS=${VITE_REGISTRY_ADDRESS:-$(node -e "const d=$json;console.log(d.registryAddress||'');")}
  VITE_ADAPTER_ADDRESS=${VITE_ADAPTER_ADDRESS:-$(node -e "const d=$json;console.log(d.adapterAddress||'');")}
  VITE_VERIFIER_ADDRESS=${VITE_VERIFIER_ADDRESS:-$(node -e "const d=$json;console.log(d.verifierAddress||'');")}
}

set_default_rpc_url() {
  local fallback="http://localhost:${PORT}"
  if [[ -z "${VITE_RPC_URL:-}" || "${VITE_RPC_URL}" == "http://host.docker.internal:${PORT}" ]]; then
    VITE_RPC_URL="$fallback"
  fi
}

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

  ensure_port_free
  local ts="$TIMESTAMP"
  local bt="$BLOCK_TIME"
  echo "Starting anvil on $HOST:$PORT (chainId=$CHAIN_ID, timestamp=$ts${bt:+, blockTime=$bt})..."
  local anvil_args=(--host "$HOST" --port "$PORT" --chain-id "$CHAIN_ID" --timestamp "$ts")
  if [[ -n "$bt" ]]; then
    anvil_args+=(--block-time "$bt")
  fi
  nohup anvil "${anvil_args[@]}" >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  sleep 0.2
  if ! kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
    echo "anvil failed to start; see $LOG_FILE"
    exit 1
  fi

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
  ensure_node_modules
  ensure_foundry_libs
  echo "Building contracts (forge build)..."
  forge build --root "$ROOT/contracts"

  echo "Deploying registry/adapter/verifier to local chain..."
  RPC_URL="${RPC_URL:-http://127.0.0.1:$PORT}" \
  CONFIG_RPC_URL="${CONFIG_RPC_URL:-http://host.docker.internal:$PORT}" \
  PRIVATE_KEY="${PRIVATE_KEY:-}" \
    npm run deploy:local-chain --silent
}

start_stack() {
  load_chain_env
  set_default_rpc_url
  echo "Starting docker compose stack with rebuild..."
  local ds_port="${DATA_SERVICE_PORT:-4400}"
  local fe_port="${FRONTEND_PORT:-5174}"
  export DATA_SERVICE_PORT="$ds_port"
  export FRONTEND_PORT="$fe_port"
  if [[ -z "${VITE_DATA_SERVICE_URL:-}" ]]; then
    export VITE_DATA_SERVICE_URL="http://localhost:${ds_port}"
  fi
  export VITE_RPC_URL="${VITE_RPC_URL:-}"
  export VITE_REGISTRY_ADDRESS="${VITE_REGISTRY_ADDRESS:-}"
  export VITE_ADAPTER_ADDRESS="${VITE_ADAPTER_ADDRESS:-}"
  export VITE_VERIFIER_ADDRESS="${VITE_VERIFIER_ADDRESS:-}"
  export VITE_DEV_PRIVATE_KEY="${VITE_DEV_PRIVATE_KEY:-$DEFAULT_DEV_PRIVATE_KEY}"
  docker compose up --build -d
}

main() {
  cd "$ROOT"
  if [[ -x "$ROOT/stop.sh" ]]; then
    echo "Stopping existing stack (stop.sh)..."
    "$ROOT/stop.sh" || true
  fi
  force_free_port_if_anvil
  start_anvil
  deploy_contracts
  start_stack
  echo "Done. anvil pid: $(cat "$PID_FILE"), logs: $LOG_FILE"
}

main "$@"
