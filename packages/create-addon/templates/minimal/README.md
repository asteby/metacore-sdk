# {{ADDON_NAME}}

{{ADDON_DESCRIPTION}}

Scaffolded with `create-metacore-addon` (template: `minimal`).

## Build

```sh
cd frontend
pnpm install
pnpm run build
```

## Package & publish

```sh
metacore build .
metacore publish {{ADDON_KEY}}-<version>.tar.gz
```

## Structure

- `manifest.json` — addon descriptor consumed by the kernel.
- `frontend/` — Vite + React + Module Federation remote. Exposes `./plugin`
  via `remoteEntry.js`. The host injects it under the `metacore_{{ADDON_KEY}}`
  container.

## Standalone dev

```sh
cd frontend
pnpm dev
```

This runs the plugin against a fake `Registry` + `MarketplaceClient` pair
(see `src/main.tsx`) — no host needed.
