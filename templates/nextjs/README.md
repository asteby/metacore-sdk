# Metacore Panel Starter

Template oficial para construir paneles con el framework metacore.

## Quick start

```bash
npx degit asteby/metacore-sdk/templates/nextjs mi-panel
cd mi-panel
pnpm install
pnpm dev
# → http://localhost:4000
# Login: admin@example.com / admin123
```

## Que incluye

- Auth (login/register con session cookies)
- Panel con sidebar dinamica (addons contribuyen navegacion)
- Ruta `m/[model]` que renderiza DynamicTable automatico
- Marketplace integrado (instala addons desde hub.asteby.com)
- Dashboard con slots para widgets de addons
- Dark mode + Geist font + responsive

## Estructura

```
src/
├── app/
│   ├── (auth)/           login, register
│   ├── (panel)/          dashboard, m/[model], marketplace, settings
│   └── api/              auth + marketplace proxy
├── components/
│   ├── auth/             forms + provider
│   ├── shell/            sidebar + topbar + layout
│   └── marketplace/      cards + install button
├── hooks/                useSession, useInstalledAddons, useMetacore
└── lib/                  auth, api, mock-addons, marketplace-client
```

## Customizacion

Edita `metacore.config.ts`:

```ts
export default {
  appName: "Mi Panel",
  hubUrl: "https://hub.asteby.com",
  primaryColor: "rose",
  coreNavigation: [...]
}
```

## Conectar a produccion

1. Instala metacore-kernel en tu backend Go
2. Apunta `KERNEL_URL` al endpoint del kernel
3. Configura `DATABASE_URL` para persistencia real
4. Los mock addons se reemplazan por instalaciones reales del marketplace

## Docs

- [Quickstart](https://github.com/asteby/metacore-sdk/blob/main/docs/quickstart.md)
- [Manifest spec](https://github.com/asteby/metacore-sdk/blob/main/docs/manifest-spec.md)
- [WASM ABI](https://github.com/asteby/metacore-sdk/blob/main/docs/wasm-abi.md)
