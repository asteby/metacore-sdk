---
'@asteby/metacore-lib': patch
---

Fix: `dist/envelope.js` (and index, errors, pricing) se publicaban con imports relativos sin extension (`'./error-catalog'`) y el JSON del catalogo sin `with { type: 'json' }`; Node ESM (vitest, SSR) no los resolvia. El fuente usa ahora `.js` explicito. Nuevo chequeo `scripts/check-dist-esm-imports.mjs` (CI y `pnpm test` de lib).
