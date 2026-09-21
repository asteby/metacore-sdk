---
'@asteby/metacore-runtime-react': patch
---

DynamicTable: un 403 en el endpoint de lista ya no se enmascara como "No se encontraron resultados"; muestra "Sin permiso para ver este módulo" (i18n `dynamic.forbidden_title` / `dynamic.forbidden_hint`) sin disparar refetch.
