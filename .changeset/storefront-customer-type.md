---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

Tipo de cliente (`customer_type`: `final`, `refaccionario`, `taller`, `flotillas`), un campo opcional para clasificar al comprador (marketing y, más adelante, listas de precios; no cambia precios). `@asteby/storefront`: tipo `CustomerType`, `CUSTOMER_TYPES`, `isCustomerType`, campo en `Customer`, `customer.register`, `createSession` y `carts.setBuyer`, y el mock lo acepta y rechaza valores fuera de la lista (400, `customer_type`). `@asteby/storefront-react`: `AccountAuth` y `ContactFields` aceptan `customerTypes` (valor del contrato y texto de la tienda) y pintan un select con `final` por omisión; `createAuthAction` lo manda al registro. Sin `customerTypes` todo queda como antes.
