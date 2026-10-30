---
'@asteby/storefront': minor
---

El tipo de cliente lo define cada organización: `customer.capabilities()` puede traer `customer_types` (`{ options: [{ value, label, requires_review? }], default? }`; ausente = la tienda no muestra el campo). Nueva ayuda `customerTypeOptions(caps)` (limpia la lista, descarta códigos inválidos y repetidos, y preselecciona el `default` de la organización y no el primero) y `MOCK_CUSTOMER_TYPES` para ensayar. En el simulador, con lista, un código fuera de ella se ignora sin error, como el servidor real. Declarar un tipo es una solicitud: no cambia precios por sí solo.
