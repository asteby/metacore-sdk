---
"@asteby/storefront-react": minor
---

El formulario de tarjeta de Stripe puede abrirse con el país del mercado: nueva opción `country` (ISO 3166-1 de 2 letras) en `useEmbeddedPayment`/`PaymentBrick` (y `brickProps` de `PaymentMethodSection`) que llega al adaptador como `defaultValues.billingDetails.address.country` del Payment Element. Sin ella Stripe deduce el país de la IP del comprador y una tienda de EE. UU. mostraba «Mexico» preseleccionado. Es solo el valor inicial (el comprador puede cambiarlo) y un país mal formado se ignora para no tirar el formulario. Pruebas y README actualizados.
