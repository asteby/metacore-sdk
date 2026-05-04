---
"@asteby/metacore-starter-config": minor
---

feat(starter-config): nuevo preset `metacoreFederationShared({ host, apps })` para Module Federation con singletons obligatorios.

Devuelve la config (`name`, `filename`, `remotes`, `exposes`, `shared`) lista para
pasar a `@originjs/vite-plugin-federation`, con los 7 paquetes que TODA app
federada (host + addons) del ecosistema metacore debe declarar `singleton: true`
ya cableados:

- `react`, `react-dom`
- `@asteby/metacore-runtime-react`, `@asteby/metacore-theme`, `@asteby/metacore-auth`, `@asteby/metacore-ui`
- `@asteby/metacore-sdk`

Sin esto, los addons bundlean su propia copia de React + Providers y se rompen
`useApi()`, `useTheme()`, `useAuth()`, los Radix portals y el `Registry` cross-tree
(reasoning detallado en `docs/audits/2026-05-04-mf-shared-deps.md`).

API mínima — host:

```ts
import federation from '@originjs/vite-plugin-federation'
import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'

federation(metacoreFederationShared({
  host: 'metacore_ops',
  apps: { metacore_tickets: 'https://addons.example.com/tickets/remoteEntry.js' },
}))
```

API mínima — addon:

```ts
federation(metacoreFederationShared({
  host: 'metacore_tickets',
  exposes: { './plugin': './src/plugin.tsx' },
}))
```

Soporta `extras` (paquetes adicionales a marcar singleton) y `overrides`
(forzar `requiredVersion`/`strictVersion` por package). También se exporta
`METACORE_FEDERATION_SINGLETONS` para tests/validaciones.

Ejemplo end-to-end en `examples/fullstack-starter/frontend/vite.config.ts`.
No breaking — sólo agrega símbolos a `@asteby/metacore-starter-config/vite`.
