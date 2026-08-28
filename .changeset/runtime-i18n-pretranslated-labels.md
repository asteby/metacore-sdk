---
"@asteby/metacore-runtime-react": patch
---

Skip i18next lookup for labels that are already localized plain text
(no `.` in the string). Hosts often translate metadata on the backend, so
re-running `t("Timbrar CFDI")` only produced `missingKey` noise. Dotted
keys like `fiscal_mexico.action.stamp_fiscal.label` still go through `t()`.
Applied in row actions, toolbar actions, and action modals/confirms.
