---
"@asteby/storefront": minor
---

`applyDiscountCodeIntent(sf, cartId, raw, { locale })`: la mitad servidor del campo de cupón, compartida por el carrito y el pago (valida el formato, guarda el código —vacío lo quita— y devuelve el carrito de OPS o `{ ok:false, status, error }` con el texto en el idioma del mercado, nuevo mensaje `code.invalid`). Antes cada tienda repetía esa lógica en la acción del carrito y la del pago.
