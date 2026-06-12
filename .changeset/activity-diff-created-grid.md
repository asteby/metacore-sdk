---
'@asteby/metacore-runtime-react': patch
---

ActivityDiff: created/deleted events render as a true two-column grid (Campo + Valor) — the old layout emitted a placeholder cell plus a col-span-2 value into a 3-column grid, overflowing the row so the value wrapped below its label. RecordHistory gains `moduleLabel` so the event-header badge can show the localized model title (e.g. "Clientes") instead of the raw addon_key.
