---
"@asteby/metacore-runtime-react": patch
---

El botón de escaneo también aparece siempre (sin `isCameraScanSupported()`) en
los campos `dynamic_select` (`dynamic-select-field`) y en el modal de
crear/editar registro (`dialogs/dynamic-record`), no sólo en el input de texto.
El renglón de una orden de compra usa `dynamic_select`, así que ahí el icono de
cámara no aparecía en escritorio pese a declarar `scan`. Ahora los tres
renderers son consistentes con el POS.
