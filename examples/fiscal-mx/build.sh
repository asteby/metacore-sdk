#!/usr/bin/env bash
# End-to-end build for the fiscal_mx addon.
#   1. Build frontend federation remote → frontend/dist/
#   2. Run CLI gates + pack bundle + optional Ed25519 signature
#
# Env:
#   METACORE_DEV_KEY=path/to/dev.pem    (optional — signs the bundle if set)
set -euo pipefail
cd "$(dirname "$0")"

# 1) Frontend build
if [ -d frontend ]; then
  (cd frontend && pnpm build)
fi

# 2) Optionally compile backend binary (published separately in production).
#    Uncomment if you want to ship it inside the bundle.
# (cd backend && go build -o ../dist/fiscal-mx-backend .)

# 3) CLI gates + tar.gz.
if ! command -v metacore >/dev/null 2>&1; then
  echo "metacore CLI not found — build it: go build -o metacore ./cli/" >&2
  exit 1
fi

if [ -n "${METACORE_DEV_KEY:-}" ]; then
  metacore build --strict --sign "$METACORE_DEV_KEY" .
else
  metacore build --strict .
fi

ls -lh ./fiscal_mx-*.tar.gz*
