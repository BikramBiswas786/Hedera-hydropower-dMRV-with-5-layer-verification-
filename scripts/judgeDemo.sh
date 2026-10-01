#!/usr/bin/env bash
# One-command local demo for a judge or first-time reviewer (~90s on a warm machine once deps are installed).
# Starts an offline Hardhat node, deploys the demo batch, hits the core HTTP routes, then restores committed
# contract metadata so a following `yarn test` is not poisoned by chain 31337.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -n "${JUDGE_DEMO_PORT:-}" ]]; then
  PORT="$JUDGE_DEMO_PORT"
else
  PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"
fi
DIST_DIR=".next-judge-${PORT}"
CHAIN_LOG="${TMPDIR:-/tmp}/hydro-judge-chain.log"
APP_LOG="${TMPDIR:-/tmp}/hydro-judge-app.log"
CONFIG_BACKUP="$(mktemp -d "${TMPDIR:-/tmp}/hydro-judge-config.XXXXXX")"
cp packages/nextjs/tsconfig.json "$CONFIG_BACKUP/tsconfig.json"
cp packages/nextjs/next-env.d.ts "$CONFIG_BACKUP/next-env.d.ts"
cleanup() {
  if [[ -n "${CHAIN_PID:-}" ]] && kill -0 "$CHAIN_PID" 2>/dev/null; then kill -TERM -- "-$CHAIN_PID" 2>/dev/null || kill "$CHAIN_PID" 2>/dev/null || true; fi
  if [[ -n "${APP_PID:-}" ]] && kill -0 "$APP_PID" 2>/dev/null; then kill -TERM -- "-$APP_PID" 2>/dev/null || kill "$APP_PID" 2>/dev/null || true; fi
  rm -rf "packages/nextjs/${DIST_DIR}"
  cp "$CONFIG_BACKUP/tsconfig.json" packages/nextjs/tsconfig.json
  cp "$CONFIG_BACKUP/next-env.d.ts" packages/nextjs/next-env.d.ts
  rm -rf "$CONFIG_BACKUP"
  node scripts/restoreDeployedContracts.mjs >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== Hydro dMRV judge demo =="
echo "1. Reset any previous local deploy metadata"
bash scripts/resetLocal.sh

echo "2. Offline chain"
setsid yarn chain:offline >"$CHAIN_LOG" 2>&1 &
CHAIN_PID=$!
for i in $(seq 1 60); do
  if grep -q "Started HTTP and WebSocket JSON-RPC server" "$CHAIN_LOG" 2>/dev/null; then break; fi
  sleep 1
done
if ! kill -0 "$CHAIN_PID" 2>/dev/null; then
  echo "Chain failed to start; see $CHAIN_LOG" >&2
  exit 1
fi

echo "3. Deploy demo plants, one verified batch, one listing"
yarn deploy --network localhost
echo "4. App"
NEXT_DIST_DIR="$DIST_DIR" yarn next:build >"$APP_LOG" 2>&1
setsid env NEXT_DIST_DIR="$DIST_DIR" PORT="$PORT" yarn next:serve >>"$APP_LOG" 2>&1 &
APP_PID=$!
for i in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${PORT}/api/mrv/scenarios" >/dev/null 2>&1; then break; fi
  sleep 1
done

fail=0
for path in / /verify /methodology /market /audit /plants /portfolio /api/openapi.json /api/mrv/scenarios /llms.txt; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}${path}" || true)
  if [[ "$code" == "200" ]]; then
    echo "  OK  $code  $path"
  else
    echo "  FAIL $code  $path"
    fail=1
  fi
done
code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/certificate/abc" || true)
if [[ "$code" == "404" ]]; then
  echo "  OK  $code  /certificate/abc (expected 404)"
else
  echo "  FAIL $code  /certificate/abc (expected 404)"
  fail=1
fi

echo "5. Restore committed deployedContracts.ts (so yarn test stays green)"
node scripts/restoreDeployedContracts.mjs

if [[ "$fail" -ne 0 ]]; then
  echo "Judge demo reported route failures. App log: $APP_LOG" >&2
  exit 1
fi
echo "Judge demo passed. Browse http://127.0.0.1:${PORT} while this process is still running, or Ctrl-C to stop."
if [[ "${JUDGE_DEMO_KEEP:-0}" == "1" ]]; then
  wait "$APP_PID"
fi
