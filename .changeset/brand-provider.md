---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-app-providers": minor
---

Marca del cliente para cualquier producto metacore.

- `@asteby/metacore-runtime-react`: `BrandProvider`, `useBrand()` y `BrandDocumentSync` (título, favicon y `--brand-primary`/`--brand-accent`), también en el subpath ligero `@asteby/metacore-runtime-react/brand` que solo depende de React. Contexto puro, sin fetch; sin provider la marca es vacía (nombre `''`, nunca un nombre de producto fijo). `LicenseGate` usa `useBrand()` cuando no recibe la prop `branding`.
- `@asteby/metacore-app-providers`: `PlatformConfigProvider` envuelve a sus hijos en `<BrandProvider value={toBrand(config)}>`; props nuevas `syncBrandDocument` (default `false`) y `resolveBrandAsset`. `PlatformBranding` gana `brand_locked?` y `brand_source?`. Exporta `toBrand` y reexporta `useBrand`. `@asteby/metacore-runtime-react` (>=53.2.0) pasa de peer opcional a peer requerido, porque el índice importa su subpath `/brand`.
