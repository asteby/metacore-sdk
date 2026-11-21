---
'@asteby/metacore-theme': minor
---

`tones.css` (también dentro de `index.css`, y suelto como `@asteby/metacore-theme/tones.css`): derivadas de tono `--tone-{muted,brand,success,warning,danger,info}-{soft,border,text}` con colores Tailwind `bg-tone-*`, categórico fijo `--viz-1..6` y secuencial `--viz-seq-1..5` (validados con CVD y contraste en claro y oscuro), y superficies en capas `--surface-*` con las utilidades `dash-surface`, `dash-surface-hover`, `dash-glow` y `dash-inset`, derivadas del gris del tema (`--card`/`--foreground`), no de `--primary`.
