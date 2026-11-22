---
'@asteby/storefront': minor
'@asteby/storefront-react': patch
---

Textos de la barra de descuento por monto y envío sin ambigüedad: «Te faltan $274.11 para obtener 10 % de descuento» (antes «Añade $274.11 para subir a 10 %», que no decía si era el descuento o el envío lo que subía). Con un escalón ya aplicado: «Te faltan $400 para pasar de 5 % a 10 % de descuento». Las plantillas `discount.next` y `discount.next_upgrade` reciben `{reward}` y `{current}`.
