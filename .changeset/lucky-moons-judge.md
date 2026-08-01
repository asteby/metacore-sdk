---
'@asteby/metacore-runtime-react': minor
---

Subtablas de relación: embebido opt-in (`embed`) + paginación y búsqueda

El modal de registro embebía TODAS las relaciones `one_to_many` del modelo, y cada subtabla pedía el modelo hijo completo (`/data/<hijo>?f_<fk>=eq:<id>`, sin `page`/`per_page`). Abrir "Editar Almacén" cargaba miles de existencias y traspasos dentro de un formulario.

- `DynamicRelations` acepta `embedOnly`: filtra por `RelationMeta.embed` (nuevo, servido por el kernel). Lo pasan los dos modales — el de registro y el de acción. La página de detalle autónoma sigue mostrando todas las relaciones.
- `RelationMeta.embed?: boolean` en los tipos; ausente = no embebe (tolera kernels que aún no lo sirven).
- `OneToManyRelation` pagina server-side (`page`/`per_page`, 25 por página) con scroll infinito, buscador server-side (`search`, con debounce), contador "cargadas de total" y scroll propio acotado en alto.
