---
'@asteby/metacore-theme': minor
'@asteby/metacore-maps': patch
---

Fondo de logos por colores dominantes (el blanco de un logo no claro es «papel», y el oscuro solo gana el desempate por >= 0.5): `imageTone` devuelve `lightShare` / `darkShare` / `midShare` y `dominant`; nueva regla única `logoBacking` (logo claro: marca u oscuro; oscuro, de color o multicolor: placa clara con anillo de la marca; la marca solo es fondo si separa todos los colores dominantes). Corrige logos de dos colores (ProtekAuto: naranja sobre naranja). Vectores `logo-backing-vectors.json` para el espejo Go. Maps pinta el anillo de marca sobre la placa.
