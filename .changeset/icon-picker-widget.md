---
'@asteby/metacore-runtime-react': minor
---

Nuevo widget de formulario `icon` (IconPickerField): buscador de íconos lucide con grid y preview, más un modo Imagen que delega en UploadField. El valor almacenado sigue siendo un string retrocompatible (nombre lucide o url/path). Las celdas `image` y los thumbnails de opciones ahora reconocen nombres lucide (PascalCase o kebab, ej. "credit-card") y renderizan el glifo en vez de un `<img>` roto.
