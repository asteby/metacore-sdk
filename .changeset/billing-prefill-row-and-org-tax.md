---
"@asteby/metacore-runtime-react": patch
---

Acciones abiertas desde una fila y buscador del host en documentos (retest Pitsline 2026-10-05)

- Un campo de acción que apunta al MISMO modelo de la fila y que la fila no tiene como columna se precarga con el id de esa fila: «Registrar pago» desde una factura abre con la factura elegida (`invoice_id` → Invoice). Una columna propia vacía (`parent_id` sin padre) no se siembra.
- `DocumentFormDialog` aplica el IVA de la org (`OrgRuntimeProvider` `taxRate`) a los productos del buscador del host (`searchProducts`) que no traen su tasa; antes sólo el buscador por defecto lo hacía y el renglón entraba sin IVA.
