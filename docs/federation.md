<p align="center">
  <img src="./assets/metacore.svg" width="120" alt="Metacore" />
</p>

<h1 align="center">Federation</h1>

<p align="center">
  <strong>How metacore addons declare Module Federation so the host's React, SDK and providers stay as single instances at runtime.</strong>
</p>

> **TL;DR.** Use [`metacoreFederationShared()`](#metacorefederationshared-the-canonical-helper)
> from `@asteby/metacore-starter-config/vite`. It is the only API the SDK
> documents and the only one guaranteed to typecheck across upgrades of
> `@originjs/vite-plugin-federation`.

## Why federation needs canonicalisation

A metacore addon ships only its own code. React, the SDK, the auth store,
the theme provider, the UI primitives and the addon registry all come from
the host shell at runtime, through Module Federation's shared scope. Without
the seven obligatory singletons declared on **both** ends, the addon ends up
with a duplicate React (canonical `Invalid hook call`), broken contexts
(`useAuth()`, `useTheme()`, `useApi()` all return `undefined`), or a private
`Registry` the shell never reads — see the
[shared-deps audit](./audits/2026-05-04-mf-shared-deps.md) for the long form.

The list of singletons is also a moving target: it grew from three in 2.2 to
eight in 2.5 as `app-providers` and `notifications` were extracted out of
`auth` and `ui`. Hard-coding the list in every addon's `vite.config.ts`
makes it impossible for the SDK to evolve without breaking every addon —
which is what
[`metacoreFederationShared()`](#metacorefederationshared-the-canonical-helper)
exists to fix.

## `metacoreFederationShared()` — the canonical helper

Exported from `@asteby/metacore-starter-config/vite`. It returns a config
object ready to pass straight to `@originjs/vite-plugin-federation`, with
**every singleton the SDK requires** pre-declared.

### Addon (federated remote)

```ts
// addon vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import federation from '@originjs/vite-plugin-federation'
import {
  metacoreFederationShared,
  metacoreOptimizeDeps,
} from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    react(),
    federation(
      metacoreFederationShared({
        host: 'metacore_tickets',                       // == containerName(manifest)
        exposes: { './plugin': './src/plugin.tsx' },
      }),
    ),
  ],
  optimizeDeps: metacoreOptimizeDeps,
  build: { target: 'esnext', modulePreload: false, cssCodeSplit: false },
})
```

### Host (shell consuming addons)

```ts
// host vite.config.ts
import { defineConfig } from 'vite'
import federation from '@originjs/vite-plugin-federation'
import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  plugins: [
    federation(
      metacoreFederationShared({
        host: 'metacore_ops',
        apps: {
          metacore_tickets: 'https://addons.example.com/tickets/remoteEntry.js',
          metacore_orders:  'https://addons.example.com/orders/remoteEntry.js',
        },
      }),
    ),
  ],
})
```

Hosts pass `apps` (remote map) instead of `exposes`; addons do the opposite.
Both ends share the same singleton list and the same plugin call.

The full option reference (including `extras`, `overrides` and `filename`)
lives in [`packages/starter-config/README.md`](../packages/starter-config/README.md#module-federation-singletons-metacorefederationshared).

## ⚠️ Do not import `SharedConfig` from the plugin directly

`@originjs/vite-plugin-federation` >= 1.4 removed `singleton` from its public
`SharedConfig` TypeScript type. The runtime still honours `singleton: true`
(the field is read by the plugin at build time), but any addon authoring its
own `shared:` block with the plugin's type — instead of using
`metacoreFederationShared()` — will fail to typecheck on the next bump:

```ts
// ❌ DO NOT do this — breaks on @originjs/vite-plugin-federation >= 1.4
import type { SharedConfig } from '@originjs/vite-plugin-federation/types'

const shared: Record<string, SharedConfig> = {
  react:                  { singleton: true, requiredVersion: false }, // ts(2353)
  'react-dom':            { singleton: true, requiredVersion: false },
  '@asteby/metacore-sdk': { singleton: true, requiredVersion: false },
}
```

The fix is either of:

1. **Use `metacoreFederationShared()`** (recommended). It returns a value
   typed against an internal `MetacoreFederationShareConfig` that re-declares
   `singleton`, so the upstream type drift is invisible to consumers.
2. **Declare a local share config type** that includes `singleton`. This is
   what `metacoreFederationShared()` does internally; reach for it only if
   you have a structural reason not to use the helper.

```ts
// Acceptable escape hatch when the helper genuinely does not fit.
interface FederationShareConfig {
  singleton?: boolean
  requiredVersion?: string | false
  shareScope?: string
  packagePath?: string
  generate?: boolean
}

const shared: Record<string, FederationShareConfig> = { /* … */ }
```

Both addon reference implementations in the SDK repo (`tickets`,
`fiscal-mx`) ship the second pattern as a fallback for the rare case where
the helper does not apply (see PR #195).

## The seven (now eight) singletons

`metacoreFederationShared()` declares the following packages with
`{ singleton: true, requiredVersion: false }`:

- `react`
- `react-dom`
- `@asteby/metacore-runtime-react`
- `@asteby/metacore-theme`
- `@asteby/metacore-app-providers`
- `@asteby/metacore-auth`
- `@asteby/metacore-ui`
- `@asteby/metacore-sdk`

`@asteby/metacore-app-providers` was added in 2.5 — the helper keeps the
canonical list in one place so addons inherit the change with a bump
instead of edit-each-config. The constant `METACORE_FEDERATION_SINGLETONS`
is exported for tests that want to assert against the live list.

## Pre-bundling SDK packages locally

When the addon is linked via `file:` / `workspace:` (development), Vite
does **not** pre-bundle linked deps by default. The SDK packages reach the
browser with bare specifiers and the browser throws
`Failed to resolve module specifier`. Use `metacoreOptimizeDeps` from
`@asteby/metacore-starter-config/vite` to force pre-bundling — see
[the starter-config README](../packages/starter-config/README.md#pre-bundling-linked-sdk-packages).

## See also

- [`packages/starter-config/README.md`](../packages/starter-config/README.md#module-federation-singletons-metacorefederationshared) — full helper option reference.
- [`bridge-api.md`](./bridge-api.md#golden-rules) — golden rules every federated addon must obey.
- [`full-page-federation.md`](./full-page-federation.md) — `./pages/<slug>` exposes that take over the viewport; same shared config.
- [`docs/audits/2026-05-04-mf-shared-deps.md`](./audits/2026-05-04-mf-shared-deps.md) — design rationale for the singleton list.
