---
"@asteby/metacore-runtime-react": patch
---

fix(runtime-react): "Creado por" vacío muestra Sistema también con type avatar

La columna autoinyectada del host usa `key: created_by.avatar` + `type: avatar`;
el fallback Sistema solo corría para `cellStyle: creator` y la celda quedaba en N/A.
