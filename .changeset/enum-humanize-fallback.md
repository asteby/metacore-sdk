---
'@asteby/metacore-runtime-react': patch
---

Humanize unmatched enum/status/option tokens as a scalable fallback. When a
column value has no matching declared `option`, dynamic cells (table, record
detail, relation rows) now render a humanized label (`in_progress` → "In
Progress", `pos` → "POS") instead of the raw token. A matched `option.label`
(the addon-localized source of truth) still wins; this only affects the
previously-raw fallback.
