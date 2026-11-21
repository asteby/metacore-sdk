---
"@asteby/metacore-runtime-react": minor
---

Add `useFitment` and pure fitment matching (`fitFor`, `targetsForSubject`, `rulesForSubject`, `matchesSpec`) over the org's `FitmentRule` rows (addon `catalog_fitment`): a subject (vehicle, device, machine) with attributes → the targets that fit (tire sizes, consumables, spare parts), with scalar / set / range attribute specs. No industry vocabulary: model names and attribute keys are data. Also adds `useOptionalApi()` (the ApiProvider client or `null`).
