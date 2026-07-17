---
"@asteby/metacore-runtime-react": patch
---

fix(table): stop infinite reload loop when applying a column filter

The URL-resync effect read the location's search string from a render-time
snapshot, which lagged one commit behind the sibling write effect's imperative
`history.replaceState` (that write does not re-render). Applying any column
filter (e.g. the "Almacén" facet on /m/stock) made the resync misread its own
write as an external change, reset the filters, and ping-pong `{k:[v]} <-> {}`
every render — spinning the infinite-scroll fetch forever. The resync now reads
`window.location.search` fresh inside the effect, so a self-write is recognized
and skipped; only genuine external rewrites (sidebar deep-links, back/forward)
are adopted. Also lifts the pagination reset out of the `setDynamicFilters`
updater.
