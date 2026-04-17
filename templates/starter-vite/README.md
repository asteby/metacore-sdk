# @asteby/metacore-starter-vite

Thin, opinionated Vite + React 19 starter that consumes every `@asteby/metacore-*` package end-to-end:

- `@asteby/metacore-theme` — Tailwind 4 tokens & base styles
- `@asteby/metacore-ui` — primitives, layout shell, data table, dialogs, hooks
- `@asteby/metacore-pwa` — PWA provider, install/update prompts, vite plugin
- `@asteby/metacore-auth` — Zustand store, axios client factory, guards, sign-in/up/forgot pages
- `@asteby/metacore-runtime-react` — `DynamicTable`, `ActionModalDispatcher`, `AddonLoader`
- `@asteby/metacore-sdk` — shared types for addons / slots

It intentionally ships **glue code only**. If you find yourself rewriting a component that already lives in a package, reach for the package first.

---

## Quick start

```bash
# from the monorepo root
pnpm install
cp templates/starter-vite/.env.example templates/starter-vite/.env
pnpm --filter @asteby/metacore-starter-vite dev
```

Open http://localhost:5173. Unauthenticated visits are redirected to `/sign-in`.

### Available scripts

| Command     | What it does                                 |
| ----------- | -------------------------------------------- |
| `dev`       | Vite dev server on port 5173                 |
| `build`     | Typecheck (`tsc -b`) + production build      |
| `preview`   | Serve the production build locally           |
| `typecheck` | Run TypeScript in no-emit mode               |
| `clean`     | Remove `dist/` and Vite cache                |

---

## Structure

```
src/
  main.tsx                providers: QueryClient, PWA, Toaster, Router
  router.ts               TanStack Router + QueryClient instances
  sw.js                   service worker (injectManifest mode)
  styles/index.css        imports @asteby/metacore-theme
  lib/api.ts              shared axios instance (auth + i18n + 401 handling)
  routes/
    __root.tsx
    _authenticated/
      route.tsx           auth guard + AppSidebar + AuthenticatedLayout
      index.tsx           dashboard placeholder
      users/index.tsx     DynamicTable demo
    (auth)/
      sign-in.tsx         wraps SignInPage from @asteby/metacore-auth
      sign-up.tsx
      forgot-password.tsx
    errors/
      404.tsx
      500.tsx
```

---

## How to extend

### Add a new protected route

Drop a file under `src/routes/_authenticated/`. It inherits the auth guard, the sidebar, and the header. Example:

```tsx
// src/routes/_authenticated/orders/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/orders/')({
  component: () => <h1>Orders</h1>,
})
```

The TanStack Router plugin regenerates `routeTree.gen.ts` on save.

### Connect to a different backend

Edit `.env` (`VITE_API_URL=https://api.example.com`). The axios instance in `src/lib/api.ts` picks it up automatically. If your backend uses a different login payload or token field, tweak the `onSubmit` handler in `src/routes/(auth)/sign-in.tsx`.

### Extend the sidebar

Edit the `navGroups` array inside `src/routes/_authenticated/route.tsx`. Each group follows the `NavGroupData` type exported from `@asteby/metacore-ui/layout`. Icons come from `lucide-react`.

For dynamic navigation (fetched from the backend), replace the static array with the result of a query + `useNavigationBuilder()` from `@asteby/metacore-runtime-react`.

### Load an addon at runtime

Use `AddonLoader` from `@asteby/metacore-runtime-react`:

```tsx
import { AddonLoader } from '@asteby/metacore-runtime-react'

<AddonLoader manifestUrl="/addons/my-addon/manifest.json" />
```

Addon slot registration lives in `@asteby/metacore-sdk/react`.

### Customize the theme

`@asteby/metacore-theme` exports Tailwind 4 tokens (`oklch`) at `styles/tokens.css`. Override CSS variables in `src/styles/index.css` **after** the `@import` line to tweak brand colors without forking the theme.

---

## Open TODOs

- `getDynamicColumns` uses a trivial `accessorKey`/`header` mapping. Replace with your design-system-aware renderer (badges, avatars, relation lookups) once the shape of your metadata stabilizes.
- `/auth/login`, `/auth/register`, `/auth/forgot-password` endpoint paths and response shapes are placeholders — align them with your actual backend.
- No icons are wired in `vite.config.ts` manifest — add your own under `public/images/icons/*` before shipping.
