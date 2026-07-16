---
"@asteby/metacore-runtime-react": patch
---

Preview automático del registro en el modal de confirmación de acciones de fila.

Al confirmar una row-action con `confirm` (p. ej. aceptar/rechazar un traspaso), el
`ConfirmActionDialog` ahora muestra un resumen compacto y de solo lectura del registro
que va a afectar, para no confirmar a ciegas. Es 100% del SDK y genérico: se apoya en la
metadata de tabla del modelo (labels + display hints, leída del cache o con un único fetch
a `/metadata/table/<model>`) y en los siblings de relación que la tabla ya resolvió sobre
la fila. La heurística surface relaciones resueltas a su label, campos line-items (jsonb,
como `Transfer.items`, renderizados producto × cantidad) y un puñado de escalares de
identidad; omite `id`, `organization_id`, timestamps y los `*_id` crudos sin label. Se
degrada solo: si no hay nada útil que mostrar, no renderiza la sección.
