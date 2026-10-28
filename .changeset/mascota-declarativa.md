---
'@asteby/metacore-app-providers': minor
---

Mascota declarativa: nueva skin neutra `hex-navy` (marco hexagonal) con `MASCOT_SKIN_ALIASES` que mantiene `gobi-navy` como alias (las orgs con ese valor guardado siguen igual; se avisa una vez en desarrollo). `MascotSkin` gana `id?` y `face?: { stroke, strokeWidth, treadDot }`, `<Mascot skin>` acepta un id o una skin inline, y se exportan `registerMascotSkin` e `isValidSkin`. Una skin con `name` vacío o inválida cae a la skin por defecto.
