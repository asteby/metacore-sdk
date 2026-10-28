---
'@asteby/metacore-pwa': minor
---

`metacorePWA({ brand })`: el manifiesto web se rellena desde la marca de producto (objeto o ruta a un JSON con la forma de `/api/brand`): nombre, `short_name`, descripción, colores y iconos `any`/`maskable`/`monochrome`; los campos explícitos de `manifest` siguen ganando. Se exporta `brandToManifest`. Deprecación: sin `brand` ni `manifest.name` se conservan los defaults actuales ("Metacore App", tema lima) y se avisa una vez en el build; pasarán a ser neutros en un próximo major.
