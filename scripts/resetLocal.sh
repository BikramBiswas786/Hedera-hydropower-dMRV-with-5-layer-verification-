#!/usr/bin/env bash
# Undo a local `yarn deploy --network localhost` so tests and the committed testnet addresses
# are the source of truth again. Does not touch HCS topics or live keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ restoring committed deployedContracts.ts"
node scripts/restoreDeployedContracts.mjs

if [[ -d packages/hardhat/deployments/localhost ]]; then
  echo "→ removing packages/hardhat/deployments/localhost"
  rm -rf packages/hardhat/deployments/localhost
fi
if [[ -d packages/hardhat/deployments/hardhat ]]; then
  echo "→ removing packages/hardhat/deployments/hardhat"
  rm -rf packages/hardhat/deployments/hardhat
fi

echo "Local deploy state cleared. yarn test and yarn start (without a local deploy) use the committed testnet addresses."
