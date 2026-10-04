---
"@asteby/metacore-ui": patch
---

`loadGlyph` ya no revienta con «Cannot read properties of undefined (reading '__iconData')» cuando el chunk de un glifo da 404 y el import resuelve `undefined`: devuelve `null` y se reintenta en la siguiente visita.
