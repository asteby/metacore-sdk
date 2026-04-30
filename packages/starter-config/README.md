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
