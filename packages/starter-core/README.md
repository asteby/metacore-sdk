# @asteby/metacore-starter-core

Núcleo compartido del starter de Metacore: providers, stores (Zustand), context y hooks que consumen todas las apps Vite+React del ecosistema (ops, link, paneles internos).

Reemplaza al antiguo flujo de "copiar `metacore-starter` a cada repo": ahora se instala como dependencia npm y los cambios propagan automáticamente.

## Estado

Scaffolding inicial (fase 1). El código se migra desde `metacore-starter/src/` en la fase 2.

## Instalación

```bash
pnpm add @asteby/metacore-starter-core
```

Requiere como peer deps: `react`, `react-dom`, `@asteby/metacore-sdk`, `@asteby/metacore-ui`, `@asteby/metacore-auth`, `@asteby/metacore-theme`, `@tanstack/react-router`, `zustand`.

## Uso

_Pendiente — se documentará cuando la fase 2 migre providers y stores._

## Build

```bash
pnpm --filter @asteby/metacore-starter-core build
```

Genera un bundle ESM + CJS con `vite` en modo library y `.d.ts` vía `tsc`.
