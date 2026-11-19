---
'@asteby/metacore-theme': minor
'@asteby/metacore-ui': minor
'@asteby/metacore-maps': minor
---

Contraste dinámico WCAG: primitivo único `onColor` / `pickBacking` / `ensureContrast` / `imageTone` (+ hooks) en `@asteby/metacore-theme`, tokens `--tone-*` / `--on-tone-*` con prueba de pares, vectores de conformidad compartidos con el kernel Go. `Badge` acepta `color` de runtime. Maps: texto de burbujas y chips con `onColor` (antes blanco sobre rosa/ámbar), avatar de logo elige fondo según el tono del logo (logo blanco sobre color de marca) y usa píldora para logos apaisados, etiquetas del mapa oscuro elevadas a ≥ 4.5:1, y la lista del panel de área llena todo el alto del panel (sin max-height fijo) con sombras de scroll.
