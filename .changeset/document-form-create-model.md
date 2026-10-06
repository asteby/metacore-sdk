---
"@asteby/metacore-runtime-react": minor
---

`document_forms.types[].create_model`: un tipo puede delegar su alta a otro modelo (p. ej. `customers.Invoice`). «Crear» no pinta un formulario: llama a `onDelegateCreate({ model, type })` del host, que abre la página de ese modelo con su alta abierta.

- `DocumentFormDialog` y `DynamicCRUDPage` aceptan `onDelegateCreate`. Sin él, los tipos delegados no se ofrecen: una vista acotada a uno de ellos sigue sin «Crear», como hasta ahora.
- Nuevos exports: `delegatedCreate(forms)`, `withoutDelegatedTypes(forms)` y el tipo `DelegatedCreate`.

Retest r4 de Pitsline: Documentos fiscales → Facturas se había quedado sin «Crear» porque FiscalDocument no tiene formulario de factura. La factura nace en customers y se timbra después.
