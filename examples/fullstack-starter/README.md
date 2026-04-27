# Metacore Starter Kit

The official fullstack starter for the **Metacore platform**. A reusable, generic base that wires Go (kernel) and React (SDK) together so you can spin up a new product in minutes instead of days.

- **Backend**: ~50 LOC of Go on top of `metacore-kernel`. Auth, metadata-driven CRUD, webhooks, push and websockets — out of the box.
- **Frontend**: ~500 LOC of React on top of `@asteby/metacore-*` SDK packages. Auth pages, sidebar layout, dynamic tables, command menu, notifications — out of the box.
- **Branding**: Metacore logo and palette by default. Swap in your own once you fork.

## Quick start

```sh
cd examples/fullstack-starter

# Boot the full stack: postgres + backend + frontend
docker compose up --build

# Open the app
#   http://localhost:5173

# Login with the seeded admin
#   admin@demo.com / admin123
```

The seed creates an admin user, a demo organization, plus a handful of products and customers so you can explore the dynamic CRUD without any setup.

## What's inside

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
- `@asteby/metacore-runtime-react` — dynamic tables and forms driven by backend metadata.
- `@asteby/metacore-ui` — layout, sidebar, command menu, primitives.
- `@asteby/metacore-notifications` — real-time notifications dropdown wired to websockets.
- `@asteby/metacore-theme` — Metacore palette (teal `#14b8a6`) and typography.
- `@asteby/metacore-pwa` — installable PWA out of the box.

## How updates flow (the Apple-like model)

The whole point of Metacore is that **the platform team ships, the apps inherit**. When a new kernel release adds, say, RBAC scopes — every app that consumes the platform picks it up without changing a single line of business logic.

How that's wired here:

- **Frontend** depends on `@asteby/metacore-*` packages from npm. The bundled `renovate.json` groups every `@asteby/metacore-*` upgrade into one PR per release train. Patch and minor bumps are **auto-merged** so your app stays current with zero manual work; major bumps stop and ask for review because they imply migration notes.
- **Backend** depends on `github.com/asteby/metacore-kernel`. Same Renovate rules apply via `gomod`: minor/patch auto-merge, major waits.
- **CI**: enable Renovate on your fork (`https://github.com/apps/renovate`) and the dependency dashboard issue will track everything.

The result is an iOS-style cadence: the platform team rolls features into the kernel + SDK, your apps receive them on the next Renovate run, and your engineers spend their time on product, not plumbing.

> Want to pin to a specific release? Drop the auto-merge rule for `@asteby/metacore-*` in `renovate.json` and it falls back to manual PR review.

## Customising

### Branding

Replace `frontend/public/images/logo.svg` with your own logo and override the palette by importing your own theme tokens before `@asteby/metacore-theme` in `src/styles/index.css`. Update `theme_color` in `vite.config.ts` and `index.html`.

### Adding a model

1. Define a Go struct under `backend/models/` implementing `modelbase.ModelDefiner`.
2. Register it in `main.go` via `app.RegisterModel("your-model", ...)`.
3. Done. The sidebar, tables, and forms in the frontend pick it up via `/metadata/all`.

## Environment variables

Both `backend/.env.example` and `frontend/.env.example` are documented. Defaults wired in `docker-compose.yml` are enough for local development; copy the examples and edit them when you deploy.

| Var                  | Where     | Purpose                                      |
|----------------------|-----------|----------------------------------------------|
| `DATABASE_URL`       | backend   | Postgres DSN                                 |
| `JWT_SECRET`         | backend   | Sign access tokens                           |
| `SEED_DEMO_DATA`     | backend   | `true` to seed admin + demo data on boot     |
| `VAPID_PUBLIC_KEY`   | backend   | Web Push public key (optional)               |
| `VAPID_PRIVATE_KEY`  | backend   | Web Push private key (optional)              |
| `VITE_API_URL`       | frontend  | REST endpoint (e.g. `http://localhost:7200/api`) |
| `VITE_WS_URL`        | frontend  | WebSocket endpoint                           |

## Next steps

- Read the kernel docs at `metacore-kernel/docs/` for advanced auth, RBAC, multi-tenancy and webhooks.
- Read the SDK docs at `metacore-sdk/docs/` for theming, custom dynamic columns, and writing your own showcase blocks.
- When you're ready to deploy, drop the `docker compose` setup and run the `backend` and `frontend` Dockerfiles in your platform of choice.
