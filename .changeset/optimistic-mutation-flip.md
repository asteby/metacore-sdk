---
"@asteby/metacore-runtime-react": minor
"@asteby/metacore-theme": minor
---

`useOptimisticMutation` (runtime-react): escritura optimista sobre una entrada de caché de TanStack Query con rollback al último valor confirmado, escrituras serializadas por `queryKey` (el último clic es la última escritura), descarte de dobles clics, `debounceMs` para ráfagas (arrastrar y soltar) con flush al desmontar, `reconcile` para escribir la respuesta del servidor sin refetch y `retry()` para el toast "Reintentar".

`useFlipAnimation` (runtime-react): animación FLIP de reordenamiento de cualquier lista (Web Animations API sobre `transform`), con snapshots en reposo fuera del render y respeto a `prefers-reduced-motion`.

Tokens de motion (theme): `motionTokens` y variables `--motion-duration-{instant,fast,moderate,slow}` / `--motion-ease-{standard,emphasized,exit}` en `tokens.css` (duraciones en 0 con `prefers-reduced-motion: reduce`). runtime-react los lee con `motionDuration()` / `motionEasing()` y cae a los mismos valores si el host no los define.
