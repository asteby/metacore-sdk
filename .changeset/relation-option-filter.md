---
"@asteby/metacore-runtime-react": minor
---

Filtro de opciones en selectores de relación: el campo (columna o campo de acción) acepta `option_filter` / `optionFilter` (una regla o lista con `field` y `equals` / `not_equals` / `in` / `not_in`) para ocultar opciones, p. ej. facturas con status `cancelada` en el selector de abonos (PIT-059). Se aplica en cliente sobre las columnas extra que devuelve `/options`, nunca oculta la selección actual y es retrocompatible (sin la propiedad no cambia nada). Nuevos exports: `getOptionFilter`, `applyOptionFilter`, `optionPassesRule`, tipos `OptionFilter` y `OptionFilterRule`; `useOptionsResolver` acepta `optionFilter` y `keepValue`.
