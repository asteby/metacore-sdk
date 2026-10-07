---
'@asteby/metacore-runtime-react': minor
---

Las columnas `type: 'image'` respetan `col.basePath` (o `styleConfig.base_path`) con el mismo contrato que `resolveAvatarSrc`: URL absoluta y ruta con `/` intactas; un filename suelto se resuelve como `apiBaseUrl + basePath + filename`. Sin `basePath` el comportamiento no cambia. Nuevo helper opcional `normalizeImagePath(raw, col)` en `DynamicColumnsHelpers` (se aplica antes de resolver) y export de `resolveImageSrc`.
