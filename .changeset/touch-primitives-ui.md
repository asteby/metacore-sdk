---
"@asteby/metacore-ui": minor
---

Primitivos táctiles sin marca en `@asteby/metacore-ui/touch`: `VirtualKeyboard` (layouts `text`, `numeric`, `email`, con shift, teclas ≥60 px y accesible), `TouchButton`, `TouchGrid` con target mínimo configurable, y los hooks `useIdleReset(seconds, warnSeconds, onReset)` y `useWakeLock`. Leen `--touch-min-target` y `--touch-font-scale` de `@asteby/metacore-theme/touch`.
