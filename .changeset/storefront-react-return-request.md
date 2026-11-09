---
"@asteby/storefront-react": minor
---

Devoluciones en la cuenta del comprador: `ReturnRequestForm` (`@asteby/storefront-react/account`), un `<form method="post">` sin estilos propios (`classNames`, `data-sf-return-*`) que funciona sin JavaScript, con casilla y cantidad por línea devolvible, motivo, «Notas» (500 caracteres, contador opcional) y errores por campo; y `createReturnRequestAction({ storefront, readCustomerToken })` (`@asteby/storefront-react/account/server`), que valida contra el pedido (al menos una línea, cantidad entera 1..máx, motivo permitido, notas ≤ 500), llama `customer.requestReturn` con `Idempotency-Key` estable y devuelve `ReturnRequestActionData` con códigos tipados. Aditivo: nada existente cambia.
