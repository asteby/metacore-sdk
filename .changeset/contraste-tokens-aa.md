---
"@asteby/metacore-theme": minor
"@asteby/metacore-app-providers": minor
---

Contraste WCAG AA garantizado en los tokens.

- `@asteby/metacore-theme`: nuevo módulo `contrast` (`contrastRatio`, `composite`, `flatten`, `ensureContrast`, `mostReadable`, `parseColor`) exportado también en `@asteby/metacore-theme/contrast`. Tokens claros/oscuros/glass ajustados para AA: `--primary`, `--accent-foreground`, `--destructive`, `--success`/`--warning`/`--info` (texto y badge), `--input` como borde de control a 3:1, `--ring` legible al 50 % en oscuro, `--primary-foreground`/`--destructive-foreground` oscuros sobre los tonos claros del modo oscuro. Nuevos `--success-foreground`, `--warning-foreground`, `--info-foreground`, `--chart-6..8` y `--color-widget-*` (series de gráficas ≥ 3:1 en ambos modos). `preset.ts` vuelve a reflejar `tokens.css`. La prueba `tokens-contrast.test.ts` mide cada par (en glass, sobre la superficie compuesta y los extremos del degradado) y falla CI por debajo de AA.
- `@asteby/metacore-app-providers`: `applyBranding` deriva la marca con contraste garantizado: en oscuro el primario sube de luminosidad hasta 4.5:1 como texto (marcas profundas como navy o índigo ya no se pierden en el lienzo), el texto sobre el primario siempre cumple 4.5:1, el anillo de foco se calcula para 3:1 al 50 % y `--input` para 3:1. Nueva función pura `deriveBrandTokens(primary, accent, mode)`.
