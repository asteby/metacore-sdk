---
"@asteby/metacore-runtime-react": patch
---

DocumentEditor: los selects con opciones condicionadas (`options[].when`) solo ofrecen las que aplican y ajustan solos un valor que dejó de aplicar.

Con método de pago PPD, la forma de pago pasa sola a «99 · Por definir» (la única que aplica) y el alta de la factura lleva los dos valores; al volver a PUE regresa al default del campo. Vale igual si el cambio viene de la contraparte o de «Cargar desde…».
