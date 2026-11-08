---
"@asteby/storefront-react": minor
---

Adaptador de Stripe: ninguna billetera se ofrece por defecto, Link incluido. El bloque "Save my information for faster checkout" de Link pide un teléfono y bloquea el pago cuando se deja marcado. Se enciende con la opción del adaptador `wallets: { link: 'auto' }` o, por mercado, con `link: true` en la opción `card` de `PaymentClient.options` (el servidor puede apagarlo con `link: false`). Un Stripe.js que no conozca la llave de Link no tumba el formulario: se reintenta con las llaves de siempre. Nuevos exports: `stripeWallets`, tipo `StripeWallets`.
