---
"@asteby/metacore-runtime-react": patch
---

fix(dynamic-table): stop infinite URL replaceState loop on filtered deep-links

The host router re-serializes the query string in its own canonical form
(different key order, percent-encoded operator colons) than the table writes,
so the raw-string comparison never matched and the table's write effect fought
the router's re-serialize forever ("Throttling navigation…" + React #185),
hanging any filtered sidebar view (e.g. `f_status=eq:reception`). Both URL-sync
effects now compare an order/encoding-independent fingerprint and the write is
skipped when semantically a no-op.
