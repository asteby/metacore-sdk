---
'@asteby/metacore-lib': minor
---

`pricing`: derivación y redondeo de precios por mercado (`roundPrice`, `derivePrice`, `validateRoundingRule`, `pricingErrorCode`), gemelo exacto (bigint, sin `number`) de `shared/pricederive` de addons. Regla `{increment, ending, direction}` por conjunto de candidatos (`up` ≥ x, `down` ≤ x, `nearest` con empate arriba): corrige la fórmula del ADR §6.3 (93.995 con `.99 up` = 94.99). Vectores `src/__fixtures__/pricing.golden.json` = copia byte a byte del Go, fijada por sha256. Nueva entrada `@asteby/metacore-lib/pricing`.
