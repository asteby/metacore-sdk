#!/usr/bin/env bash
# Build the tickets addon bundle end-to-end:
#   1. Build the federation remote under ./frontend/dist
#   2. Invoke `metacore build .` — the CLI packs frontend/dist/** into the tarball
#
# The `metacore` binary must be on PATH: `go build -o metacore ./cli/` at the
# kernel root, then add that directory to $PATH.
set -euo pipefail

cd "$(dirname "$0")"

# 1) Frontend (federation remote).
./frontend/build.sh

# 2) Kernel bundle.
if ! command -v metacore >/dev/null 2>&1; then
  echo "metacore CLI not found in PATH" >&2
  echo "Build it from the kernel root: go build -o metacore ./cli/" >&2
  exit 1
fi

metacore validate .
metacore build .

echo "Bundle ready:"
ls -lh ./tickets-*.tar.gz
