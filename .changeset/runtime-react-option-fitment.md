---
"@asteby/metacore-runtime-react": minor
---

Pickers honour the manifest column `option_fitment` (`{ subject_field, subject_model, target_model, mode }`): the options of a relation picker are checked against a subject chosen in another field of the same form (a document header, a sibling field) with the organization's fitment rules (`useFitment`), and flagged «Compatible» / «No compatible» (default) or hidden (`filter`). Wired into `useOptionsResolver` (new `fitment` / `fitmentSubjectId` args), `DynamicSelectField`, the flat form's `RefSelect` and the line-items cell, so any model declares it with no custom code. A column without it, a form without a chosen subject, or a subject with no rules for the target behaves exactly as before. New exports: `getOptionFitment`, `resolveFitmentSubjectId`, `applyOptionFitment`, `useOptionFitment`.
