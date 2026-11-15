---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

Cupones en la tienda, estándar para todas: `@asteby/storefront` añade `discountCodeFeedback`, `discountCodeMessage`, `normalizeDiscountCode`, `DISCOUNT_CODE_REASONS`/`DISCOUNT_CODE_PATTERN` y los textos `code.*` (es/en) en `promotionMessages`, con un mensaje claro por cada motivo de OPS (vencido, agotado, compra mínima, no combinable…). `@asteby/storefront-react/promotions` añade `<DiscountCodeForm>`: campo accesible para carrito o checkout que publica el código (funciona sin JavaScript; acepta el `Form` de React Router), anuncia el cupón aplicado con «Quitar» y muestra el motivo del rechazo que decide OPS. El cálculo sigue en el servidor.
