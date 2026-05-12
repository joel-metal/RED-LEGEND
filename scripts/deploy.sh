#!/usr/bin/env bash
# deploy.sh — Build, deploy, and initialize the red_vault contract on Stellar testnet.
# Usage: ./scripts/deploy.sh
# Requires: stellar CLI, .env file with ADMIN_KEY and XLM_TOKEN_ADDRESS set.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

# Load env
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT/.env"; set +a
fi

NETWORK="${STELLAR_NETWORK:-testnet}"
ADMIN_KEY="${ADMIN_KEY:-deployer}"
XLM_TOKEN="${XLM_TOKEN_ADDRESS:-CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC}"
MIN_INTERVAL="${MIN_INTERVAL:-86400}"    # 1 day
MAX_INTERVAL="${MAX_INTERVAL:-31536000}" # 1 year

echo "==> Building contract..."
stellar contract build --manifest-path "$ROOT/contracts/red_vault/Cargo.toml"

WASM="$ROOT/target/wasm32-unknown-unknown/release/red_vault.wasm"

echo "==> Deploying to $NETWORK..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM" \
  --source "$ADMIN_KEY" \
  --network "$NETWORK" \
  2>&1 | tail -1)

echo "    Contract ID: $CONTRACT_ID"

ADMIN_ADDRESS=$(stellar keys address "$ADMIN_KEY")

echo "==> Initializing contract..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_KEY" \
  --network "$NETWORK" \
  -- initialize \
  --xlm_token "$XLM_TOKEN" \
  --admin "$ADMIN_ADDRESS"

echo "==> Setting interval bounds..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_KEY" \
  --network "$NETWORK" \
  -- set_min_check_in_interval \
  --min_interval "$MIN_INTERVAL"

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_KEY" \
  --network "$NETWORK" \
  -- set_max_check_in_interval \
  --max_interval "$MAX_INTERVAL"

# Persist CONTRACT_ID to .env
if grep -q "^CONTRACT_RED_VAULT=" "$ROOT/.env" 2>/dev/null; then
  sed -i "s|^CONTRACT_RED_VAULT=.*|CONTRACT_RED_VAULT=$CONTRACT_ID|" "$ROOT/.env"
else
  echo "CONTRACT_RED_VAULT=$CONTRACT_ID" >> "$ROOT/.env"
fi

# Also write to frontend .env
if [[ -f "$ROOT/frontend/.env" ]]; then
  if grep -q "^VITE_CONTRACT_ID=" "$ROOT/frontend/.env" 2>/dev/null; then
    sed -i "s|^VITE_CONTRACT_ID=.*|VITE_CONTRACT_ID=$CONTRACT_ID|" "$ROOT/frontend/.env"
  else
    echo "VITE_CONTRACT_ID=$CONTRACT_ID" >> "$ROOT/frontend/.env"
  fi
fi

echo ""
echo "✅ Deployment complete."
echo "   CONTRACT_ID=$CONTRACT_ID"
echo "   Saved to .env and frontend/.env"
