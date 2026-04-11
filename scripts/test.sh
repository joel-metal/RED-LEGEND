#!/usr/bin/env bash
set -e

echo "Running RED-LEGEND tests..."
cargo test --manifest-path contracts/red_vault/Cargo.toml
echo "All tests passed."
