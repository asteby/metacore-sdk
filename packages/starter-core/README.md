# @asteby/metacore-starter-core

Internal scaffolding shared by the official Metacore Vite + React starter and a small number of internal apps. It is **not published to npm** (`"private": true` in `package.json`) and is excluded from the Changesets publish pipeline.

If you are building a Metacore app, start from [`@asteby/create-metacore-app`](../create-metacore-app) instead — it scaffolds a project that depends on the public `@asteby/metacore-*` packages directly, without going through this internal layer.

## What lives here

The package re-exports curated subsets of:

- `lib/` — small utilities used across the starter templates.
- `components/ui/` — shadcn/ui primitives in their canonical form, kept in sync with `@asteby/metacore-ui`.

It exists so the `templates/` shipped by `@asteby/create-metacore-app` can pin a single version of the starter scaffolding while the public packages evolve at their own pace.

## Build

```bash
pnpm --filter @asteby/metacore-starter-core build
```

Produces an ESM + CJS bundle via Vite library mode and `.d.ts` files via `tsc`. The build runs in CI but is excluded from `pnpm release` because the package is private.
