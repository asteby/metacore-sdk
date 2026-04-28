<div align="center">

# Metacore Starter Kit

**The official fullstack starter for the Metacore platform.**

Go (kernel) + React (SDK) wired end-to-end so you ship product, not plumbing.

[![Get started](https://img.shields.io/badge/get%20started-npm%20create%20%40asteby%2Fmetacore--app-14b8a6?style=for-the-badge)](#-quick-start)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue?style=for-the-badge)](../../LICENSE)
[![Made with Metacore](https://img.shields.io/badge/Made%20with-Metacore-0d9488?style=for-the-badge)](https://github.com/asteby/metacore)
[![Renovate](https://img.shields.io/badge/Renovate-auto--merge-22c55e?style=for-the-badge)](https://github.com/asteby/renovate-config)

</div>

---

## ⚡ Quick start

One command. Pinned versions. Ready to run.

```sh
npm create @asteby/metacore-app my-app -- --example fullstack-starter
cd my-app
docker compose up --build
```

Open http://localhost:5173 and log in with the seeded admin: **`admin@demo.com` / `admin123`**.

The CLI clones this directory from `asteby/metacore-sdk` via `tiged`, replaces every `workspace:*` dep with the latest published npm version, and you're off — same fast path that powers `create-next-app --example`.

> Prefer to clone manually? `npx tiged asteby/metacore-sdk/examples/fullstack-starter my-app`

## 🎯 What you get

- **~50 LOC of Go** that boots auth, metadata-driven CRUD, webhooks, push and websockets via `host.NewApp()`.
- **~500 LOC of React** that gives you sign-in, sidebar shell, dynamic tables/forms, command menu and a notification bell — every route is a one-liner over `@asteby/metacore-runtime-react`.
- **Docker compose** spinning `pgvector/pgvector:pg17` + backend + frontend, idempotent seeders, and a VAPID-ready PWA.
- **Semantic search ready**: bundled Postgres ships pgvector, and `host.AppConfig.EnableVectorStore` / `EnableEmbedder` wire `app.VectorStore` (cosine search) and `app.Embedder` (BGE-M3 default) so you can add search to any model by dropping an `embedding vector(N)` column.
- **Apple-style auto-updates**: Renovate keeps every `@asteby/metacore-*` and `github.com/asteby/metacore-*` dep on the latest patch/minor, automatically.

## 📦 What's inside

| Layer    | Tech                                            | LOC   |
|----------|-------------------------------------------------|-------|
| Backend  | Go + Fiber + GORM + `metacore-kernel`           | ~50   |
| Frontend | React + Vite + TanStack + `@asteby/metacore-*`  | ~500  |
| Infra    | Docker Compose + PostgreSQL 16                  | ~20   |

### Backend (`backend/`)

`host.NewApp()` boots auth, metadata, dynamic CRUD, webhooks and push notifications in one call. The starter ships three example models — `Product`, `Customer`, `Notification` — each declaring its own `DefineTable` / `DefineModal` metadata. Add your own model, register it, and the frontend picks it up automatically.

### Frontend (`frontend/`)

Every route is 10–20 LOC because the heavy lifting lives in the SDK:

- `@asteby/metacore-auth` — sign-in / sign-up flows, JWT store, guards.
- `@asteby/metacore-runtime-react` — dynamic tables and forms driven by backend metadata, including the `<DynamicCRUDPage>` shell and the per-model extension registry.
- `@asteby/metacore-ui` — layout, sidebar, command menu, primitives.
- `@asteby/metacore-notifications` — real-time notifications dropdown wired to websockets.
- `@asteby/metacore-theme` — Metacore palette (teal `#14b8a6`) and typography.
- `@asteby/metacore-pwa` — installable PWA out of the box.

## 🔁 How updates flow (the Apple-like model)

The whole point of Metacore is that **the platform team ships, the apps inherit**. When a new kernel release adds, say, RBAC scopes — every app that consumes the platform picks it up without changing a single line of business logic.

How that's wired here:

- **Frontend** depends on `@asteby/metacore-*` packages from npm. The bundled `renovate.json` extends `github>asteby/renovate-config` and groups every `@asteby/metacore-*` upgrade into one PR per release train. Patch and minor bumps are **auto-merged** so your app stays current with zero manual work; major bumps stop and ask for review because they imply migration notes.
- **Backend** depends on `github.com/asteby/metacore-kernel`. Same Renovate rules apply via `gomod`: minor/patch auto-merge, major waits.
- **CI**: enable Renovate on your fork (`https://github.com/apps/renovate`) and the dependency dashboard issue will track everything.

The result is an iOS-style cadence: the platform team rolls features into the kernel + SDK, your apps receive them on the next Renovate run, and your engineers spend their time on product, not plumbing.

> Want to pin to a specific release? Drop the auto-merge rule for `@asteby/metacore-*` in `renovate.json` and it falls back to manual PR review.

## 🛠 Customising

### Branding

Replace `frontend/public/images/logo.svg` with your own logo and override the palette by importing your own theme tokens before `@asteby/metacore-theme` in `src/styles/index.css`. Update `theme_color` in `vite.config.ts` and `index.html`.

### Adding a model

1. Define a Go struct under `backend/models/` implementing `modelbase.ModelDefiner`.
2. Register it in `main.go` via `app.RegisterModel("your-model", ...)` and append to `appModels` for migrations.
3. (Optional) Drop a `<thing>_seeder.go` next to the others in `backend/database/seeders/` and append it to `seeders.All()`.
4. Done. The sidebar, tables, and forms in the frontend pick it up via `/metadata/all`.

### Per-model UI extensions

Drop a KPI strip, a custom toolbar button or a hidden create flow without forking `<DynamicCRUDPage>`:

```tsx
import { registerModelExtension } from '@asteby/metacore-runtime-react'

registerModelExtension('customers', {
  headerExtras: CustomersKpiStrip, // your component
  hideImport: true,
})
```

### Seeders & migrations

The starter ships the same framework `link` and `ops` use in production:

```sh
# inside backend/
go run ./cmd/seed              # default: migrate + seed everything (idempotent)
go run ./cmd/seed --migrate    # schema only
go run ./cmd/seed --seed       # data only
go run ./cmd/seed --only=products
go run ./cmd/seed --list       # show every registered seeder
SEED_RESET_CONFIRM=yes go run ./cmd/seed --reset   # DROP everything, then rebuild
```

Each seeder lives in its own file under `database/seeders/` and reads tunable defaults from `SEED_*` env vars (see `backend/.env.example`). Adding a seeder is one struct + one line in `seeders.All()`.

### Internationalisation

Backend metadata is translatable: declare i18n keys in your model's `DefineTable`/`DefineModal`, register a `Translator` on `host.NewApp`, and the kernel pipes the right strings through based on `Accept-Language`. The starter wires English and Spanish bundles by default; drop a JSON next to them in `backend/i18n/locales/` to add a third.

## 🌐 Environment variables

Both `backend/.env.example` and `frontend/.env.example` are documented. Defaults wired in `docker-compose.yml` are enough for local development; copy the examples and edit them when you deploy.

| Var                  | Where     | Purpose                                      |
|----------------------|-----------|----------------------------------------------|
| `DATABASE_URL`       | backend   | Postgres DSN                                 |
| `JWT_SECRET`         | backend   | Sign access tokens                           |
| `SEED_DEMO_DATA`     | backend   | `true` to seed admin + demo data on boot     |
| `DEFAULT_LANGUAGE`   | backend   | `es`, `en`, …                                |
| `VAPID_PUBLIC_KEY`   | backend   | Web Push public key (optional)               |
| `VAPID_PRIVATE_KEY`  | backend   | Web Push private key (optional)              |
| `VITE_API_URL`       | frontend  | REST endpoint (e.g. `http://localhost:7200/api`) |
| `VITE_WS_URL`        | frontend  | WebSocket endpoint                           |

## 🚀 Next steps

- Read the kernel docs at [`metacore-kernel`](https://github.com/asteby/metacore-kernel) for advanced auth, RBAC, multi-tenancy and webhooks.
- Read the SDK docs at [`metacore-sdk`](https://github.com/asteby/metacore-sdk) for theming, custom dynamic columns, and writing your own showcase blocks.
- The Renovate preset that drives the auto-update flow is at [`asteby/renovate-config`](https://github.com/asteby/renovate-config).
- When you're ready to deploy, drop the `docker compose` setup and run the `backend` and `frontend` Dockerfiles in your platform of choice — Render, Railway, Fly, Cloud Run all work out of the box.

---

<div align="center">

Built with ❤️ by [Asteby](https://github.com/asteby) on top of the [Metacore platform](https://github.com/asteby/metacore).

</div>
