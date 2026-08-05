---
"@asteby/metacore-runtime-react": patch
---

El escaneo por cámara (`scan` opt-in) ahora también funciona en el modal de **crear/editar registro** (auto-CRUD), no solo en los modales de acción. Su renderer de campos es SEPARADO del de dynamic-form, así que el botón de escaneo en el input de texto (ej. el CÓDIGO/SKU al crear producto o variante) se cableó también ahí — antes nunca aparecía en ese modal.
