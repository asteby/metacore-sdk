# create-metacore-addon

Scaffolder for metacore addons. Spits out a ready-to-build addon with:

- A spec-compliant `manifest.json` (kernel ABI v1 / manifest v2).
- A `frontend/` Vite + React + Module Federation remote wired to
  `@asteby/metacore-starter-config` helpers (`metacoreFederationShared`,
  `metacoreOptimizeDeps`).
- Tailwind v4 with the mandatory `@source` directives for SDK packages.
- An optional TinyGo `backend/` WASM stub that talks to the kernel host imports
  (`log`, `db_query`, `db_exec`, `event_emit`) via the documented ABI.

## Usage

```sh
npm create metacore-addon@latest my-addon
# or
npx create-metacore-addon my-addon
# or with pnpm
pnpm create metacore-addon my-addon
```

You'll be asked for:

| Prompt                | Default                                | Notes |
|-----------------------|----------------------------------------|-------|
| Addon directory / name | first CLI arg or `my-metacore-addon` | npm-safe slug; becomes the directory name and `package.json#name`. |
| Addon key             | slug of the directory name             | Lowercase letters + digits + underscores, starts with a letter. Becomes the Postgres schema (`addon_<key>`) and the federation container (`metacore_<key>`). |
| Display name          | title-cased directory name             | `manifest.name`. |
| Short description     | `A metacore addon.`                    | `manifest.description`. |
| Author                | empty                                  | `manifest.author` + `package.json#author`. |
| Template              | `minimal`                              | See below. |

### Templates

| ID            | Backend WASM stub | What you get                                                                 |
|---------------|-------------------|------------------------------------------------------------------------------|
| `minimal`     | no                | Manifest + one sidebar entry + one route. Smallest possible addon.           |
| `crud-model`  | yes (TinyGo)      | Manifest with `model_definitions`, one action, and a `backend/main.go` stub that handles the action via the WASM ABI. |
| `full-page`   | no                | `frontend.layout = "immersive"` — the addon owns the whole viewport (POS / kiosk / KDS). |
| `embedded-page` | yes (TinyGo)    | `frontend.pages[]` page inside the host chrome (`definePage` + host hooks, test with `renderWithHost`), a `contributions.api` route served by WASM, and a declarative `split` view next to it. Justify the page in the README: declarative first. |

### Adding a declarative view (`add view`)

```sh
npx create-metacore-addon add view --type map --model Shipment [dir]
npx create-metacore-addon add view --type chart --model Shipment --group-by carrier
npx create-metacore-addon add view --type split --columns tracking_number,carrier,status --dry-run
```

Writes one navigation entry with `view_type` + `view.<type>` (map, timeline,
calendar, chart, split) into `manifest.json` — JSON only, zero JavaScript.
Missing fields are inferred from the model's columns; unknown columns,
types outside the set and duplicate views are rejected. See
[`docs/declarative-views.md`](../../docs/declarative-views.md).

### Non-interactive

Every prompt has an equivalent flag, so the scaffold is scriptable:

```sh
npx create-metacore-addon my-addon \
  --template crud-model \
  --key my_addon \
  --author "Asteby" \
  --no-install \
  --pm pnpm
```

If stdin isn't a TTY (CI / piped agents) the CLI auto-enables `--yes` and
skips every prompt — it'll never hang waiting for input.

## What gets generated

```
my-addon/
├── manifest.json            # kernel manifest v2 (matches docs/wasm-abi.md v1.x)
├── README.md
├── .gitignore
├── frontend/
│   ├── package.json         # peers: react, react-dom, @asteby/metacore-sdk
│   ├── vite.config.ts       # federation + metacoreFederationShared + metacoreOptimizeDeps
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── plugin.tsx       # `definePlugin({ key, register })` + sample route
│       ├── main.tsx         # standalone dev harness (vite dev)
│       └── index.css        # Tailwind v4 with @source for SDK packages
└── backend/                 # only with --template crud-model
    ├── main.go              # TinyGo entrypoint with `alloc` + one handler
    ├── go.mod
    └── build.sh             # `tinygo build -target=wasi -opt=z -no-debug …`
```

## Next steps after scaffolding

```sh
cd my-addon/frontend
pnpm install     # if you used --no-install
pnpm run build   # produces remoteEntry.js consumable by the host
```

Package the addon for upload:

```sh
metacore build .
metacore publish my_addon-<version>.tar.gz
```

If the template includes the backend, build it once before `metacore build`:

```sh
cd backend && ./build.sh    # needs tinygo
```

## Conventions enforced by the scaffold

- **Tailwind v4 `@source` directives** for every consumed `@asteby/metacore-*`
  package — without these, the SDK's classes never reach the bundle (see team
  memo `feedback_tailwind_v4_source_sdk`).
- **`metacoreOptimizeDeps` in `vite.config.ts`** — required when the addon
  consumes linked `@asteby/metacore-*` packages, or Vite serves bare specifiers
  to the browser and the dev server explodes (`feedback_optimize_deps_metacore`).
- **`metacoreFederationShared`** for shared module-federation singletons.
  Avoids the duplicate-React "Invalid hook call" pit.
- **SDK packages as `peerDependencies`** — the addon depends only on the SDK
  surface; the host wins the share scope at runtime.
