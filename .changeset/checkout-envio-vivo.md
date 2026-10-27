---
'@asteby/storefront-react': minor
---

Checkout de un solo paso, envío que se cotiza solo: `useAutoQuote` con antirrebote de 400 ms, `initial` (tarifas ya leídas para la dirección guardada), `change` (aviso si la re-cotización cambió el precio), `noCoverage` y `quoting`; nuevo `<DeliveryStatus>` (idle / calculando con spinner discreto / error con reintento / sin cobertura / cambio de precio, con altura reservada y región `aria-live`); `PaymentMethodSection` acepta `earlyCard` (el formulario de tarjeta y su SDK cargan al entrar y el total se actualiza en sitio) y `holdLabel` (botón bloqueado con «Calculando envío…»); `OrderSummary` acepta `quoting`.
