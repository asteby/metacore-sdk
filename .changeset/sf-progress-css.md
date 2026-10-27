---
"@asteby/storefront-react": patch
---

fix(storefront-react/ui): los estilos de `NavigationProgress`, `Skeleton` y `Spinner` salen en su propia hoja, `@asteby/storefront-react/progress.css` (antes iban dentro de `ui.css`, que trae también `Select` y `Swatch`). Quien no use esas piezas no carga CSS de más.
