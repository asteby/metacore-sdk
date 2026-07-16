---
"@asteby/metacore-runtime-react": patch
---

fix(dynamic-table): don't rewrite a clean filtered deep-link (no URL flicker)

Normalise the `eq:` operator when fingerprinting the query string and stop
stamping `per_page` for the plain server default, so opening/clicking a
sidebar deep-link (`f_status=eq:in_progress&view=list`) is a true no-op: the
table adopts the filter without rewriting the URL to its own spelling
(`f_status=in_progress&per_page=15`). This removes the visible URL flicker and
keeps the sidebar active-state exact-href match working.
