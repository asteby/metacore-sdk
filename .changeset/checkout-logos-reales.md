---
"@asteby/storefront-react": minor
---

`/checkout`: `BrandMark` dibuja LOGOS REALES de marcas (FedEx, DHL, Estafeta, UPS, 99 Minutos, J&T, USPS, OXXO, 7-Eleven, Circle K, Soriana, Walmart, Chedraui, BBVA, Santander, Banorte, Citibanamex, HSBC, Scotiabank, Visa, Mastercard, American Express, Mercado Pago, PayPal, Apple Pay, Clip, Farmacias Yza) en lugar de insignias tipográficas. Van incrustados (sin peticiones de red), sin recolorear, sobre una placa blanca con filo sutil válida en tema claro y oscuro. Precedencia: `logo_url` del proveedor > logo incluido > insignia de respaldo (Paquetexpress, Redpack, SPEI y otras sin fuente con condiciones claras; ver `LOGOS.md`). Nuevas claves: `hsbc`, `scotiabank`, `bodegaaurrera`, `farmaciasguadalajara`, `farmaciadelahorro`; nuevo `brandLogo()` y atributo `data-sf-brand-source`. El ancho del logo sigue su forma (alto fijo): la insignia ya no es siempre 3:2. Aumenta el bundle de `/checkout` y `/payments` en ~112 KB (~38 KB gzip) por los logos.
