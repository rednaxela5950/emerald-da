#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT/.anvil.pid"

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

main() {
  cd "$ROOT"
  stop_compose
  stop_anvil
  echo "Stopped."
}

main "$@"
