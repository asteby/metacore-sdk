---
"@asteby/metacore-genui": minor
"@asteby/metacore-maps": minor
---

El bloque `map` de genui/v2 admite `popup` (columnas de la fuente que se muestran al seleccionar un punto, max 8), `precision` (`exact|city|country`, constante), `precision_field` (columna con la precision por fila; excluyente con `precision`) y `area_field` (columna con el area o codigo, p. ej. `country_iso`). Mismos nombres y semantica que `MapView` del kernel (metacore-kernel#632 y #634). Esquema, vectores de conformidad (2 validos, 5 invalidos), tipos generados y `validate-v2.ts` sincronizados con el kernel; `popup`, `precision_field` y `area_field` solo aplican con `source`. `normalizeMapPoints` rellena `GenUIMapPoint.precision` y `area` (exports nuevos `MAP_PRECISIONS` y `MapPrecision`) y, con `popup`, los detalles son esas columnas en ese orden; sin `popup` el comportamiento no cambia. El renderer `map` de `@asteby/metacore-maps` pasa `precision` y `area` a `MapPointItem` (burbujas por precision, spiderfy) y el titulo del punto sigue siendo `fields.label`.
