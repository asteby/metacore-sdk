---
'@asteby/metacore-runtime-react': patch
---

ViewValue: render structured jsonb values (objects/arrays without a label/name/title) as readable key→value pairs instead of "[object Object]" — e.g. a `fiscal_data` jsonb column on the record detail page. Plain objects become a humanized key/value list, primitive arrays a comma-joined line, nested structures a pretty-printed JSON block; empty structures render the "—" empty marker.
