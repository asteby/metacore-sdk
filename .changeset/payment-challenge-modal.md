---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

3DS en modal real: `PaymentChallenge` ahora trae estilos por defecto en `payments.css` (`dialog[data-sf-challenge]`: casi pantalla completa, ancho completo en móvil, colores fijos porque la página del banco es blanca), no se cierra con Esc ni clic en el fondo mientras el pago está en curso, y muestra «Cancelar y volver al pago» solo tras `escapeAfterMs` (120 s, WCAG 2.2.1). `PaymentBrick` lo conecta a la nueva `cancelChallenge()` del hook: el resultado queda DESCONOCIDO (el banco pudo aprobar), así que conserva la llave de idempotencia, bloquea un pago nuevo (`blocked` / `payment_in_progress`) y verifica con `refresh` hasta la respuesta del banco; solo un rechazo, vencimiento o cancelación definitivos dan un intento nuevo. Si el navegador cierra el diálogo de todos modos (segundo Esc, gesto atrás de Android), la página ofrece volver a la verificación. El sondeo del reto sube de 60 s a 5 min. Mensajes nuevos `challenge.escape`, `challenge.escape_hint` y `challenge.left`.
