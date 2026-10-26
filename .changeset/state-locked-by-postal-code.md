---
"@asteby/storefront-react": minor
"@asteby/storefront": minor
---

El estado de la dirección es el de su código postal. `AddressFields` ahora bloquea el estado por omisión cuando `lookupPostalCode` lo resuelve (`lockProvinceOnFill` pasa a `true`; `false` conserva lo anterior): candado visual, tooltip y nota «Definido por tu código postal» (`messages.provinceLocked`) y una acción discreta «Cambiar código postal» (`messages.changePostalCode`). El bloqueo ya no es una trampa: al editar el código postal se libera y se limpia lo que el lookup había llenado (estado, ciudad, colonia), también cuando el código nuevo no resuelve nada; un `<select>` recupera su `name` y pierde el campo oculto espejo. Nunca borra lo que el comprador escribió. Además `@asteby/storefront` agrega `client.postalCode(zip)` (`GET /storefront/region/postal-code`, `RegionPostalCode`), la fuente natural del `lookupPostalCode` (misma tabla y nombres con que el servidor re-valida estado y CP en `storefront_cart`; `null` si el CP no está en el catálogo).
