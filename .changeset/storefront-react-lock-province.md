---
"@asteby/storefront-react": minor
---

storefront-react/checkout: `AddressFields` acepta `lockProvinceOnFill` — una vez que `lookupPostalCode` llena el campo de estado (sin pisar nunca lo que ya escribió el comprador), lo bloquea: un `<input>` queda de solo lectura y un `<select>` (con `provinces`) queda deshabilitado con un campo oculto que sigue enviando su valor. El comprador corrige el estado corrigiendo el código postal. Por omisión `false`: el campo llenado sigue editable como antes. Marca el elemento con `data-sf-locked="1"` para que la tienda lo estilice si quiere.
