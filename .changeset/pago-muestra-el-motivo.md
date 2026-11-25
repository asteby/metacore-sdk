---
"@asteby/storefront": minor
"@asteby/storefront-react": minor
---

El pago muestra el MOTIVO del error, en cualquier tienda. Antes, cualquier fallo del cobro que el navegador no reconocía salía como el mensaje genérico de tarjeta («No pudimos procesar tu pago… revisa los datos de tu tarjeta») y vaciaba el formulario: un teléfono mal escrito parecía un problema de la tarjeta, y solo se descubría leyendo los logs del servidor. El servidor ya clasificaba el error y mandaba `kind`, `field` y `message`, pero el navegador los tiraba.

- `paymentErrorView` respeta el `kind` y el `message` que manda la tienda: nuevos `validation` (con su `field`), `provider_declined` y `merchant_config`; antes todos caían en `generic`. `PaymentErrorView.field` dice qué campo del pedido se rechazó. Nuevos textos es/en `error.validation`, `error.provider_declined`, `error.merchant_config`.
- `PaymentHttpError` conserva `field` (`createFetchTransport` y el transporte resiliente).
- `payErrorResponse`: un `validation` con campo conocido (teléfono, correo, código postal, nombre, dirección, ciudad, estado) sale con el texto que dice cómo corregirlo, en el idioma de la tienda, en vez del texto técnico de OPS; un campo desconocido conserva el de OPS y `ownMessage` sigue ganando. Nuevo `validationFieldMessage()`.
- `useEmbeddedPayment`: ante un `validation` NO se vuelve a montar el formulario de la tarjeta (no se cobró nada y la tarjeta no se usó: el comprador corrige el campo y paga con lo que ya escribió). `error.field` queda disponible para marcarlo.
- Cambio de comportamiento: un 400/422 `validation` ya no es `generic` (había una prueba que lo fijaba así).
