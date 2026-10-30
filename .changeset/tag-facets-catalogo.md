---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

`catalog.tagFacets` (contrato 1.24, `GET /storefront/tag-facets`): el siguiente nivel de las etiquetas jerárquicas del catálogo visible (`{ path: ['ford'] }` o `{ key: 'fit:ford/f-150/2020' }`), con tipos `TagFacets`/`TagFacetOption`; el mock lo sirve con las mismas reglas que storefront_api 0.10.0 (prefijos `facetPrefixes`, slugs válidos, `fit:universal` no cuenta, tramos de años). En `@asteby/storefront-react/fitment`, `catalogFromFacets` arma el `VehicleCatalog` del selector desde esas etiquetas (marcas y modelos alfabéticos, alias como `{ gm: 'chevrolet' }`, motores con sus tramos de años), con concurrencia y tope de peticiones.
