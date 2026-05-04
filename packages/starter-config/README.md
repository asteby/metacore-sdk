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

Toda app federada (host o addon) debe compartir las mismas instancias de React,
de los providers (`@asteby/metacore-{runtime-react,theme,auth,ui}`) y del registry
del SDK (`@asteby/metacore-sdk`). Caso contrario, los addons terminan con su propia
copia de React y rompen `useApi()`, `useTheme()`, `useAuth()`, los Radix portals,
el `Registry`, etc.

`metacoreFederationShared({ host, apps })` devuelve un bloque listo para pasar
a `@originjs/vite-plugin-federation` con los **7 singletons obligatorios** ya
cableados (`singleton: true, requiredVersion: false`):

- `react`
- `react-dom`
- `@asteby/metacore-runtime-react`
- `@asteby/metacore-theme`
- `@asteby/metacore-auth`
- `@asteby/metacore-ui`
- `@asteby/metacore-sdk`

#### Host

```ts
import federation from '@originjs/vite-plugin-federation'
import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'

federation(
  metacoreFederationShared({
    host: 'metacore_ops',
    apps: {
      metacore_tickets: 'https://addons.example.com/tickets/remoteEntry.js',
      metacore_orders:  'https://addons.example.com/orders/remoteEntry.js',
    },
  }),
)
```

#### Addon

```ts
federation(
  metacoreFederationShared({
    host: 'metacore_tickets', // == containerName(manifest) del SDK
    exposes: { './plugin': './src/plugin.tsx' },
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
o validaciones custom (ej. asegurarse de que un addon migrado declara las 7).

> Peer suelto: `@originjs/vite-plugin-federation` debe estar instalado en la app
> consumidora; no es peer dep obligatorio de este paquete porque la helper sólo
> emite el objeto y no instancia el plugin.

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
