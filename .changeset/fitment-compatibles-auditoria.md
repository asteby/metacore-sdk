---
"@asteby/storefront-react": minor
---

Fitment y accesibilidad (auditoría UI/UX de ProtekAuto, 4-nov; útil para cualquier tienda de piezas):

- `loadCompatibleListing(client, params, vehicle, config?)` (`@asteby/storefront-react/fitment`): listado «solo lo que le queda» con `tags_any` (Storefront API 1.9), filtro duro en el backend, así que búsqueda, filtros, conteos de facetas, total y paginación salen con el vehículo aplicado. Cuando no hay ninguna compatible en la primera página, `catalogTotal` dice cuántas hay sin el vehículo con la misma búsqueda (una consulta de 1 producto; si falla, `null`). Nunca listar una página sin filtrar y descartar en el cliente (la búsqueda «balata» daba 0 piezas junto a «FRITEC 725» y «Ver más productos»).
- `FitmentConfig.makeAliases` (p. ej. `{ gm: 'chevrolet' }`): `fitStatus` acepta la etiqueta con cualquier nombre equivalente de la marca y `fitFilterTags` los incluye (máx. 5 etiquetas con la universal). Nuevos `makeVariants` y `fitKeyVariants`. Sin alias, igual que antes.
- `fitStatus` sin etiquetas `fit:*` y con un `Vehicle` completo compara con la tabla de compatibilidad del producto (`compatAttribute`, dato del backend): fila con su marca/alias, modelo, año y, si la fila lo dice, motor → `fits`; tabla que no nombra su marca y modelo (o solo otros años) → `no`; filas de su modelo sin años legibles → `unknown`. Nuevos `fitFromTable` y `rowIsVehicle` (la misma regla para resaltar «Tu vehículo» en la tabla). Con solo la clave (`{ key }`) o sin tabla, `unknown` como antes; las etiquetas siempre mandan.
- `BrandMark` con logo y `title`: el nombre comercial va en el `alt` de la imagen (antes en un `role="img"` envolvente con la imagen `alt=""`). Un lector de pantalla lo anuncia igual una sola vez, y las auditorías automáticas ya no cuentan esos logos como «imágenes sin texto alternativo». Decorativo (sin `title`): sin cambios.
