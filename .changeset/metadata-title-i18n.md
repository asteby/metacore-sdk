---
"@asteby/metacore-runtime-react": minor
---

`useModelLabels`/`resolveModelLabels`: el titulo de la pagina, el nombre singular y la etiqueta del boton Crear de `DynamicCRUDPage` se resuelven por i18n desde el modelo (`models.<model>.title|singular|new`, `titleKey` de metadata, prefijo `common.new`), overridables por el host; sin claves, el comportamiento anterior no cambia. `TableMetadata` gana `titleKey`/`title_key` opcionales.
