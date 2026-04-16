#!/usr/bin/env bash
# End-to-end build for fiscal_mexico addon.
#   1. backend WASM (TinyGo) → backend/backend.wasm
#   2. frontend federation remote → frontend/dist/
#   3. metacore build --strict → pack tar.gz and pass all 5 gates
set -euo pipefail
cd "$(dirname "$0")"

# --- 1. Backend WASM --------------------------------------------------------
RUNTIME="$(python3 -c 'import json,sys; print(json.load(open("manifest.json")).get("backend",{}).get("runtime",""))' 2>/dev/null || echo "")"
if [ "$RUNTIME" = "wasm" ]; then
  if ! command -v tinygo >/dev/null 2>&1; then
    echo "tinygo not found — required to build manifest.backend.runtime=wasm. Install from https://tinygo.org/getting-started/" >&2
    exit 1
  fi
  # Prefer the dedicated metacore wrapper when available — it applies the
  # addon-specific flags (memory limits, export list, …).
  if command -v metacore >/dev/null 2>&1 && metacore compile-wasm --help >/dev/null 2>&1; then
    metacore compile-wasm ./backend -o ./backend/backend.wasm
  else
    (cd backend && tinygo build -target=wasi -opt=z -no-debug -o backend.wasm .)
  fi
  ls -lh backend/backend.wasm
fi

# --- 2. Frontend -----------------------------------------------------------
if [ -d frontend ] && [ -f frontend/package.json ]; then
  (cd frontend && pnpm install --prefer-offline && pnpm build) || \
    echo "WARN: frontend build failed — bundle will be emitted without remoteEntry.js" >&2
fi

# --- 3. metacore build -----------------------------------------------------
if ! command -v metacore >/dev/null 2>&1; then
  echo "metacore CLI not found. Build it: go build -o metacore ./cli/ (from metacore repo root)" >&2
  exit 1
fi

if [ -n "${METACORE_DEV_KEY:-}" ]; then
  metacore build --target wasm --strict --sign "$METACORE_DEV_KEY" .
else
  metacore build --target wasm --strict .
fi

ls -lh ./fiscal_mexico-*.tar.gz* 2>/dev/null || true
