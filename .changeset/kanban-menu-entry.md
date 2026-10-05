---
"@asteby/metacore-runtime-react": patch
---

Kanban: el menú «…» de la tarjeta ya no tira la app con «`MenuItem` must be used within `Menu`». El `DropdownMenu` de la tarjeta se importa ahora desde la entrada raíz de `@asteby/metacore-ui`, la misma de `RowActionMenuItem`. Así no se mezclan dos contextos de Radix cuando el host comparte la raíz por Module Federation y empaqueta `/primitives` aparte. Se agrega un test que lo vigila.
