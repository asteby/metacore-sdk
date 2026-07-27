---
'@asteby/metacore-runtime-react': minor
---

Soporta `visible_when` a nivel de SECCIÓN en `form_layout` (kernel v0.84.0). Cuando una sección declara un predicado `visible_when` que evalúa falso contra los valores actuales del formulario, la sección se oculta por completo junto con sus campos; en modo wizard (steps) ese paso desaparece de la secuencia de navegación sin romper Anterior/Siguiente ni el submit del último paso. Reutiliza el mismo evaluador (`getVisibleWhen`/`evaluateVisibleWhen`) que ya usan los campos, tolerando snake_case y camelCase. El `visible_when` de cada campo se sigue respetando dentro de una sección visible, y sin `visible_when` de sección el comportamiento es idéntico al actual.
