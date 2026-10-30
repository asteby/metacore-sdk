---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

Tipo de cliente (`customer_type`), un campo opcional para clasificar al comprador (marketing y, más adelante, listas de precios; no cambia precios). Es un texto corto (minúsculas, números, `-`, `_`, hasta 32) cuyo vocabulario define cada tienda: la plataforma no fija una lista, y una tienda que no lo usa no ve ningún cambio. `@asteby/storefront`: tipo `CustomerType`, `isCustomerType`, campo en `Customer`, `customer.register`, `createSession` y `carts.setBuyer`; el mock lo acepta y rechaza un valor mal formado (400, `customer_type`). `@asteby/storefront-react`: `AccountAuth` y `ContactFields` aceptan `customerTypes` (valor y texto de la tienda) y pintan un select con la primera opción elegida; `createAuthAction` lo manda al registro. Sin `customerTypes` todo queda como antes.
