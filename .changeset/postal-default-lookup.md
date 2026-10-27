---
'@asteby/storefront': patch
'@asteby/storefront-react': minor
---

`AddressFields` consulta por defecto el catálogo del paquete de región (`client.postalCode`, Storefront API) del `<StorefrontProvider>`; la prop `lookupPostalCode` sigue sobreescribiéndolo. `RegionPostalCode.cities` (opcional, solo si el CP cubre varios municipios). Nuevo `createStorefrontPostalProvider(client)` en `/postal`; `createOsmProvider` queda obsoleto para tiendas (OSM solo sugiere, nunca bloquea campos).
