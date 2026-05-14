#!/usr/bin/env bash
# Build the {{ADDON_KEY}} addon WASM backend.
#
# Requires tinygo (https://tinygo.org). Flags mirror the kernel's recommended
# defaults for WASM addons (see kernel docs/wasm-abi.md §5).
set -euo pipefail

cd "$(dirname "$0")"

tinygo build \
  -target=wasi \
  -opt=z \
  -no-debug \
  -o backend.wasm \
  ./

echo "✓ backend.wasm built ($(wc -c < backend.wasm) bytes)"
