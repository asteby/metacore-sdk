# {{APP_NAME}}

Vite + React app wired to the metacore ecosystem via
[`@asteby/metacore-starter-core`](https://www.npmjs.com/package/@asteby/metacore-starter-core)
and
[`@asteby/metacore-starter-config`](https://www.npmjs.com/package/@asteby/metacore-starter-config).

## Scripts

```bash
pnpm dev        # start Vite dev server
pnpm build      # typecheck + production bundle
pnpm preview    # preview the built bundle
pnpm typecheck  # tsc --noEmit
```

## Layout

```
src/
  features/   # domain-oriented modules (forms, tables, flows)
  routes/     # TanStack Router file-based routes
  App.tsx     # root component
  main.tsx    # entry + providers (Query, Theme)
```

Environment variables live in `.env.local` (see `.env.example`).
