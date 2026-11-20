---
"@asteby/metacore-runtime-react": minor
---

Celdas `initial`/`initials` y `avatar` sin imagen: iniciales con color estable por texto (mismo hash que el resto de avatares) y sin peticion de red. `resolveAvatarSrc` ya no convierte una etiqueta (p. ej. el nombre enviado en `avatar`) en una URL, lo que provocaba un 404 por fila; nuevo helper `looksLikeImageRef`.
