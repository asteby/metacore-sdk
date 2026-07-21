---
'@asteby/metacore-ui': patch
'@asteby/metacore-runtime-react': patch
---

Avatares de referencia con esquina visible: `rounded-sm` (2px) a 24px se percibe
como círculo; pasa a `rounded-md` en la inicial (`InitialsAvatar`) y en el thumb
de imagen (`RelationThumbnail`), para que imagen e inicial lean como cuadrado
redondeado. `rounded='full'` queda para avatares de persona/marca.
