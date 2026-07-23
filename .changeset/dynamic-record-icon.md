---
'@asteby/metacore-runtime-react': patch
---

El modal de crear/editar registro (DynamicRecordDialog) ahora renderiza el
selector de íconos para campos con tipo/widget "icon". Antes solo dynamic-form
lo manejaba, así que en el modal el campo caía a un input de texto vacío.
