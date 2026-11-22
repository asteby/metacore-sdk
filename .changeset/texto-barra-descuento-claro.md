---
'@asteby/storefront': minor
'@asteby/storefront-react': minor
---

Textos de la barra de descuento por monto y envío sin ambigüedad: «Te faltan $274.11 para obtener 10 % de descuento» (antes «Añade $274.11 para subir a 10 %», que no decía si era el descuento o el envío lo que subía). Con un escalón ya aplicado: «Te faltan $400 para pasar de 5 % a 10 % de descuento». Las plantillas `discount.next` y `discount.next_upgrade` reciben `{reward}` y `{current}`.

`OrderSummary` muestra una sola línea «Descuento» con el total del servidor (ahí suman la promoción por monto, los cupones, etc.) en lugar de una línea por descuento con su nombre interno («Descuento por monto (tienda)»).

Bloque único de descuentos: `DiscountPanel` (`@asteby/storefront-react/promotions`) compone las barras de descuento por monto y envío gratis (`CartProgressBars`) con el campo de cupón (`CheckoutDiscountCode`/`DiscountCodeForm`) y se monta igual, solo con props, en el resumen del pago (`layout="aside"`), la página del carrito (`"cart"`) y el mini-carrito (`"drawer"`: barras compactas y cupón plegado). Todo sale de `Cart.promotions` y `Cart.discount_codes`; sin lógica de descuento en la tienda.

`OrderTotals` (`@asteby/storefront-react/checkout`): subtotal, una línea «Descuento» con el total, desglose por origen cuando suman 2 o más («Promoción por monto», «Cupón CÓDIGO»; nunca el nombre interno), envío, impuestos y total. `OrderSummary` lo usa y la página del carrito de la tienda puede montarlo igual. Mensajes nuevos `discountAutomatic` y `discountCode`.

Estilos: `checkout.css` da jerarquía al resumen (total grande, descuento en el color de éxito, nota de impuestos); `promos.css` trae el estilo del cupón (campo y botón en una fila) y del panel, antes copiado en la `app.css` de cada tienda. `display` de las barras y del panel va en `@layer components` para que utilidades de la tienda (`hidden`, `lg:hidden`) puedan ocultarlos.
