---
'@asteby/metacore-ui': patch
---

Fix sidebar active-state for per-status nav entries. `checkIsActive` /
`splitHref` previously stripped ALL `f_` filter params as "transient table
state", so addon nav entries that encode their identity in an `f_` filter
(e.g. an Orders group with Reception / In Progress / Ready / Delivered each
pointing at `/m/orders?f_status=eq:<status>`) collapsed to the same path and
ALL highlighted at once. Now `f_` filters an item declares in its OWN url are
treated as its identity (must be present in the current href), while items
that declare no filter still highlight on path alone — so a manually-filtered
table keeps its base item lit. One status entry lights up at a time.
