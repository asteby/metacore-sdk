---
"@asteby/storefront-react": minor
---

Fitment y accesibilidad (útil para cualquier tienda de piezas):

- `loadCompatibleListing(client, params, vehicle, config?)` (`@asteby/storefront-react/fitment`): listado «solo lo que le queda» con `tags_any` (Storefront API 1.9), filtro duro en el backend, así que búsqueda, filtros, conteos de facetas, total y paginación salen con el vehículo aplicado. Cuando nada le queda en la primera página, `catalogTotal` dice cuántas hay sin el vehículo con la misma búsqueda (una consulta de 1 producto; si falla, `null`). `filteredOnClient` avisa si el backend ignoró `tags_any` (y entonces no se devuelve su `total_count`). El `tags_any` propio de `params` se sustituye por el del vehículo (el backend los suma con OR); la consulta de `catalogTotal` lo conserva.
- `FitmentConfig.makeAliases?` (opcional, sin distinguir mayúsculas; p. ej. `{ gm: 'chevrolet', vw: 'volkswagen' }`): `fitStatus` acepta la etiqueta con cualquier nombre equivalente de la marca y `fitFilterTags` los incluye (máx. 5 etiquetas con la universal). Nuevos `makeVariants` (sin repetidos) y `fitKeyVariants`. Sin alias, igual que antes.
- **Cambio de comportamiento** de `fitStatus` y `withFit`: si la pieza no tiene etiquetas `fit:*` y se pasa un `Vehicle` completo (con los tipos correctos), antes daban `unknown` y ahora leen la tabla de compatibilidad (`compatAttribute`) de forma conservadora (`fitFromTable`):
  - `fits` solo con una fila de su marca o alias, modelo exacto, años AAAA o AAAA-AAAA que lo cubren, motor confirmado y sin nota. El motor se compara entero por alternativa: «1.5 L4» y «1.5L» son un 1.5; «1.5 TURBO» o «1.9 TDI» no se confirman para un motor sin calificar.
  - `no` si la tabla no nombra su marca, o si todas las filas de su modelo son claramente de otros años u otro motor.
  - `unknown` en todo lo demás: años en otra forma, motor con calificadores, una nota que pone una condición o su marca con otro modelo escrito distinto.

  Nuevos `fitFromTable`, `rowIsVehicle`, `rowsNamingVehicle` y `parseRowYears`. Con solo la clave (`{ key }`) o sin tabla, el resultado sigue siendo `unknown`, y las etiquetas siempre mandan.
- `BrandMark` con logo y `title`: el nombre comercial va en el `alt` de la imagen (antes iba en un `role="img"` envolvente con la imagen `alt=""`). El lector de pantalla lo anuncia una sola vez, como antes, y las auditorías automáticas dejan de contar esos logos como «imágenes sin texto alternativo». El modo decorativo (sin `title`) no cambia.
