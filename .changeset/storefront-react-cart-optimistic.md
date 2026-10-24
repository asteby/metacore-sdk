---
"@asteby/storefront-react": minor
---

storefront-react/cart: agregado optimista en el cajón del carrito. `cartOptimistic` (`add`/`confirm`/`rollback`/`discard`), `useOptimisticAdd(fetcher)` para React Router, `useOptimisticCart`, `useOptimisticCartCount`, `describeAddFailure` y `optimisticLabels` en `CartDrawer`: la fila aparece al instante («Agregando…»), el cajón se abre sin robar el foco y, si falla, se revierte con el aviso «No pudimos agregar X: motivo». Precios y totales siguen siendo solo de OPS.
