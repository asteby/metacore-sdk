---
'@asteby/metacore-sdk': minor
---

`brand`: el manifiesto de marca de producto gana campos opcionales (`short_name`, `description`, `names`, `storage_namespace`, `version`, `theme`, `assistant` y los assets `logo_dark`, `favicon`, `maskable`, `monochrome`, `animated`, `animated_dark`, `assistant`). Nuevos `fetchBrand`, `parseBrand` (sanea colores y URLs), `pickLogo` (cadena de fallback claro/oscuro) y `brandStorageKey`. Aditivo: spec 1 sin cambios.
