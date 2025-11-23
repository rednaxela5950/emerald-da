#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT/.anvil.pid"
PORT="${ANVIL_PORT:-8545}"
DS_PORT="${DATA_SERVICE_PORT:-4400}"
FE_PORT="${FRONTEND_PORT:-5174}"

stop_compose() {
  echo "Stopping docker compose stack..."
  docker compose down --remove-orphans
}

stop_anvil() {
  if [[ ! -f "$PID_FILE" ]]; then
    echo "No anvil pid file found; skipping anvil stop"
    return
  fi

  local pid
  pid=$(cat "$PID_FILE" || true)
  if [[ -z "${pid:-}" ]]; then
    echo "anvil pid file empty; skipping kill"
    rm -f "$PID_FILE"
    return
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    echo "Stopping anvil (pid $pid)..."
    kill "$pid" >/dev/null 2>&1 || true
    sleep 0.5
    if kill -0 "$pid" >/dev/null 2>&1; then
      echo "anvil still running, forcing kill..."
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  else
    echo "No running anvil process for pid $pid"
  fi

  rm -f "$PID_FILE"
}

kill_anvil_on_port() {
  if ! command -v lsof >/dev/null 2>&1; then
    return
  fi

  local pids
  pids=$({ lsof -iTCP:"$PORT" -sTCP:LISTEN -Fp 2>/dev/null || true; } | sed -n 's/^p//p')
  for pid in $pids; do
    if [[ -z "$pid" ]]; then
      continue
    fi
    local cmd
    cmd=$(ps -o comm= -p "$pid" 2>/dev/null || true)
    if [[ "$cmd" == *anvil* ]]; then
      echo "Stopping anvil on port $PORT (pid $pid)..."
      kill "$pid" >/dev/null 2>&1 || true
      sleep 0.3
      if kill -0 "$pid" >/dev/null 2>&1; then
        kill -9 "$pid" >/dev/null 2>&1 || true
      fi
    fi
  done
}

kill_listeners_on_ports() {
  if ! command -v lsof >/dev/null 2>&1; then
    return
  fi

  # Deduplicate ports while preserving order
  local ports=("$PORT" "$DS_PORT" "$FE_PORT")
  local seen=""
  for port in "${ports[@]}"; do
    if [[ -z "$port" ]]; then
      continue
    fi
    if [[ " $seen " == *" $port "* ]]; then
      continue
    fi
    seen+=" $port"
    local pids
    pids=$({ lsof -iTCP:"$port" -sTCP:LISTEN -Fp 2>/dev/null || true; } | sed -n 's/^p//p')
    for pid in $pids; do
      if [[ -z "$pid" ]]; then
        continue
      fi
      local cmd user
      cmd=$(ps -o comm= -p "$pid" 2>/dev/null || true)
      user=$(ps -o user= -p "$pid" 2>/dev/null || true)
      echo "Killing listener on port $port (pid $pid${cmd:+, cmd=$cmd}${user:+, user=$user})..."
      kill "$pid" >/dev/null 2>&1 || true
      sleep 0.2
      if kill -0 "$pid" >/dev/null 2>&1; then
        kill -9 "$pid" >/dev/null 2>&1 || true
      fi
    done
  done
}

main() {
  cd "$ROOT"
  stop_compose
  stop_anvil
  kill_anvil_on_port
  kill_listeners_on_ports
  echo "Stopped."
}

main "$@"
