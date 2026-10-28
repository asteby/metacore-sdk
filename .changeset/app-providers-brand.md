---
'@asteby/metacore-app-providers': minor
---

Nuevo subpath `@asteby/metacore-app-providers/brand` (no entra en el barrel principal): `ProductBrandProvider` (primer frame desde `window.__PRODUCT_BRAND__` o localStorage, revalida con ETag), `useProductBrand`, `useBrand` (identidad efectiva producto + organización, gana el campo no vacío de la org), `BrandLogo` (variante oscura automática) y `BrandMark` (animado propio o barrido CSS). `applyBranding` y `PlatformConfigProvider` aceptan un `theme` de producto opcional (`--brand-gradient`, `--brand-foreground`, primario oscuro explícito); sin theme el resultado no cambia. `PlatformBranding` gana `logo_dark`, `logo_mark`, `pwa_name`, `pwa_short_name` y `mascot`. Requiere `@asteby/metacore-sdk >= 3.18` solo si se usa el subpath (peer opcional).
