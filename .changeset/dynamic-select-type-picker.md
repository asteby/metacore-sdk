---
'@asteby/metacore-runtime-react': patch
---

fix(runtime-react): render `dynamic_select` por `type`, no solo por `ref`/`widget`

El renderer editable del `DynamicRecordDialog` solo pintaba el picker cuando
`getFieldRef(field)` o `field.widget === 'dynamic_select'`. Un campo con
`type: 'dynamic_select'` cuya fuente vive en `optionsConfig.source` (sin `ref`
FK — p. ej. `currency_code` → `currencies` / `POSOrgCurrency`) degradaba a un
input de texto libre. Se agrega `field.type === 'dynamic_select'` a la
condición; `DynamicSelectField` ya resuelve la fuente vía `resolveOptionsSource`
(ref o `optionsConfig.source`).
