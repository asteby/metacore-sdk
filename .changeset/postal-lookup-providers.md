---
'@asteby/storefront-react': minor
---

Búsqueda de código postal con proveedores enchufables: `@asteby/storefront-react/postal` (`createPostalLookup({ providers })`, `createCatalogProvider`, `createOsmProvider`) con orden, fallback, caché por CP y `source` en la respuesta; el proveedor OSM (Nominatim) valida país, CP y estado oficial, limita a 1 req/s y tiene timeout corto. `AddressFields` muestra una nota clara («No encontramos ese código postal…») cuando el CP no se resuelve y deja Estado y Ciudad editables (`messages.postalCodeNotFound`).
