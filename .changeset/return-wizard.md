---
"@asteby/metacore-runtime-react": minor
---

`ReturnWizard` («Devolver mercancía», benchmark DEV-2): un solo asistente para POS, Pedido, Factura, RMA y OT. Renglones con tope vendido − devuelto, condición vendible/defectuoso → stock/merma/garantía, paso «Recibir» dentro del asistente cuando no hay almacén (PIT-021), reembolso con `RefundDestination` (nuevo destino `transfer`), estados de RMA con motivo obligatorio al rechazar/cancelar (`canTransitionRma`) y NC CFDI con relación 01/03 automática (`creditNoteRelation`). Helpers puros: `computeReturnTotals`, `validateReturnChoices`, `serializeReturn`, `returnSteps`.
