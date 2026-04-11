#!/usr/bin/env bash
set -e

echo "Building RED-LEGEND contracts..."
cargo build --target wasm32-unknown-unknown --release --manifest-path contracts/red_vault/Cargo.toml
echo "Build complete."
