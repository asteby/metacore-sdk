---
"@asteby/storefront-react": patch
---

fix(payments): el primer clic en PAGAR ya no muestra «Revisa los datos de tu tarjeta.» cuando el Brick de Mercado Pago falla la primera lectura (`getFormData`) aunque `card_tokens` respondió 201. El adaptador relee el formulario UNA vez antes de rendirse; todavía no se ha enviado nada al servidor de la tienda, así que no cambia la llave de idempotencia ni repite cobros (reglas de #1252 intactas).
