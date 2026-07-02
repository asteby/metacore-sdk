---
'@asteby/metacore-runtime-react': minor
---

Soporte de campos `readonly` (kernel v0.64.0) en el diálogo de registro dinámico. Un campo generado por el servidor/sistema (p. ej. `number`/`github_url` que el addon de GitHub rellena tras el create outbound) ahora se OCULTA en el formulario de creación y se muestra DESHABILITADO (input muted, valor visible) en edición. Las vistas de lectura (tabla/kanban/detalle) no cambian.
