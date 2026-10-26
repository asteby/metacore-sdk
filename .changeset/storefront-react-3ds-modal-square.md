---
'@asteby/storefront-react': patch
---

El modal del reto 3DS (`<PaymentChallenge>`) ahora es cuadrado y centrado: ancho `min(36rem, 100% - 2rem)`, alto máximo `min(90dvh, 40rem)`, centrado vertical y horizontal, overlay oscuro y scroll interno solo en el cuerpo (iframe); en móvil (<480px) ocupa casi toda la pantalla con 1rem de margen. Sin cambios en la lógica de cierre.
