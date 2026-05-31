# @asteby/metacore-starter-config

Shared build & lint configs for metacore host applications.
Centralizes Tailwind 4, TypeScript, Vite, and ESLint so apps extend instead of copy.

## Stability

Stable as of v1.0. The four exported subpaths (`./tailwind`, `./tsconfig`,
`./vite`, `./eslint`) plus `./fonts` follow semver. The exact set of plugins
wired by `defineMetacoreConfig()` may grow in minor releases (e.g. new
optional integrations); the option object is additive and existing options
will not change shape inside the major.

## Install

```bash
pnpm add -D @asteby/metacore-starter-config
```

Plus the relevant peers (most apps already have these): `vite`, `@vitejs/plugin-react-swc`,
`@tailwindcss/vite`, `tailwindcss`, `typescript`, `eslint`, `typescript-eslint`,
`eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `@tanstack/eslint-plugin-query`,
`globals`. Optional: `@tanstack/router-plugin`, `vite-plugin-pwa`.

## Exports

| Subpath       | What it gives you |
|---|---|
| `./tailwind`  | Tailwind v4 preset (safelist, plugins hook). Tokens live in `@asteby/metacore-theme/tokens.css`. |
| `./tsconfig`  | Base `compilerOptions` (strict, Bundler, ES2020, JSX). Paths are **empty** — apps define their own. |
| `./vite`      | `defineMetacoreConfig()` factory with React SWC + Tailwind + optional TanStack Router + optional PWA. Also exports `metacoreOptimizeDeps` / `metacoreOptimizeDepsInclude` for apps that build their own Vite config. |
| `./eslint`    | Flat ESLint config array (TS, react-hooks, react-refresh, TanStack Query). |
| `./fonts`     | Canonical `fonts` tuple (`['inter', 'manrope', 'system']`) and `Font` type — single source of truth for `<FontProvider fonts={...} />`. |

## Usage

### `tsconfig.app.json`

```json
{
  "extends": "@asteby/metacore-starter-config/tsconfig",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

### `vite.config.ts`

```ts
import { defineMetacoreConfig } from '@asteby/metacore-starter-config/vite'

export default defineMetacoreConfig({
  router: true,
  pwa: {
    name: 'My Host',
    shortName: 'My Host',
    description: 'My host application',
    themeColor: '#84cc16',
    backgroundColor: '#1a2e05',
    icons: [/* ... */],
  },
  extend: {
    resolve: {
      alias: { '@': new URL('./src', import.meta.url).pathname },
    },
  },
})
```

### `tailwind.config.js` (only if you use JS config; v4 apps usually use CSS-only)

```js
import preset from '@asteby/metacore-starter-config/tailwind'

export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
}
```

### `eslint.config.js`

```js
import { defineConfig } from 'eslint/config'
import metacore from '@asteby/metacore-starter-config/eslint'

export default defineConfig(
  { ignores: ['dist', 'src/components/ui'] },
  ...metacore,
)
```

### Module Federation singletons (`metacoreFederationShared`)

> `metacoreFederationShared()` is the **canonical way** to configure Module
> Federation for any metacore host or addon. It now targets the official
> [`@module-federation/vite`](https://module-federation.io) plugin (the broken
> `@originjs/vite-plugin-federation` is gone — it leaked `__v__css__`
> placeholders, double-`assets/` chunk refs and never wired the host's shared
> React, crashing addons on `useState`). The helper emits a `federation()`
> config object with the canonical shared singletons pre-wired.

Toda app federada (host o addon) debe compartir las mismas instancias de React,
de los providers (`@asteby/metacore-{runtime-react,theme,auth,ui,app-providers}`),
de i18n (`react-i18next`, `i18next`) y del registry del SDK
(`@asteby/metacore-sdk`). Caso contrario, los addons terminan con su propia
copia de React y rompen `useApi()`, `useTheme()`, `useAuth()`, los Radix portals,
el `Registry`, etc. (el clásico crash de `useState`-null).

`metacoreFederationShared({ host })` (host) o
`metacoreFederationShared({ host, exposes })` (addon) devuelve un bloque listo
para pasar a `federation()` de `@module-federation/vite`, con los **11
singletons obligatorios** ya cableados (`{ singleton: true }`):

- `react`
- `react-dom`
- `react/jsx-runtime`
- `react-i18next`
- `i18next`
- `@asteby/metacore-ui`
- `@asteby/metacore-runtime-react`
- `@asteby/metacore-sdk`
- `@asteby/metacore-app-providers`
- `@asteby/metacore-theme`
- `@asteby/metacore-auth`

> **Gotcha build-time:** `@module-federation/vite` resuelve cada bare specifier
> de `shared` en build-time, así que TODO paquete del map (incluyendo
> `i18next`/`react-i18next`) debe estar instalado como (dev)dependency del
> package que buildea.

#### Host

Los remotes se registran **dinámicamente en runtime** (vía `registerRemotes` del
`AddonLoader` de `@asteby/metacore-runtime-react`), así que el host no declara
`apps` — sólo su `name` y el `shared`:

```ts
import { federation } from '@module-federation/vite'
import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'

federation(metacoreFederationShared({ host: 'metacore_ops' }))
```

#### Addon

```ts
import { federation } from '@module-federation/vite'

federation(
  metacoreFederationShared({
    host: 'metacore_tickets', // == containerName(manifest) del SDK
    exposes: { './register': './src/register.tsx' },
  }),
)
```

#### Opciones

| Opción      | Tipo                                              | Default            | Notas |
|-------------|---------------------------------------------------|--------------------|-------|
| `host`      | `string`                                          | _requerido_        | `name` del contenedor de federation. Para hosts: el nombre de la app; para addons: `metacore_<addonKey>`. |
| `apps`      | `Record<string, string>`                          | `undefined`        | Mapa name → URL de remotes. Hosts lo usan para enchufar addons; addons normalmente lo omiten. |
| `filename`  | `string`                                          | `'remoteEntry.js'` | Override sólo si lo cambia el contrato del runtime. |
| `exposes`   | `Record<string, string>`                          | `undefined`        | Módulos expuestos al host (lado addon). |
| `extras`    | `string[]`                                        | `[]`               | Paquetes extra a marcar singleton sobre los obligatorios (ej. `'@tanstack/react-query'`). |
| `overrides` | `Record<string, MetacoreFederationShareConfig>`   | `{}`               | Forzar `requiredVersion: '^X'` u otro flag por package. Se mergea encima de la entry base. |

La constante exportada `METACORE_FEDERATION_SINGLETONS` está disponible para tests
o validaciones custom (ej. asegurarse de que un addon migrado declara las 11).

> `@module-federation/vite` es dependency de este paquete; la app consumidora lo
> importa como `import { federation } from '@module-federation/vite'` e instancia
> el plugin con el objeto que devuelve la helper.

### Federated addon aliases (`metacoreFederationAliases`)

> Every federated addon must spread `metacoreFederationAliases` into its
> `resolve.alias`. It is the **canonical, inherited** replacement for the
> per-addon `virtual:pwa-register/react` stub.

`@asteby/metacore-app-providers` (consumed transitively by most addons, e.g. via
`useOrgConfig`) imports `virtual:pwa-register/react` — the module
`vite-plugin-pwa` auto-generates. That virtual module **only exists when an app
runs `vite-plugin-pwa`**. A federated addon bundle does not, so the bare
`virtual:` specifier resolves to nothing at runtime (`ERR_FAILED` / CORS on the
`virtual:` specifier), which tears down the whole addon module and silently
drops the federated `register()` — the host then falls back to its generic
declarative modal. Marking it `external` is the same trap: it stays unresolved
in the browser.

The addon is **never** the PWA owner (the host shell registers the service
worker), so `metacoreFederationAliases` aliases `virtual:pwa-register/react` to
a no-op stub shipped inside this package (`pwa-register-stub.js`, with the same
`useRegisterSW` / `registerSW` surface as vite-plugin-pwa). The stub path is
resolved relative to the published package via `import.meta.url`, so addons do
**not** carry a local stub file or a relative path.

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { federation } from '@module-federation/vite'
import {
  metacoreFederationAliases,
  metacoreFederationShared,
} from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  resolve: {
    alias: {
      ...metacoreFederationAliases,
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  plugins: [
    react(),
    federation(
      metacoreFederationShared({
        host: 'metacore_<addonKey>',
        exposes: { './register': './src/register.tsx' },
      }),
    ),
  ],
})
```

### Pre-bundling linked SDK packages

Apps that consume `@asteby/metacore-*` via `file:` or `workspace:` need Vite
to pre-bundle them or the browser sees bare specifiers. `defineMetacoreConfig()`
already wires this. If you build your own Vite config, import the same list:

```ts
import { metacoreOptimizeDeps } from '@asteby/metacore-starter-config/vite'

export default defineConfig({
  optimizeDeps: metacoreOptimizeDeps,
})
```

## Notes

- PWA icon set is **not** embedded (apps own their assets); pass `icons` via options.
- Design tokens (colors, fonts, shadows) remain in `@asteby/metacore-theme`.
