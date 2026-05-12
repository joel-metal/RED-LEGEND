#!/usr/bin/env bash
# extend-ttl.sh — Extend the contract instance TTL by calling extend_contract_ttl().
# Run monthly via cron: 0 0 1 * * /path/to/scripts/extend-ttl.sh
# Requires: stellar CLI, .env with CONTRACT_RED_VAULT and ADMIN_KEY set.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

if [[ -f "$ROOT/.env" ]]; then
  set -a; source "$ROOT/.env"; set +a
fi

NETWORK="${STELLAR_NETWORK:-testnet}"
CONTRACT_ID="${CONTRACT_RED_VAULT:?CONTRACT_RED_VAULT must be set in .env}"
ADMIN_KEY="${ADMIN_KEY:-deployer}"

echo "==> Extending contract TTL for $CONTRACT_ID on $NETWORK..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_KEY" \
  --network "$NETWORK" \
  -- extend_contract_ttl

echo "✅ TTL extended at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
