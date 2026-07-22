---
'@asteby/metacore-runtime-react': patch
---

DynamicTable: los avatares con key anidada (`user.avatar`) ahora aplican el `basePath` declarado en la columna también en la rama del sibling — antes los filenames pelados (`"2.png"`) se devolvían crudos y la imagen nunca cargaba. Contrato unificado y exportado como `resolveAvatarSrc`: URL absoluta y ruta rooted pasan intactas; filename pelado se prefija con `apiBaseUrl + basePath`.
