---
'@asteby/storefront-react': minor
---

`AccountAuth` toma la lista de tipos de cliente de `capabilities.customer_types` (la prop `customerTypes` sigue funcionando y manda sobre ella), preselecciona el `default` de la organización y avisa «Validaremos tu tipo antes de aplicar precios especiales» cuando algún tipo se valida (es/en). `ContactFields` suma `customerTypeDefault` y `customerTypeReview` para el pago de invitado. Sin lista no se pinta ningún campo.
