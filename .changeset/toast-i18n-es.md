---
'@asteby/metacore-runtime-react': patch
---

Localiza los toasts de CRUD estándar (eliminar, crear, actualizar, borrado masivo, subida de imagen) al español vía i18n con `defaultValue`, en lugar de mostrar el `message` en inglés que devuelve el backend. Los mensajes de acciones declarativas de addons ahora pasan por `t()` por si son claves i18n.
