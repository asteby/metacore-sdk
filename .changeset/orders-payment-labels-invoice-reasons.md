---
'@asteby/storefront-react': minor
'@asteby/storefront': patch
---

Pedidos de la cuenta: método de pago legible y motivos reales de la factura.

- `PaymentSummary` y `RefundList` ya no muestran la clave cruda del proveedor (`Card`, `credit_card`, `oxxo`): `paymentLabel` arma «Tarjeta Visa •••• 1234», «Tarjeta de débito», «Efectivo en OXXO», «Transferencia SPEI», «Billetera digital»… en es/en (`payment.method.*`, ajustables con `messages`), usa `family`, `brand` y `last4` si el servidor los manda, respeta una frase que el servidor ya escribió con su detalle y cae a «Medio de pago», nunca a la clave. Extensible por tienda/organización con `methodLabel`. `PaymentInfo` gana `brand` y `last4` (opcionales).
- `loadFiscalContext` devuelve `reason` (`available`, `off`, `no_region`, `unknown`, `unreachable`) en vez de un solo «no disponible». Un servidor que no publica `capabilities.invoicing` es `unknown`: ya no se afirma que la tienda no factura.
- `InvoiceStatusCard`: nuevo `availability={ctx.reason}`. Solo `off`/`no_region` (el servidor dice que no hay facturación) muestra «Facturación aún no activa»; con `unknown`/`unreachable` decide el resumen del propio pedido (`can_request`, etapa, folio) y, sin nada que mostrar, un texto neutro (con «Actualizar» si no se pudo consultar). Nuevos `windowDays` («Puedes pedirla hasta N días después de la compra») y `testMode` (aviso de facturación en pruebas, `InvoicingCapabilities.test_mode`). El texto de `unavailable` ya no dice que la tienda no emite facturas.
