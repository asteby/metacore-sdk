---
"@asteby/metacore-runtime-react": minor
---

AddonConfigSurface: secret credential fields gain Generar (crypto.getRandomValues, honours the `validation: "min_length:N"` hint), Copiar, Rotar with confirmation, a strength bar and live min-length validation that blocks Guardar. Long field help splits into a short lead plus a collapsible «Cómo se usa». The header shows the addon logo (new `logo` prop, `object-contain`), version and configured state. Closing with unsaved changes asks before discarding. No manifest/schema change: `validation` is an existing credential hint.
