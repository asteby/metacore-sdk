---
'@asteby/storefront-react': patch
---

Checkout: el primer clic en PAGAR ya no se pierde cuando el formulario del proveedor se reconstruye justo debajo del clic (un `elements.update` que Stripe no aplica en sitio, o un cambio de cliente de pago). Antes el clic pasaba a `processing`, veia su formulario retirado y terminaba en `idle` sin enviar nada ni mostrar mensaje; el boton quedaba muerto hasta el segundo clic. Ahora, si todavia no habia salido nada al servidor, el clic espera al formulario nuevo y se ejecuta sobre el (un solo cobro, un solo token).
