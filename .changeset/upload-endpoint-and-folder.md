---
'@asteby/metacore-runtime-react': patch
---

Subida de imágenes arreglada: el UploadField posteaba a `/uploads` (el host
sirve `/upload`) → 404. Además el subfolder declarado por campo
(`storage_path` en el manifest) ahora se manda también como `folder`, que es
el parámetro que lee el host — antes toda subida caía en la carpeta por
defecto.
