#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

RUNTIME="$(python3 -c 'import json; print(json.load(open("manifest.json")).get("backend",{}).get("runtime",""))' 2>/dev/null || echo "")"
if [ "$RUNTIME" = "wasm" ]; then
  if ! command -v tinygo >/dev/null 2>&1; then
    echo "tinygo not found — required for manifest.backend.runtime=wasm." >&2
    exit 1
  fi
  if command -v metacore >/dev/null 2>&1 && metacore compile-wasm --help >/dev/null 2>&1; then
    metacore compile-wasm ./backend -o ./backend/backend.wasm
  else
    (cd backend && tinygo build -target=wasi -opt=z -no-debug -o backend.wasm .)
  fi
  ls -lh backend/backend.wasm
fi

if [ -d frontend ] && [ -f frontend/package.json ]; then
  (cd frontend && pnpm install --prefer-offline && pnpm build) || \
    echo "WARN: frontend build failed" >&2
fi

if ! command -v metacore >/dev/null 2>&1; then
  echo "metacore CLI not found" >&2
  exit 1
fi

if [ -n "${METACORE_DEV_KEY:-}" ]; then
  metacore build --target wasm --strict --sign "$METACORE_DEV_KEY" .
else
  metacore build --target wasm --strict .
fi
