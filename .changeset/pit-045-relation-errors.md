---
"@asteby/metacore-runtime-react": patch
---

DynamicRelation: una sub-tabla cuya carga falla (403/500) ya no se muestra como «No hay registros relacionados»; muestra «Sin permiso…» o un aviso de error (strings opcionales `forbiddenState` / `errorState`). La columna `tags` con objetos usa su `label`/`name`/`key` en lugar de «[object Object]» (PIT-045, PIT-049).
