---
'@asteby/metacore-runtime-react': patch
---

Pro datetime columns: `datetime`/`timestamp`/`timestamptz` columns now use the
date cell renderer instead of falling through to the raw-ISO fallback. Datetime
variants show day + time with a full-precision tooltip on hover (the 7Leguas
pattern); plain `date` columns stay day-only. Null and the Go zero-time render
an em-dash. Date-typed columns (including the timestamp variants) now infer the
`date_range` filter. Adds a pure `formatDateCell` helper (+ tests).
