#!/usr/bin/env bash
# monitor.sh — Check all vaults for expiry within 72 hours and log/alert.
# Usage: ./scripts/monitor.sh [--webhook <url>]
# Requires: stellar CLI, jq, .env with CONTRACT_RED_VAULT set.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

if [[ -f "$ROOT/.env" ]]; then
  set -a; source "$ROOT/.env"; set +a
fi

NETWORK="${STELLAR_NETWORK:-testnet}"
CONTRACT_ID="${CONTRACT_RED_VAULT:?CONTRACT_RED_VAULT must be set in .env}"
ADMIN_KEY="${ADMIN_KEY:-deployer}"
WEBHOOK_URL="${WEBHOOK_URL:-}"
WARN_THRESHOLD=259200  # 72 hours in seconds

# Parse optional --webhook flag
while [[ $# -gt 0 ]]; do
  case "$1" in
    --webhook) WEBHOOK_URL="$2"; shift 2 ;;
    *) shift ;;
  esac
done

echo "==> Monitoring vaults on $NETWORK at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# Get total vault count
VAULT_COUNT=$(stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_KEY" \
  --network "$NETWORK" \
  -- vault_count 2>/dev/null | tr -d '"')

echo "    Total vaults: $VAULT_COUNT"

ALERTS=()

for ((i=1; i<=VAULT_COUNT; i++)); do
  # get_red_remaining returns None (null) if expired, or Some(seconds)
  REMAINING=$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$ADMIN_KEY" \
    --network "$NETWORK" \
    -- get_red_remaining \
    --vault_id "$i" 2>/dev/null | tr -d '"' || echo "null")

  if [[ "$REMAINING" == "null" ]]; then
    echo "  ⚠️  Vault #$i: EXPIRED"
    ALERTS+=("Vault #$i is EXPIRED and awaiting trigger_release")
  elif [[ "$REMAINING" =~ ^[0-9]+$ ]] && (( REMAINING < WARN_THRESHOLD )); then
    HOURS=$(( REMAINING / 3600 ))
    echo "  🔴 Vault #$i: expires in ${HOURS}h (${REMAINING}s)"
    ALERTS+=("Vault #$i expires in ${HOURS}h")
  else
    echo "  ✅ Vault #$i: OK (${REMAINING}s remaining)"
  fi
done

# Send webhook alert if any vaults are urgent
if [[ ${#ALERTS[@]} -gt 0 && -n "$WEBHOOK_URL" ]]; then
  PAYLOAD=$(printf '{"text":"RED-LEGEND Monitor Alert:\n%s"}' "$(printf '%s\n' "${ALERTS[@]}")")
  curl -s -X POST -H 'Content-type: application/json' --data "$PAYLOAD" "$WEBHOOK_URL"
  echo "==> Alert sent to webhook."
fi

echo "==> Done."
