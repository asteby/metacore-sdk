---
'@asteby/metacore-ui': minor
---

`ActionBar`, `PageShell` y `BackLink` en `@asteby/metacore-ui/shared`, y `PageHeader` móvil (PR S-2 del plan UI/UX móvil). `ActionBar` deja una sola primaria, colapsa las secundarias en «⋯» por ancho medido (`ResizeObserver`) con `maxVisible` como tope, abre el «⋯» como bottom sheet bajo `md` y manda las destructivas al final del menú, en rojo y con confirmación. `PageHeader` se acomoda por container query (`@md`), suma `leading`, `subtitle` y `titleKind='identifier'` (una línea con `truncate`); los títulos de texto ahora envuelven en vez de truncarse. El botón de cerrar de `Sheet` gana área táctil de 44px con `pointer: coarse`. Se exporta el planificador puro `planActionBar` para los adaptadores (S-4).
