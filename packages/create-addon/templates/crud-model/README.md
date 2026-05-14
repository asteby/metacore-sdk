# {{ADDON_NAME}}

{{ADDON_DESCRIPTION}}

Scaffolded with `create-metacore-addon` (template: `crud-model`).

## What's inside

- `manifest.json` — one model (`{{ADDON_KEY}}_items`), one action (`mark_done`),
  a `backend` block pointing at the compiled WASM module, and an
  `event:emit {{ADDON_KEY}}.*` capability.
- `frontend/` — federated remote with a route and a sample dashboard widget.
- `backend/` — TinyGo source compiled to `backend/backend.wasm` via the
  kernel's documented WASM ABI (`@asteby/metacore-kernel/docs/wasm-abi.md`).
- `migrations/` — SQL applied at install time by the dynamic migration runner.

## Build

```sh
# 1. Frontend
cd frontend
pnpm install
pnpm run build

# 2. Backend (requires tinygo: https://tinygo.org)
cd ../backend
./build.sh

# 3. Package
cd ..
metacore build .
metacore publish {{ADDON_KEY}}-<version>.tar.gz
```

## ABI surface used

The `mark_done` handler imports:

- `metacore_host.log` — structured log line.
- `metacore_host.event_emit` — publish `{{ADDON_KEY}}.item.completed` once the
  state transition succeeds. Requires the `event:emit {{ADDON_KEY}}.*`
  capability (declared in `manifest.json`).

Add more host imports (`db_query`, `db_exec`, `http_fetch`) by declaring the
matching capabilities in `manifest.json` and importing the function from
`metacore_host` in `backend/main.go`.
