---
"@asteby/metacore-runtime-react": patch
---

fix(table): las listas en infinite-scroll recargan al bumpear refreshTrigger

El efecto de recarga de la tabla en modo infinite-scroll omitía `refreshTrigger` de sus deps (aunque el comentario decía que lo respetaba), así que tras crear/editar/eliminar en la página la lista infinita no se recargaba ("a veces no recarga la tabla"). Se añade `refreshTrigger` a las deps para igualar el path clásico.
