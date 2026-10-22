---
'@asteby/metacore-runtime-react': patch
---

Columnas de imagen (`display: "image_stack"` y `type: image`): si el host reescribe el `src` de la `<img>` al fallar (respaldo miniatura -> derivado principal de ops), el SDK ya no marca la imagen como rota ni cae a iniciales; solo lo hace cuando el fallo no tiene respaldo. En `image_stack` la URL ahora pasa por `resolveImageSrc` igual que `type: image` (`/storage/...` y http(s) intactos, `base_path` respetado).
