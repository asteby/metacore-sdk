---
'@asteby/metacore-runtime-react': minor
---

Etiquetas de modelo declaradas por el backend. `TableMetadata` acepta `singular_label`, `plural_label`, `new_label` y `gender`; `DynamicRecordDialog` arma "Crear/Editar {x}" con `models.<model>.singular` (i18n del host) > `singular_label` > `titleKey` > `title` (ya no sale "Editar Client" cuando el backend manda un `title` tecnico), y los verbos son traducibles con `dynamic.create_title|edit_title|delete_title` (`{{name}}`). `DynamicCRUDPage`/`useModelLabels` usan `singular_label`/`new_label` y el genero (`common.new_f`/`common.new_m`: "Nueva"/"Nuevo") antes de `common.new`. Nuevos exports `resolveModelNoun` y `modelVerbTitle`. Botones, descripciones y placeholders genericos del dialogo pasan por i18n (`dynamic.*`, defaults en espanol). Sin `singular_label` el comportamiento es el anterior. Semver: minor.
