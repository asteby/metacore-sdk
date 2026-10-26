---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

3DS en modal real: `PaymentChallenge` ahora trae estilos por defecto en `payments.css` (`dialog[data-sf-challenge]`: casi pantalla completa, ancho completo en móvil, colores fijos porque la página del banco es blanca), no se cierra con Esc ni clic en el fondo mientras el pago está en curso, y muestra «Cancelar y volver al pago» solo tras `escapeAfterMs` (120 s, WCAG 2.2.1). `PaymentBrick` lo conecta a la nueva `cancelChallenge()` del hook (nuevo intento y formulario limpio). El sondeo del reto sube de 60 s a 5 min. Mensajes nuevos `challenge.escape` y `challenge.escape_hint`.
