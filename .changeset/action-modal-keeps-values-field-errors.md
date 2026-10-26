---
'@asteby/metacore-runtime-react': patch
---

Diálogo de acciones con `fields`: un envío fallido ya no borra lo escrito (el formulario se siembra una vez por apertura, no cuando la lista vuelve a pintar con otro `record={{}}`/`action`), y el campo que nombra el servidor (`errors` o `error.field`) queda en rojo con `aria-invalid`, mensaje debajo, foco y scroll al primero. Contrato en `docs/action-errors.md`.
