---
"@asteby/metacore-ui": patch
---

fix(sidebar): only the most-specific sibling highlights on a filtered view

Two nav items over the same model — a bare one (`/m/transfers`) and a per-status
one (`?f_status=eq:completed`) — both lit up on a filtered URL, because a
filter-less item matches on path alone (so a manual filter keeps the base lit).
New `resolveActiveItemUrls` breaks the tie among siblings: when a sibling
declares exactly the active filter it wins and the bare item is not highlighted,
while manual filtering (no sibling declares it) still lights the base.
