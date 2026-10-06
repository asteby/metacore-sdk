---
"@asteby/metacore-runtime-react": minor
---

Retest Pitsline r5 (nota de crédito y acciones):

- «Crear desde»: un renglón de origen sin descripción propia (InvoiceItem solo
  lleva el producto) se nombra con la etiqueta del producto que resuelve el
  host, y un renglón con producto ya no exige texto para guardar. El fallo de
  `source-lines` (404, 400/500 de un host sin la ruta) cae a la relación.
- `ActionModalDispatcher` anuncia la mutación ahora y otra vez cuando el
  servidor asienta lo derivado (`emitRecordMutationSettled`,
  `RECORD_MUTATION_SETTLE_DELAYS`): la lista y la pestaña REP se refrescan
  tras timbrar o registrar un pago.
- Un selector sembrado con el id de la propia fila muestra su folio
  («Factura a abonar: FAC-00015») y no el UUID.
