#!/usr/bin/env bash
# Build the tickets addon frontend as a Module Federation remote.
# Produces ./dist/remoteEntry.js + ./dist/assets/* consumed by `metacore build`.
set -euo pipefail

cd "$(dirname "$0")"

pnpm install
pnpm build
