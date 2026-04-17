# Metacore Fullstack Starter

End-to-end showcase: **~50 LOC backend** (Go + metacore-kernel) + **~500 LOC frontend** (React + 11 @asteby/metacore-* packages).

## Quick start

```sh
# 1. Copy env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Start everything
docker compose up

# 3. Open the app
open http://localhost:5173

# 4. Login with seeded credentials
#    admin@demo.com / admin123
```

## What this demonstrates

- **Backend**: `host.NewApp()` boots auth, metadata, dynamic CRUD, webhooks, and push in one call. Two domain models (Product, Customer) with `DefineTable`/`DefineModal` metadata.
- **Frontend**: Every route is 10-20 LOC. Theme via one CSS import. Auth pages, sidebar layout, DynamicTable, and WebhooksManager all come from the SDK packages.

## Stack

| Layer    | Tech                                   | LOC  |
|----------|----------------------------------------|------|
| Backend  | Go + Fiber + GORM + metacore-kernel    | ~50  |
| Frontend | React + Vite + TanStack + metacore-sdk | ~500 |
| Infra    | Docker Compose + PostgreSQL            | ~20  |
