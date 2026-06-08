---
"@asteby/metacore-runtime-react": minor
---

Record dialog date fields use the real shadcn Calendar (react-day-picker) from
`@asteby/metacore-ui` instead of the dependency-free native `<input type="date">`
shim, and match datetime/timestamp(tz) types too. Empty/Go-zero dates
(0001-01-01) now show the "Seleccionar fecha" placeholder instead of
"31 de diciembre de 1".
