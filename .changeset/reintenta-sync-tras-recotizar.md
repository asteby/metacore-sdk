---
"@asteby/storefront-react": patch
---

Checkout: tras una recotización de envío con la misma tarifa (mismo `rate.id`, p. ej. tarifa fija) el formulario ya no se queda en «Las tarifas de envío se actualizaron» / «Actualizando el total…» hasta que el comprador reescribe el código postal.

- `PaymentMethodSection`: nueva prop `syncVersion`. Un `syncDelivery` que terminó en `'requote'` se vuelve a ejecutar cuando `syncVersion` cambia, aunque `delivery` siga igual (antes el efecto solo dependía de `[wantSync, delivery]`, así que con el mismo id nadie reintentaba).
- `useAutoQuote` / `useLiveDelivery`: nuevo `quoteVersion` (cuenta las cotizaciones exitosas). Pásalo a `PaymentMethodSection syncVersion={live.quoteVersion}`.
- Prueba de guardia: cargar con dirección guardada cotiza sola al montar (con o sin tarifas en la página, con o sin consulta de CP).

Requiere revisión adversarial (decide cuándo se guarda la entrega y se relee el total).

Con `syncVersion`, una entrega rechazada con `'requote'` no se reenvía al instante con la misma cotización (antes salía un segundo PUT en cuanto cambiaba la dependencia y una tienda que cuenta rechazos lo tomaba como fallo real); se reenvía una sola vez cuando llega una cotización más nueva. Una cotización nueva que conserva el id (cambió el CP) guarda la entrega una vez más para releer el total. Sin la prop se conserva el comportamiento anterior.
