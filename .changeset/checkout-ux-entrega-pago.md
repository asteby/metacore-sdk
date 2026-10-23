---
"@asteby/storefront-react": minor
---

Checkout más claro (auditoría UX de /pagar):

- `/checkout`: `DeliveryOptions` acepta `layout="recommended"`: hasta tres tarifas con etiqueta (más económica, más rápida y «Recomendado», la de mejor equilibrio precio-tiempo) y el resto en «Ver más opciones (N)» agrupado por paquetería sin repetir el nombre; descarta servicios repetidos; se abre solo si la tarifa elegida está dentro (también sin JavaScript). Nuevos `recommendRates()` y `dedupeRates()`. `error` + `onRetry` para una cotización fallida. Por omisión (`layout="list"`) todo sigue igual. Texto de `partial` más amable.
- `/payments`: el formulario de tarjeta se abre debajo de su propia fila (antes, después de todas las filas); la elección de pago y el punto de efectivo se recuerdan por carrito en `sessionStorage` (`rememberChoice`, por omisión sí con `scope`); `cashPointsVisible` limita los puntos a la vista; el correo del formulario de la página se pasa al Brick (`payerEmailField`, por omisión `email`) y Mercado Pago ya no muestra «Completa tu información / E-mail»; en página oscura el Brick monta su tema `dark` (`readPaymentScheme`, `colorScheme` en el adaptador) y lee más tokens `--sf-pay-*`. Botón: «Generar ficha de pago» con efectivo (`placeOrderCash`) y «Elige la entrega para continuar» sin entrega (`chooseDelivery`).
