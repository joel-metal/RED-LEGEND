#!/usr/bin/env bash
set -e

./scripts/build.sh

CONTRACT_ID=$(stellar contract deploy \
  --wasm "target/wasm32-unknown-unknown/release/red_vault.wasm" \
  --source "deployer" \
  --network "testnet")

echo "Deployed: $CONTRACT_ID"
