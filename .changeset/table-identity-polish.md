---
"@asteby/metacore-ui": patch
"@asteby/metacore-runtime-react": patch
---

Table identity polish: initials skip separator tokens ("local · c967abad" → "LC", not "L·"); rounded (logo) avatar cells use object-contain so wide logos are not cropped; the sticky Acciones column paints an opaque background so chips no longer bleed underneath on translucent themes.